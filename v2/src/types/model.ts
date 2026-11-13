// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL v2 — Core domain model
//
// A modern re-implementation of the PACE / CAPITAL PLUS accounting model.
// Field semantics are preserved from the legacy FoxPro tables (GLMAS, GLTX,
// GROUP, SOCFILE, MIT, BILREG…) so existing users' mental model and the
// double-entry logic carry over unchanged — see /SUMMARY.md Part II.
//
// All monetary values are stored as integer PAISE (1 rupee = 100 paise) to keep
// arithmetic exact. Use src/lib/money.ts to format/parse. Never use floats for money.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;
export type Paise = number; // integer paise
export type ISODate = string; // 'YYYY-MM-DD'

/** The four top-level account natures (legacy GROUP numbering 11-19/21-29/31-39/41-49). */
export type GroupNature = 'liability' | 'asset' | 'income' | 'expenditure';

/** Debit or Credit — the sign of a posting and of an opening balance. */
export type DrCr = 'D' | 'C';

/** Entity types the engine supports (legacy install prompt). */
export type EntityType =
  | 'society'
  | 'company'
  | 'individual'
  | 'commission_agent'
  | 'clearing_agent'
  | 'communication_centre';

// ── Company / Society (legacy CO.DBF + INSTA.LAN) ────────────────────────────
export interface Company {
  id: ID;
  code: string;              // 2-digit legacy code, e.g. '01'
  name: string;
  type: EntityType;
  address?: string;
  regdNo?: string;
  periodStart: ISODate;      // accounting period
  periodEnd: ISODate;
  // Config flags mirror the INSTA*.LAN option set; extend freely.
  settings: CompanySettings;
  createdAt: number;
}

export interface CompanySettings {
  interestEnabled: boolean;
  interestMethod: 'A' | 'B' | 'none';   // legacy Method A (grace/due) / B (prior-month balance)
  interestRate: number;                  // % per month
  rebateEnabled: boolean;
  costCentreEnabled: boolean;
  buildingWiseBilling: boolean;
  currencySymbol: string;                // '₹'
}

// ── Account groups (legacy GROUP.LAN) ────────────────────────────────────────
export interface Group {
  id: ID;
  companyId: ID;
  code: string;              // legacy 2-char, 11-19 liab / 21-29 asset / 31-39 inc / 41-49 exp
  name: string;
  nature: GroupNature;
  isSchedule: boolean;       // appears as a Balance-Sheet schedule
  column: 'inner' | 'outer'; // B/S placement
  parentId?: ID;             // sub-group support
}

// ── Ledger accounts / chart of accounts (legacy GLMAS.LAN) ───────────────────
export interface Ledger {
  id: ID;
  companyId: ID;
  code: string;              // GL_CD
  name: string;              // GL_NM
  groupId: ID;               // ADD -> group link
  openingBalance: Paise;     // YR_OB (signed by openingDrCr)
  openingDrCr: DrCr;
  openingInterest?: Paise;   // members only
  isBank: boolean;           // feeds Bank Book / BRS
  isMember: boolean;         // a society member's dues account (group 'MEMBER'S DUES')
  dueDays?: number;          // D_DAYS
  interestAccountId?: ID;    // ACC_INT
  // Denormalised running balance for fast display; recomputed from postings.
  currentBalance: Paise;     // CUR_BAL (signed: +debit / -credit)
}

// ── Voucher types (legacy Voucher Entry submenu) ─────────────────────────────
export type VoucherType =
  | 'petty_cash'
  | 'bank_receipt'
  | 'bank_payment'
  | 'cash_receipt'
  | 'cash_payment'
  | 'journal'
  | 'memo'       // temporary / provisional
  | 'contra';    // cash<->bank, bank<->bank

export const VOUCHER_TYPES: { type: VoucherType; label: string; hotkey: string }[] = [
  { type: 'petty_cash', label: 'Petty Cash', hotkey: '1' },
  { type: 'bank_receipt', label: 'Bank Receipt', hotkey: '2' },
  { type: 'bank_payment', label: 'Bank Payment', hotkey: '3' },
  { type: 'cash_receipt', label: 'Cash Receipt', hotkey: '4' },
  { type: 'cash_payment', label: 'Cash Payment', hotkey: '5' },
  { type: 'journal', label: 'Journal Voucher', hotkey: '6' },
  { type: 'memo', label: 'Memo Voucher', hotkey: '7' },
];

/**
 * A voucher = one document with >=2 balanced postings (double-entry).
 * Legacy GLTX stored a single row per leg with a GL_CD/CN contra pair; here we
 * model it explicitly as a header + lines so multi-line journals are first-class.
 */
export interface Voucher {
  id: ID;
  companyId: ID;
  type: VoucherType;
  number: number;            // auto-incrementing per type (DOC_NO / V_NO)
  date: ISODate;
  narration?: string;
  chequeNo?: string;         // bank vouchers
  chequeDate?: ISODate;
  bankName?: string;
  reference?: string;        // journal Reference No.
  isMemo: boolean;           // temporary voucher, excluded from final books until posted
  lines: VoucherLine[];
  createdAt: number;
}

export interface VoucherLine {
  ledgerId: ID;
  drCr: DrCr;
  amount: Paise;             // always positive; sign comes from drCr
  narration?: string;
  costCentreId?: ID;
}

// ── Society billing (legacy SOCFILE / MIT / BILREG / BILTX) ──────────────────
export interface Member {
  id: ID;
  companyId: ID;
  ledgerId: ID;              // member's dues ledger (GL_CD)
  wing: string;              // WING
  flatNo: string;            // GALA / unit no
  building?: string;         // BLDG
  area?: number;             // sq ft (AREA)
  category: MemberCategory;  // CAT
  noInterest: boolean;       // category 'N'
  omitFromBilling: boolean;  // category 'X' (e.g. transferred)
  rates: Paise[];            // MM1..MM16 monthly charge heads
}

/** Legacy category codes S/G/L/O/P/U plus flags N (no interest) / X (omit). */
export type MemberCategory = 'shop' | 'garage' | 'gala' | 'office' | 'parking' | 'unit' | 'flat';

export interface BillHead {
  id: ID;
  companyId: ID;
  index: number;             // FD1..FD16 position
  label: string;             // "Particulars in Bill"
  registerHeading: string;
  postToLedgerId: ID;        // auto-post target
  interestFree: boolean;
}

export interface Bill {
  id: ID;
  companyId: ID;
  memberId: ID;
  number: number;
  date: ISODate;
  period: string;            // e.g. 'APR-2026'
  heads: { headId: ID; amount: Paise }[]; // FD1..FD16
  arrears: Paise;            // ARR
  interest: Paise;           // INT
  rebate: Paise;             // REBATE
  grandTotal: Paise;         // GTOT
  posted: boolean;           // Update applied to member ledger
}

// ── Cost centres (legacy COST.LAN) ──────────────────────────────────────────
export interface CostCentre {
  id: ID;
  companyId: ID;
  code: string;
  name: string;
  parentId?: ID;
}

// ── Derived report rows (computed, not stored) ──────────────────────────────
export interface TrialBalanceRow {
  ledgerId: ID;
  ledgerName: string;
  groupName: string;
  debit: Paise;
  credit: Paise;
}

export interface LedgerStatementRow {
  date: ISODate;
  voucherType: VoucherType;
  voucherNo: number;
  particulars: string;       // contra account name
  narration?: string;
  debit: Paise;
  credit: Paise;
  balance: Paise;            // running
}
