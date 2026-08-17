/**
 * Gapless GST invoice numbering via row-locked sequence (pg).
 * Port of Downloads/files-5/invoicing.ts without Prisma.
 */

import {
  financialYear,
  formatInvoiceNumber,
} from "@hotelradar/direct-shared";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../db/pool.js";

export type SupplierIdentity = {
  gstin: string;
  legalName: string;
  address: string;
};

export async function nextInvoiceNumber(
  client: PoolClient,
  series: string,
  fy: string
): Promise<string> {
  const rows = await client.query<{ last_number: string }>(
    `INSERT INTO invoice_sequences (series, fy, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (series, fy)
     DO UPDATE SET last_number = invoice_sequences.last_number + 1
     RETURNING last_number`,
    [series, fy]
  );
  return formatInvoiceNumber(series, fy, BigInt(rows.rows[0].last_number));
}

export async function generateWeeklyInvoice(params: {
  hotelId: string;
  periodStart: Date;
  periodEnd: Date;
  supplier: SupplierIdentity;
  issueDate?: Date;
  paymentTermDays?: number;
}) {
  const issueDate = params.issueDate ?? new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + (params.paymentTermDays ?? 7));
  const fy = financialYear(issueDate);

  return withTransaction(async (client) => {
    const hotelRes = await client.query(`SELECT * FROM hotels WHERE id = $1`, [params.hotelId]);
    const hotel = hotelRes.rows[0];
    if (!hotel) throw Object.assign(new Error("Hotel not found"), { status: 404 });

    const entries = await client.query(
      `SELECT c.*, o.hotel_booking_ref, o.external_opportunity_id, tr.check_in, tr.check_out
       FROM commission_entries c
       JOIN opportunities o ON o.id = c.opportunity_id
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       WHERE c.hotel_id = $1
         AND c.status IN ('accrued', 'due')
         AND COALESCE(c.accrued_at, c.created_at) >= $2
         AND COALESCE(c.accrued_at, c.created_at) <= $3
         AND c.invoice_id IS NULL
       ORDER BY COALESCE(c.accrued_at, c.created_at) ASC`,
      [params.hotelId, params.periodStart.toISOString(), params.periodEnd.toISOString()]
    );

    if (!entries.rowCount) return null;

    let taxable = 0n;
    let cgst = 0n;
    let sgst = 0n;
    let igst = 0n;
    let total = 0n;
    for (const e of entries.rows) {
      taxable += BigInt(e.taxable_value_paise ?? e.commission_paise ?? 0);
      cgst += BigInt(e.cgst_paise ?? 0);
      sgst += BigInt(e.sgst_paise ?? 0);
      igst += BigInt(e.igst_paise ?? 0);
      total += BigInt(e.total_paise ?? e.commission_paise ?? 0);
    }

    const invoiceNumber = await nextInvoiceNumber(client, "HR", fy);
    const invoice = await client.query(
      `INSERT INTO invoices (
         invoice_number, series, fy, type, hotel_id, period_start, period_end,
         issue_date, due_date, supplier_gstin, supplier_legal_name, supplier_address,
         recipient_gstin, recipient_legal_name, recipient_address, place_of_supply,
         taxable_value_paise, cgst_paise, sgst_paise, igst_paise, total_paise, status
       ) VALUES (
         $1,'HR',$2,'commission_invoice',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'30',
         $14,$15,$16,$17,$18,'issued'
       ) RETURNING *`,
      [
        invoiceNumber,
        fy,
        hotel.id,
        params.periodStart.toISOString().slice(0, 10),
        params.periodEnd.toISOString().slice(0, 10),
        issueDate.toISOString().slice(0, 10),
        dueDate.toISOString().slice(0, 10),
        params.supplier.gstin,
        params.supplier.legalName,
        params.supplier.address,
        hotel.gstin,
        hotel.legal_name || hotel.display_name,
        [hotel.location, hotel.destination].filter(Boolean).join(", "),
        Number(taxable),
        Number(cgst),
        Number(sgst),
        Number(igst),
        Number(total),
      ]
    );

    const inv = invoice.rows[0];
    for (const e of entries.rows) {
      const stay = `${String(e.check_in).slice(0, 10)}–${String(e.check_out).slice(0, 10)}`;
      const desc = [
        `Booking ${e.hotel_booking_ref || e.external_opportunity_id}`,
        stay,
        hotel.display_name,
      ].join(" · ");
      await client.query(
        `INSERT INTO invoice_lines (
           invoice_id, commission_entry_id, description, sac_code,
           taxable_value_paise, cgst_paise, sgst_paise, line_total_paise
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          inv.id,
          e.id,
          desc,
          hotel.sac_code || "998551",
          Number(e.taxable_value_paise ?? e.commission_paise ?? 0),
          Number(e.cgst_paise ?? 0),
          Number(e.sgst_paise ?? 0),
          Number(e.total_paise ?? e.commission_paise ?? 0),
        ]
      );
    }

    await client.query(
      `UPDATE commission_entries
       SET status = 'invoiced', invoice_id = $1
       WHERE id = ANY($2::uuid[])`,
      [inv.id, entries.rows.map((e) => e.id)]
    );

    return inv;
  });
}

/** Expose pool for health/tests — unused in routes yet. */
export { pool };
