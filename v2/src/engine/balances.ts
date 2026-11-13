// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL v2 — Balance engine
//
// Pure(ish) functions that read db.vouchers / db.ledgers / db.groups and
// derive Trial Balance / Ledger Statement / Balance Sheet / Income &
// Expenditure / Day Book. All arithmetic is integer paise. Balances follow
// the `signed()` convention from lib/money.ts: debit positive, credit
// negative — see SUMMARY.md "Deep Dive: The Accounting Engine" §3.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../db/db';
import { signed } from '../lib/money';
import type {
  ID, ISODate, Paise, Ledger, Group, Voucher, VoucherLine,
  TrialBalanceRow, LedgerStatementRow,
} from '../types/model';

/** A ledger row grouped for Balance Sheet / Income & Expenditure display. */
export interface GroupBlock {
  groupId: ID;
  groupName: string;
  isSchedule: boolean;
  lines: { ledgerId: ID; ledgerName: string; amount: Paise }[]; // unsigned, display amount
  total: Paise; // unsigned
}

export interface BalanceSheetResult {
  asOn: ISODate | null;
  liabilities: GroupBlock[];
  assets: GroupBlock[];
  totalLiabilities: Paise;
  totalAssets: Paise;
  periodSurplus: Paise; // signed: positive = surplus (income > expenditure), folded into liabilities
  balanced: boolean;
}

export interface IncomeExpenditureResult {
  from: ISODate | null;
  to: ISODate | null;
  income: GroupBlock[];
  expenditure: GroupBlock[];
  totalIncome: Paise;
  totalExpenditure: Paise;
  surplus: Paise; // signed: positive = surplus, negative = deficit
}

export interface DayBookEntry {
  voucher: Voucher;
  totalAmount: Paise; // sum of debit legs (= sum of credit legs, balanced)
}

/** Load all ledgers for a company, keyed by id. */
async function ledgerMap(companyId: ID): Promise<Map<ID, Ledger>> {
  const rows = await db.ledgers.where('companyId').equals(companyId).toArray();
  return new Map(rows.map((l) => [l.id, l]));
}

/** Load all groups for a company, keyed by id. */
async function groupMap(companyId: ID): Promise<Map<ID, Group>> {
  const rows = await db.groups.where('companyId').equals(companyId).toArray();
  return new Map(rows.map((g) => [g.id, g]));
}

/** Vouchers for a company, excluding memo (provisional) vouchers, sorted date-then-number. */
async function postedVouchers(companyId: ID, from?: ISODate, to?: ISODate): Promise<Voucher[]> {
  const rows = await db.vouchers.where('companyId').equals(companyId).toArray();
  return rows
    .filter((v) => !v.isMemo)
    .filter((v) => (!from || v.date >= from) && (!to || v.date <= to))
    .sort((a, b) => (a.date === b.date ? a.number - b.number : a.date < b.date ? -1 : 1));
}

/** Net signed movement per ledger across a set of vouchers. */
function accumulate(vouchers: Voucher[], into: Map<ID, Paise> = new Map()): Map<ID, Paise> {
  for (const v of vouchers) {
    for (const line of v.lines) {
      into.set(line.ledgerId, (into.get(line.ledgerId) ?? 0) + signed(line.amount, line.drCr));
    }
  }
  return into;
}

/** Signed opening balance for a ledger. */
function openingSigned(l: Ledger): Paise {
  return signed(l.openingBalance, l.openingDrCr);
}

/** Signed closing balance of every ledger in a company, as on a date (or to-date if omitted). */
export async function ledgerBalancesAsOn(companyId: ID, asOn?: ISODate): Promise<Map<ID, Paise>> {
  const ledgers = await ledgerMap(companyId);
  const vouchers = await postedVouchers(companyId, undefined, asOn);
  const movement = accumulate(vouchers);
  const result = new Map<ID, Paise>();
  for (const l of ledgers.values()) {
    result.set(l.id, openingSigned(l) + (movement.get(l.id) ?? 0));
  }
  return result;
}

/** Trial Balance: every ledger's closing balance split into Dr/Cr columns. Always balances. */
export async function trialBalance(companyId: ID, asOn?: ISODate): Promise<TrialBalanceRow[]> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const balances = await ledgerBalancesAsOn(companyId, asOn);
  const rows: TrialBalanceRow[] = [];
  for (const l of ledgers.values()) {
    const bal = balances.get(l.id) ?? 0;
    if (bal === 0) continue;
    const g = groups.get(l.groupId);
    rows.push({
      ledgerId: l.id,
      ledgerName: l.name,
      groupName: g?.name ?? '—',
      debit: bal > 0 ? bal : 0,
      credit: bal < 0 ? -bal : 0,
    });
  }
  rows.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
  return rows;
}

/** Ledger statement with running balance (opening row first). */
export async function ledgerStatement(
  companyId: ID,
  ledgerId: ID,
  from?: ISODate,
  to?: ISODate,
): Promise<LedgerStatementRow[]> {
  const ledgers = await ledgerMap(companyId);
  const ledger = ledgers.get(ledgerId);
  if (!ledger) return [];

  // Opening = ledger's own opening + every posting strictly before `from`.
  const priorVouchers = from ? await postedVouchers(companyId, undefined, undefined) : [];
  let opening = openingSigned(ledger);
  if (from) {
    for (const v of priorVouchers) {
      if (v.date >= from) continue;
      for (const line of v.lines) {
        if (line.ledgerId === ledgerId) opening += signed(line.amount, line.drCr);
      }
    }
  }

  const vouchers = await postedVouchers(companyId, from, to);
  const rows: LedgerStatementRow[] = [
    {
      date: from ?? '',
      voucherType: 'journal',
      voucherNo: 0,
      particulars: 'Opening Balance',
      debit: opening > 0 ? opening : 0,
      credit: opening < 0 ? -opening : 0,
      balance: opening,
    },
  ];

  let running = opening;
  for (const v of vouchers) {
    const mine = v.lines.filter((l) => l.ledgerId === ledgerId);
    if (mine.length === 0) continue;
    const others = v.lines.filter((l) => l.ledgerId !== ledgerId);
    const particulars = others.length === 0
      ? v.narration ?? '—'
      : others.length === 1
        ? ledgers.get(others[0].ledgerId)?.name ?? '—'
        : 'Sundries';
    for (const line of mine) {
      const mv = signed(line.amount, line.drCr);
      running += mv;
      rows.push({
        date: v.date,
        voucherType: v.type,
        voucherNo: v.number,
        particulars,
        narration: v.narration,
        debit: mv > 0 ? mv : 0,
        credit: mv < 0 ? -mv : 0,
        balance: running,
      });
    }
  }
  return rows;
}

/** Group ledger balances by Group for B/S or I&E style display. */
function groupBlocks(
  natures: Group['nature'][],
  ledgers: Map<ID, Ledger>,
  groups: Map<ID, Group>,
  balances: Map<ID, Paise>,
): { blocks: GroupBlock[]; total: Paise } {
  const byGroup = new Map<ID, GroupBlock>();
  for (const l of ledgers.values()) {
    const g = groups.get(l.groupId);
    if (!g || !natures.includes(g.nature)) continue;
    const bal = balances.get(l.id) ?? 0;
    if (bal === 0) continue;
    const amount = Math.abs(bal);
    let block = byGroup.get(g.id);
    if (!block) {
      block = { groupId: g.id, groupName: g.name, isSchedule: g.isSchedule, lines: [], total: 0 };
      byGroup.set(g.id, block);
    }
    block.lines.push({ ledgerId: l.id, ledgerName: l.name, amount });
    block.total += amount;
  }
  const blocks = [...byGroup.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
  const total = blocks.reduce((s, b) => s + b.total, 0);
  return { blocks, total };
}

/** Income & Expenditure (vertical P&L for not-for-profit societies). */
export async function incomeExpenditure(
  companyId: ID,
  from?: ISODate,
  to?: ISODate,
): Promise<IncomeExpenditureResult> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  // Movement only (no opening carried) — income/expenditure are period figures.
  const vouchers = await postedVouchers(companyId, from, to);
  const movement = accumulate(vouchers);

  const { blocks: income, total: totalIncome } = groupBlocks(['income'], ledgers, groups, movement);
  const { blocks: expenditure, total: totalExpenditure } = groupBlocks(['expenditure'], ledgers, groups, movement);
  return {
    from: from ?? null,
    to: to ?? null,
    income,
    expenditure,
    totalIncome,
    totalExpenditure,
    surplus: totalIncome - totalExpenditure,
  };
}

/** Balance Sheet (horizontal: Liabilities | Assets), with the period's I&E surplus/deficit folded in. */
export async function balanceSheet(companyId: ID, asOn?: ISODate): Promise<BalanceSheetResult> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const balances = await ledgerBalancesAsOn(companyId, asOn);

  const { blocks: liabilities, total: liabTotal } = groupBlocks(['liability'], ledgers, groups, balances);
  const { blocks: assets, total: assetTotal } = groupBlocks(['asset'], ledgers, groups, balances);

  const ie = await incomeExpenditure(companyId, undefined, asOn);
  const periodSurplus = ie.surplus;
  // Surplus (income > expenditure) is a credit balance -> adds to Liabilities (accumulated fund);
  // a deficit reduces it. Mirrors legacy group 19 "Income & Expenditure A/c" carry-forward.
  const totalLiabilities = liabTotal + periodSurplus;
  const totalAssets = assetTotal;

  return {
    asOn: asOn ?? null,
    liabilities,
    assets,
    totalLiabilities,
    totalAssets,
    periodSurplus,
    balanced: totalLiabilities === totalAssets,
  };
}

/** Chronological Day Book — every non-memo voucher with its total value. */
export async function dayBook(companyId: ID, from?: ISODate, to?: ISODate): Promise<DayBookEntry[]> {
  const vouchers = await postedVouchers(companyId, from, to);
  return vouchers.map((v) => ({
    voucher: v,
    totalAmount: v.lines.filter((l) => l.drCr === 'D').reduce((s, l) => s + l.amount, 0),
  }));
}

/** Convenience: the contra/particulars string for a voucher's lines other than `ledgerId`. */
export function otherParticulars(v: Voucher, line: VoucherLine, ledgers: Map<ID, Ledger>): string {
  const others = v.lines.filter((l) => l !== line);
  if (others.length === 0) return v.narration ?? '—';
  if (others.length === 1) return ledgers.get(others[0].ledgerId)?.name ?? '—';
  return 'Sundries';
}

/** True for ledgers that represent cash-in-hand or a bank account (legacy Group "CASH & BANK BALANCE"). */
function isCashOrBankLedger(ledger: Ledger, group: Group | undefined): boolean {
  return ledger.isBank || /cash|bank/i.test(group?.name ?? '');
}

/** One ISO date earlier — used to derive a period's opening balance (balance as of the day before `from`). */
function dayBefore(date: ISODate): ISODate {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface CashFlowEntry {
  voucher: Voucher;
  movement: Paise; // signed net change to cash & bank across this voucher
  particulars: string; // the non-cash/bank side (or "Sundries")
}

export interface CashFlowResult {
  from: ISODate | null;
  to: ISODate | null;
  opening: Paise;
  closing: Paise;
  totalReceipts: Paise;
  totalPayments: Paise;
  entries: CashFlowEntry[];
}

/** Reports → 5. Cash Flow Stat. — movement of Cash & Bank ledgers over a period. */
export async function cashFlowStatement(companyId: ID, from?: ISODate, to?: ISODate): Promise<CashFlowResult> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const cashBankIds = new Set(
    [...ledgers.values()].filter((l) => isCashOrBankLedger(l, groups.get(l.groupId))).map((l) => l.id),
  );

  const openingBalances = await ledgerBalancesAsOn(companyId, from ? dayBefore(from) : undefined);
  const closingBalances = await ledgerBalancesAsOn(companyId, to);
  const opening = from ? [...cashBankIds].reduce((s, id) => s + (openingBalances.get(id) ?? 0), 0) : 0;
  const closing = [...cashBankIds].reduce((s, id) => s + (closingBalances.get(id) ?? 0), 0);

  const vouchers = await postedVouchers(companyId, from, to);
  const entries: CashFlowEntry[] = [];
  for (const v of vouchers) {
    const movement = v.lines
      .filter((l) => cashBankIds.has(l.ledgerId))
      .reduce((s, l) => s + signed(l.amount, l.drCr), 0);
    if (movement === 0) continue; // internal cash<->bank contra nets to zero, correctly excluded
    const others = v.lines.filter((l) => !cashBankIds.has(l.ledgerId));
    const particulars = others.length === 0
      ? v.narration ?? '—'
      : others.length === 1
        ? ledgers.get(others[0].ledgerId)?.name ?? '—'
        : 'Sundries';
    entries.push({ voucher: v, movement, particulars });
  }

  const totalReceipts = entries.filter((e) => e.movement > 0).reduce((s, e) => s + e.movement, 0);
  const totalPayments = entries.filter((e) => e.movement < 0).reduce((s, e) => s - e.movement, 0);

  return { from: from ?? null, to: to ?? null, opening, closing, totalReceipts, totalPayments, entries };
}

export interface ReceiptsPaymentsResult {
  from: ISODate | null;
  to: ISODate | null;
  opening: Paise;
  closing: Paise;
  receipts: GroupBlock[];
  payments: GroupBlock[];
  totalReceipts: Paise;
  totalPayments: Paise;
}

/** Reports → A. Recpts & Paymts — classic cash-basis Receipts & Payments Account. */
export async function receiptsAndPayments(companyId: ID, from?: ISODate, to?: ISODate): Promise<ReceiptsPaymentsResult> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const flow = await cashFlowStatement(companyId, from, to);

  const cashBankIds = new Set(
    [...ledgers.values()].filter((l) => isCashOrBankLedger(l, groups.get(l.groupId))).map((l) => l.id),
  );
  const receiptMovement = new Map<ID, Paise>();
  const paymentMovement = new Map<ID, Paise>();
  for (const e of flow.entries) {
    for (const line of e.voucher.lines) {
      if (cashBankIds.has(line.ledgerId)) continue;
      const amt = Math.abs(signed(line.amount, line.drCr));
      if (e.movement > 0) receiptMovement.set(line.ledgerId, (receiptMovement.get(line.ledgerId) ?? 0) + amt);
      else paymentMovement.set(line.ledgerId, (paymentMovement.get(line.ledgerId) ?? 0) + amt);
    }
  }
  const { blocks: receipts, total: totalReceipts } = groupBlocks(
    ['income', 'liability', 'asset', 'expenditure'], ledgers, groups, receiptMovement,
  );
  const { blocks: payments, total: totalPayments } = groupBlocks(
    ['income', 'liability', 'asset', 'expenditure'], ledgers, groups, paymentMovement,
  );

  return {
    from: from ?? null,
    to: to ?? null,
    opening: flow.opening,
    closing: flow.closing,
    receipts,
    payments,
    totalReceipts,
    totalPayments,
  };
}

export interface FinancialStatusResult {
  asOn: ISODate | null;
  cashAndBank: Paise;
  receivables: Paise; // member dues owed to the society
  payables: Paise; // liability-side balances owed by the society
  totalAssets: Paise;
  totalLiabilities: Paise;
  income: Paise;
  expenditure: Paise;
  surplus: Paise;
}

/** Reports → 9. Financial Status — one-page management/MC-meeting snapshot. */
export async function financialStatus(companyId: ID, asOn?: ISODate): Promise<FinancialStatusResult> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const balances = await ledgerBalancesAsOn(companyId, asOn);

  let cashAndBank = 0;
  let receivables = 0;
  let payables = 0;
  for (const l of ledgers.values()) {
    const bal = balances.get(l.id) ?? 0;
    const g = groups.get(l.groupId);
    if (isCashOrBankLedger(l, g)) cashAndBank += bal;
    if (l.isMember && bal > 0) receivables += bal;
    if (g?.nature === 'liability' && bal < 0) payables += -bal;
  }

  const bs = await balanceSheet(companyId, asOn);
  const ie = await incomeExpenditure(companyId, undefined, asOn);

  return {
    asOn: asOn ?? null,
    cashAndBank,
    receivables,
    payables,
    totalAssets: bs.totalAssets,
    totalLiabilities: bs.totalLiabilities,
    income: ie.totalIncome,
    expenditure: ie.totalExpenditure,
    surplus: ie.surplus,
  };
}

/** True for ledgers that feed the Cash Book / Bank Book / petty cash register. */
export async function cashAndBankLedgerIds(companyId: ID): Promise<{ cash: ID[]; bank: Ledger[] }> {
  const ledgers = await ledgerMap(companyId);
  const groups = await groupMap(companyId);
  const banks = [...ledgers.values()].filter((l) => l.isBank);
  const cash = [...ledgers.values()]
    .filter((l) => !l.isBank && /cash/i.test(groups.get(l.groupId)?.name ?? l.name))
    .map((l) => l.id);
  return { cash, bank: banks };
}
