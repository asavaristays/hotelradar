/**
 * OpenAI chat loop with HotelRADAR tools + grounding guard.
 * API key from env only — never hardcode.
 */

import { SYSTEM_PROMPT, TOOLS, isUngrounded } from "@hotelradar/direct-shared";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { runAssistantTool } from "./assistantTools.js";

type ChatRole = "system" | "user" | "assistant" | "tool";

type OpenAiMessage = {
  role: ChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

function toOpenAiTools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

async function resolveOppUuid(externalId?: string | null): Promise<string | null> {
  if (!externalId) return null;
  const opp = await pool.query(
    `SELECT id FROM opportunities WHERE external_opportunity_id = $1`,
    [externalId]
  );
  return opp.rows[0]?.id ?? null;
}

async function loadHistory(opts: {
  opportunityUuid: string | null;
  sessionKey: string | null;
  limit?: number;
}): Promise<OpenAiMessage[]> {
  const limit = opts.limit ?? 40;
  let result;
  if (opts.opportunityUuid) {
    result = await pool.query(
      `SELECT role, content, tool_calls FROM chat_messages
       WHERE opportunity_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [opts.opportunityUuid, limit]
    );
  } else if (opts.sessionKey) {
    result = await pool.query(
      `SELECT role, content, tool_calls FROM chat_messages
       WHERE session_key = $1 AND opportunity_id IS NULL
       ORDER BY created_at DESC LIMIT $2`,
      [opts.sessionKey, limit]
    );
  } else {
    return [];
  }

  const chronological = [...result.rows].reverse();
  const messages: OpenAiMessage[] = [];
  for (const row of chronological) {
    const role = String(row.role) as "user" | "assistant" | "tool";
    if (role === "tool") {
      const meta = Array.isArray(row.tool_calls) ? row.tool_calls[0] : null;
      messages.push({
        role: "tool",
        name: meta && typeof meta === "object" && "name" in meta ? String(meta.name) : "tool",
        tool_call_id:
          meta && typeof meta === "object" && "id" in meta
            ? String((meta as { id: unknown }).id)
            : "tool",
        content: String(row.content),
      });
    } else {
      messages.push({ role, content: String(row.content) });
    }
  }
  return messages;
}

async function persist(input: {
  externalId?: string | null;
  opportunityUuid?: string | null;
  sessionKey?: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: unknown[];
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  let oppId = input.opportunityUuid ?? null;
  if (!oppId && input.externalId) {
    oppId = await resolveOppUuid(input.externalId);
  }

  // Assistant grounding: soft-check for LLM path (rewrite handled by caller)
  if (input.role === "assistant") {
    // skip hard throw — LLM path may retry; still store after guard
  }

  const result = await pool.query(
    `INSERT INTO chat_messages (
       opportunity_id, session_key, role, content, tool_calls, tokens_in, tokens_out
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     RETURNING *`,
    [
      oppId,
      input.sessionKey ?? null,
      input.role,
      input.content,
      JSON.stringify(input.toolCalls ?? []),
      input.tokensIn ?? null,
      input.tokensOut ?? null,
    ]
  );
  return result.rows[0];
}

async function callOpenAi(messages: OpenAiMessage[]): Promise<{
  message: OpenAiMessage;
  usage: { prompt_tokens?: number; completion_tokens?: number };
}> {
  if (!config.openai.apiKey) {
    throw Object.assign(new Error("OPENAI_API_KEY not configured"), { status: 503 });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.3,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: toOpenAiTools(),
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(
      new Error(`OpenAI error ${res.status}: ${body.slice(0, 400)}`),
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    choices: Array<{ message: OpenAiMessage }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = data.choices[0]?.message;
  if (!message) throw Object.assign(new Error("Empty OpenAI response"), { status: 502 });
  return { message, usage: data.usage ?? {} };
}

export async function runLlmTurn(input: {
  message: string;
  externalId?: string | null;
  sessionKey?: string | null;
  maxToolRounds?: number;
}) {
  const opportunityUuid = await resolveOppUuid(input.externalId ?? null);
  const sessionKey = input.sessionKey?.trim() || (!opportunityUuid ? `ops-${Date.now()}` : null);
  const maxRounds = input.maxToolRounds ?? 6;

  const history = await loadHistory({ opportunityUuid, sessionKey });
  await persist({
    externalId: input.externalId,
    opportunityUuid,
    sessionKey,
    role: "user",
    content: input.message,
  });

  const messages: OpenAiMessage[] = [...history, { role: "user", content: input.message }];
  const toolsUsed: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds += 1;
    const { message, usage } = await callOpenAi(messages);
    tokensIn += usage.prompt_tokens ?? 0;
    tokensOut += usage.completion_tokens ?? 0;

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function.name;
        toolsUsed.push(name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        let result: unknown;
        try {
          const ran = await runAssistantTool(name, args);
          result = ran.result;
        } catch (error) {
          result = {
            error: error instanceof Error ? error.message : String(error),
          };
        }

        const payload = JSON.stringify(result);
        await persist({
          externalId: input.externalId,
          opportunityUuid,
          sessionKey,
          role: "tool",
          content: payload,
          toolCalls: [{ id: call.id, name }],
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: payload,
        });
      }
      continue;
    }

    let text = String(message.content ?? "").trim();
    if (!text) text = "I need a bit more detail to help — what dates and area are you looking at?";

    if (isUngrounded(text, toolsUsed)) {
      // One retry with a hard correction
      messages.push({
        role: "assistant",
        content: text,
      });
      messages.push({
        role: "user",
        content:
          "SYSTEM: Your last reply stated a price without a grounding tool result. Rewrite without inventing prices. Use tools or say you do not have a rate on file.",
      });
      const retry = await callOpenAi(messages);
      tokensIn += retry.usage.prompt_tokens ?? 0;
      tokensOut += retry.usage.completion_tokens ?? 0;
      text = String(retry.message.content ?? text).trim();
      if (isUngrounded(text, toolsUsed)) {
        text =
          "I do not have a confirmed private rate on file for that yet. Share dates and I can pull from the rate sheet or ask the hotel.";
      }
    }

    const saved = await persist({
      externalId: input.externalId,
      opportunityUuid,
      sessionKey,
      role: "assistant",
      content: text,
      toolCalls: toolsUsed.map((name) => ({ name })),
      tokensIn,
      tokensOut,
    });

    return {
      reply: text,
      tools_used: toolsUsed,
      session_key: sessionKey,
      opportunity_id: input.externalId ?? null,
      message: saved,
      usage: { tokens_in: tokensIn, tokens_out: tokensOut },
      openai: { model: config.openai.model, configured: true },
    };
  }

  throw Object.assign(new Error("Tool loop exceeded max rounds"), { status: 502 });
}

export function openaiStatus() {
  return {
    configured: Boolean(config.openai.apiKey),
    model: config.openai.model,
  };
}
