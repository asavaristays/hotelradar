import { pool, withTransaction } from "../db/pool.js";
import { prisma } from "../db/prisma.js";

export async function listHotelContacts(hotelId: string) {
  const result = await pool.query(
    `SELECT * FROM hotel_contacts
     WHERE hotel_id = $1 AND archived_at IS NULL
     ORDER BY is_primary DESC, role, name`,
    [hotelId]
  );
  return result.rows;
}

export async function createHotelContact(input: {
  hotelId: string;
  role: string;
  name: string;
  phone_e164: string;
  is_primary?: boolean;
  active_from_hour?: number;
  active_to_hour?: number;
}) {
  return withTransaction(async (client) => {
    if (input.is_primary) {
      await client.query(
        `UPDATE hotel_contacts SET is_primary = FALSE WHERE hotel_id = $1`,
        [input.hotelId]
      );
    }
    const result = await client.query(
      `INSERT INTO hotel_contacts (
         hotel_id, role, name, phone_e164, is_primary, active_from_hour, active_to_hour
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.hotelId,
        input.role,
        input.name,
        input.phone_e164,
        !!input.is_primary,
        input.active_from_hour ?? 0,
        input.active_to_hour ?? 24,
      ]
    );
    return result.rows[0];
  });
}

export async function upsertGuestFromMobile(input: {
  phone: string;
  name?: string | null;
  email?: string | null;
}) {
  const phone = input.phone.replace(/\s+/g, "");
  const result = await pool.query(
    `INSERT INTO guests (phone_e164, name, email)
     VALUES ($1,$2,$3)
     ON CONFLICT (phone_e164) DO UPDATE
     SET name = COALESCE(EXCLUDED.name, guests.name),
         email = COALESCE(EXCLUDED.email, guests.email)
     RETURNING *`,
    [phone, input.name ?? null, input.email ?? null]
  );
  return result.rows[0];
}

export async function listInvoices(hotelId?: string) {
  const rows = await prisma.invoice.findMany({
    where: hotelId ? { hotelId } : undefined,
    include: { hotel: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((i) => ({
    id: i.id,
    invoice_number: i.invoiceNumber,
    series: i.series,
    fy: i.fy,
    type: i.type,
    status: i.status,
    hotel_id: i.hotelId,
    hotel_name: i.hotel.displayName,
    period_start: i.periodStart,
    period_end: i.periodEnd,
    issue_date: i.issueDate,
    due_date: i.dueDate,
    taxable_value_paise: Number(i.taxableValuePaise),
    cgst_paise: Number(i.cgstPaise),
    sgst_paise: Number(i.sgstPaise),
    igst_paise: Number(i.igstPaise),
    total_paise: Number(i.totalPaise),
    created_at: i.createdAt,
    _orm: "prisma",
  }));
}

export async function listPayouts(status?: string) {
  const params: unknown[] = [];
  let clause = "";
  if (status) {
    params.push(status);
    clause = `WHERE p.status = $1`;
  }
  const result = await pool.query(
    `SELECT p.*, o.external_opportunity_id, h.display_name AS hotel_name
     FROM payouts p
     JOIN opportunities o ON o.id = p.opportunity_id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     ${clause}
     ORDER BY p.created_at DESC
     LIMIT 100`,
    params
  );
  return result.rows;
}

export async function settlePayout(id: string) {
  const result = await pool.query(
    `UPDATE payouts
     SET status = 'settled', settled_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!result.rowCount) throw Object.assign(new Error("Payout not found"), { status: 404 });
  return result.rows[0];
}

export async function listHotelPayoutAccounts(hotelId: string) {
  const result = await pool.query(
    `SELECT * FROM hotel_payout_accounts WHERE hotel_id = $1 ORDER BY created_at DESC`,
    [hotelId]
  );
  return result.rows;
}

export async function createPayoutAccount(input: {
  hotelId: string;
  account_holder: string;
  provider?: string;
  ifsc_last4?: string;
  account_last4?: string;
  activate?: boolean;
}) {
  const result = await pool.query(
    `INSERT INTO hotel_payout_accounts (
       hotel_id, provider, account_holder, ifsc_last4, account_last4, kyc_status, activated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      input.hotelId,
      input.provider ?? "manual_neft",
      input.account_holder,
      input.ifsc_last4 ?? null,
      input.account_last4 ?? null,
      input.activate ? "active" : "pending",
      input.activate ? new Date().toISOString() : null,
    ]
  );
  return result.rows[0];
}

export async function listWhatsAppTemplates() {
  const rows = await prisma.whatsAppTemplate.findMany({ orderBy: { key: "asc" } });
  return rows.map((t) => ({
    key: t.key,
    name: t.name,
    language: t.language,
    status: t.status,
    body_text: t.bodyText,
    category: t.category,
    approved_at: t.approvedAt,
    updated_at: t.updatedAt,
    _orm: "prisma",
  }));
}

export async function setWhatsAppTemplateStatus(
  key: string,
  status: "draft" | "submitted" | "approved" | "rejected" | "paused"
) {
  const result = await pool.query(
    `UPDATE whatsapp_templates
     SET status = $1,
         approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
         updated_at = NOW()
     WHERE key = $2
     RETURNING *`,
    [status, key]
  );
  if (!result.rowCount) throw Object.assign(new Error("Template not found"), { status: 404 });
  return result.rows[0];
}

export async function listBeltNotes(belt?: string) {
  const params: unknown[] = [];
  let clause = "WHERE active = TRUE";
  if (belt) {
    params.push(belt.trim().toLowerCase());
    clause += ` AND lower(belt) = $1`;
  }
  const result = await pool.query(
    `SELECT * FROM belt_notes ${clause} ORDER BY belt, kind`,
    params
  );
  return result.rows;
}

export async function createBeltNote(input: {
  belt: string;
  kind: string;
  note: string;
  months_applicable?: number[];
}) {
  const belt = input.belt.trim().toLowerCase();
  const result = await pool.query(
    `INSERT INTO belt_notes (belt, kind, note, months_applicable)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [belt, input.kind, input.note.trim(), input.months_applicable ?? []]
  );
  return result.rows[0];
}

export async function listHotelMedia(hotelId: string) {
  const result = await pool.query(
    `SELECT * FROM hotel_media
     WHERE hotel_id = $1 AND archived_at IS NULL
     ORDER BY sort_order, uploaded_at`,
    [hotelId]
  );
  return result.rows;
}

export async function addHotelMedia(input: {
  hotelId: string;
  kind: string;
  url: string;
  room_type?: string;
  thumb_url?: string;
  caption?: string;
  sort_order?: number;
}) {
  const result = await pool.query(
    `INSERT INTO hotel_media (hotel_id, room_type, kind, url, thumb_url, caption, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      input.hotelId,
      input.room_type ?? null,
      input.kind,
      input.url,
      input.thumb_url ?? null,
      input.caption ?? null,
      input.sort_order ?? 0,
    ]
  );
  return result.rows[0];
}
