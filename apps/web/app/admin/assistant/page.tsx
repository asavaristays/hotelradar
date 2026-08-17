"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import {
  adminAssistantChat,
  adminCheckGrounding,
  adminListAssistantTools,
  adminRunAssistantTool,
} from "../../../lib/adminApi";

type Bubble = { role: "user" | "assistant" | "system"; text: string };

export default function AdminAssistantPage() {
  const [tools, setTools] = useState<Array<Record<string, unknown>>>([]);
  const [prompt, setPrompt] = useState("");
  const [promptVersion, setPromptVersion] = useState<string | null>(null);
  const [promptEditable, setPromptEditable] = useState(false);
  const [openai, setOpenai] = useState<{ configured: boolean; model: string } | null>(null);
  const [toolName, setToolName] = useState("get_area_notes");
  const [argsJson, setArgsJson] = useState('{"belt":"morjim"}');
  const [result, setResult] = useState<string>("");
  const [usedTools, setUsedTools] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [grounding, setGrounding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [oppId, setOppId] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    adminListAssistantTools()
      .then((d) => {
        setTools(d.tools);
        setPrompt(d.system_prompt);
        setPromptVersion(d.system_prompt_version ?? null);
        setPromptEditable(Boolean(d.system_prompt_editable));
        setOpenai(d.openai ?? null);
        if (d.tools[0]?.name) setToolName(String(d.tools[0].name));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <AdminShell title="Assistant">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-panel">
        <h2>OpenAI chat</h2>
        <p className="meta">
          {openai?.configured
            ? `Model ${openai.model} · tools + grounding on`
            : "OPENAI_API_KEY missing — set in /etc/hotelradar-direct/env and redeploy"}
        </p>
        <div className="admin-filters wrap" style={{ marginBottom: 10 }}>
          <input
            value={oppId}
            onChange={(e) => setOppId(e.target.value)}
            placeholder="Optional OPP-… to bind transcript"
            className="mono"
            style={{ minWidth: 220 }}
          />
          {sessionKey ? (
            <span className="meta mono">session {sessionKey}</span>
          ) : null}
        </div>
        <ul className="admin-events" style={{ maxHeight: 280, overflow: "auto" }}>
          {bubbles.map((b, i) => (
            <li key={i}>
              <strong>{b.role}</strong> · {b.text}
            </li>
          ))}
          {!bubbles.length ? <li className="meta">Ask about Goa stays, belts, or a rate.</li> : null}
        </ul>
        <div className="admin-filters wrap" style={{ marginTop: 10 }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Message the assistant…"
            style={{ minWidth: 320, flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !chatInput.trim() || !openai?.configured}
            onClick={() =>
              void (async () => {
                const msg = chatInput.trim();
                setBusy(true);
                setError(null);
                setBubbles((prev) => [...prev, { role: "user", text: msg }]);
                setChatInput("");
                try {
                  const out = await adminAssistantChat({
                    message: msg,
                    opportunity_id: oppId.trim() || undefined,
                    session_key: sessionKey || undefined,
                  });
                  if (out.session_key) setSessionKey(out.session_key);
                  setUsedTools((prev) => Array.from(new Set([...prev, ...out.tools_used])));
                  setBubbles((prev) => [...prev, { role: "assistant", text: out.reply }]);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Chat failed");
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Send
          </button>
        </div>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>System prompt (rails)</h2>
        <p className="meta">
          Version <span className="mono">{promptVersion ?? "—"}</span>
          {promptEditable ? "" : " · read-only (ship via code release)"}
        </p>
        <pre className="meta" style={{ whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>
          {prompt.slice(0, 1000)}
          {prompt.length > 1000 ? "…" : ""}
        </pre>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Run tool directly</h2>
        <div className="admin-filters wrap">
          <select value={toolName} onChange={(e) => setToolName(e.target.value)}>
            {tools.map((t) => (
              <option key={String(t.name)} value={String(t.name)}>
                {String(t.name)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const args = JSON.parse(argsJson) as Record<string, unknown>;
                  const out = await adminRunAssistantTool(toolName, args);
                  setResult(JSON.stringify(out.result, null, 2));
                  setUsedTools((prev) =>
                    prev.includes(toolName) ? prev : [...prev, toolName]
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Tool failed");
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Run
          </button>
        </div>
        <textarea
          value={argsJson}
          onChange={(e) => setArgsJson(e.target.value)}
          rows={4}
          style={{ width: "100%", marginTop: 8, fontFamily: "ui-monospace, monospace" }}
        />
        {result ? (
          <pre className="meta" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {result}
          </pre>
        ) : null}
        <p className="meta" style={{ marginTop: 8 }}>
          Tools used: {usedTools.join(", ") || "none"}
        </p>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Grounding check</h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Draft assistant reply…"
          style={{ width: "100%" }}
        />
        <button
          type="button"
          style={{ marginTop: 8 }}
          disabled={busy || !draft.trim()}
          onClick={() =>
            void (async () => {
              setBusy(true);
              try {
                const g = await adminCheckGrounding(draft, usedTools);
                setGrounding(g.ungrounded ? "UNGROUNDED — blocked" : "OK — grounded");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Check failed");
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          Check grounding
        </button>
        {grounding ? <p style={{ marginTop: 8 }}>{grounding}</p> : null}
      </div>
    </AdminShell>
  );
}
