// ─────────────────────────────────────────────────────────────────────────────
// Double-entry posting engine.
//
// Every voucher is a header + >=2 lines whose debits must equal credits
// (see CONTRACT.md "Accounting rules" / SUMMARY.md Part II §2 "Deep Dive: The
// Accounting Engine"). This module is the single place that writes to
// db.vouchers — screens never touch Dexie directly for postings.
// ─────────────────────────────────────────────────────────────────────────────
import { db, uid } from '../db/db';
import type { DrCr, ID, ISODate, Paise, Voucher, VoucherLine, VoucherType } from '../types/model';

export type PostingErrorCode =
  | 'NO_DATE'
  | 'EMPTY_LINES'
  | 'ZERO_AMOUNT'
  | 'UNBALANCED'
  | 'INVALID_LEDGER';

/** Typed error thrown by the posting engine; screens can switch on `.code`. */
export class PostingError extends Error {
  code: PostingErrorCode;
  constructor(code: PostingErrorCode, message: string) {
    super(message);
    this.name = 'PostingError';
    this.code = code;
  }
}

export interface SaveVoucherInput {
  companyId: ID;
  type: VoucherType;
  date: ISODate;
  narration?: string;
  chequeNo?: string;
  chequeDate?: ISODate;
  bankName?: string;
  reference?: string;
  /** Force memo status; voucher type 'memo' is always treated as a memo. */
  isMemo?: boolean;
  lines: VoucherLine[];
}

/** Auto-incrementing document number per company + voucher type (legacy DOC_NO sequence). */
export async function nextVoucherNumber(companyId: ID, type: VoucherType): Promise<number> {
  const existing = await db.vouchers.where({ companyId, type }).toArray();
  return existing.reduce((max, v) => Math.max(max, v.number), 0) + 1;
}

function validateLines(lines: VoucherLine[]) {
  if (!lines || lines.length < 2) {
    throw new PostingError('EMPTY_LINES', 'A voucher needs at least two postings.');
  }
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!line.ledgerId) throw new PostingError('INVALID_LEDGER', 'Every line needs a ledger selected.');
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new PostingError('ZERO_AMOUNT', 'Every line needs a non-zero amount.');
    }
    if (line.drCr === 'D') debit += line.amount;
    else credit += line.amount;
  }
  if (debit === 0) throw new PostingError('ZERO_AMOUNT', 'The voucher amount cannot be zero.');
  if (debit !== credit) {
    throw new PostingError(
      'UNBALANCED',
      `Debits (${debit}) and credits (${credit}) do not match — the voucher must balance.`,
    );
  }
}

async function validateLedgers(companyId: ID, lines: VoucherLine[]) {
  const ids = [...new Set(lines.map((l) => l.ledgerId))];
  const found = await db.ledgers.bulkGet(ids);
  found.forEach((ledger, i) => {
    if (!ledger) throw new PostingError('INVALID_LEDGER', `Ledger "${ids[i]}" was not found.`);
    if (ledger.companyId !== companyId) {
      throw new PostingError('INVALID_LEDGER', `Ledger "${ledger.name}" does not belong to this company.`);
    }
  });
}

/**
 * Validate, number, and persist a balanced voucher. Throws `PostingError` on
 * any validation failure — callers should surface `.message` to the operator.
 */
export async function saveVoucher(input: SaveVoucherInput): Promise<Voucher> {
  if (!input.date || !input.date.trim()) {
    throw new PostingError('NO_DATE', 'A voucher date is required.');
  }
  validateLines(input.lines);
  await validateLedgers(input.companyId, input.lines);

  const number = await nextVoucherNumber(input.companyId, input.type);
  const voucher: Voucher = {
    id: uid('vch_'),
    companyId: input.companyId,
    type: input.type,
    number,
    date: input.date,
    narration: input.narration?.trim() || undefined,
    chequeNo: input.chequeNo?.trim() || undefined,
    chequeDate: input.chequeDate || undefined,
    bankName: input.bankName?.trim() || undefined,
    reference: input.reference?.trim() || undefined,
    isMemo: input.type === 'memo' ? true : !!input.isMemo,
    lines: input.lines,
    createdAt: Date.now(),
  };
  await db.vouchers.add(voucher);
  return voucher;
}

// ── Line builders — one per legacy voucher shape (SUMMARY.md §3.8) ──────────

/** Two-leg posting: `mainLedgerId` takes `mainDrCr`, `otherLedgerId` takes the opposite side. */
export function buildTwoLegLines(
  mainLedgerId: ID,
  mainDrCr: DrCr,
  otherLedgerId: ID,
  amount: Paise,
  narration?: string,
): VoucherLine[] {
  const otherDrCr: DrCr = mainDrCr === 'D' ? 'C' : 'D';
  return [
    { ledgerId: mainLedgerId, drCr: mainDrCr, amount, narration },
    { ledgerId: otherLedgerId, drCr: otherDrCr, amount, narration },
  ];
}

/** Cash Receipt: Dr Cash, Cr the ledger money was received from. */
export function buildCashReceiptLines(cashLedgerId: ID, otherLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(cashLedgerId, 'D', otherLedgerId, amount, narration);
}

/** Cash Payment: Dr the ledger paid to, Cr Cash. */
export function buildCashPaymentLines(cashLedgerId: ID, otherLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(cashLedgerId, 'C', otherLedgerId, amount, narration);
}

/** Bank Receipt: Dr Bank, Cr the ledger money was received from. */
export function buildBankReceiptLines(bankLedgerId: ID, otherLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(bankLedgerId, 'D', otherLedgerId, amount, narration);
}

/** Bank Payment: Dr the ledger paid to, Cr Bank. */
export function buildBankPaymentLines(bankLedgerId: ID, otherLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(bankLedgerId, 'C', otherLedgerId, amount, narration);
}

/** Petty Cash: Dr the expense/account paid, Cr the Petty Cash imprest ledger. */
export function buildPettyCashLines(pettyCashLedgerId: ID, otherLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(pettyCashLedgerId, 'C', otherLedgerId, amount, narration);
}

/**
 * Contra: cash<->bank or bank<->bank transfer. Money leaves `fromLedgerId`
 * (credited) and lands in `toLedgerId` (debited). Legacy practice enters this
 * once, via Bank Receipt/Payment with the other cash/bank ledger selected as
 * the contra account — this helper documents/produces the same two lines.
 */
export function buildContraLines(fromLedgerId: ID, toLedgerId: ID, amount: Paise, narration?: string) {
  return buildTwoLegLines(toLedgerId, 'D', fromLedgerId, amount, narration);
}

/** Journal / Memo: pass through arbitrary balanced lines, stripping zero-amount rows. */
export function buildJournalLines(
  lines: { ledgerId: ID; drCr: DrCr; amount: Paise; narration?: string }[],
): VoucherLine[] {
  return lines.filter((l) => l.ledgerId && l.amount > 0).map((l) => ({ ...l }));
}
