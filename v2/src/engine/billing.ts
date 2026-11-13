// ─────────────────────────────────────────────────────────────────────────────
// Society billing engine.
//
// Generates maintenance bills for society members from the MIT rate matrix,
// calculates interest on arrears (Method A or B), and posts to member ledgers.
// See SUMMARY.md Part II — Deep Dive: The Billing Engine.
// ─────────────────────────────────────────────────────────────────────────────
import { db, uid } from '../db/db';
import type {
  ID, ISODate, Paise, Member, Bill, Voucher, VoucherLine,
} from '../types/model';
import { ledgerBalancesAsOn } from './balances';

export interface BillPreview {
  member: Member;
  headAmounts: { headId: ID; label: string; amount: Paise }[];
  subtotal: Paise;
  arrears: Paise;
  interest: Paise;
  rebate: Paise;
  grandTotal: Paise;
}

/** Preview bills for all billable members in a company for a given period. */
export async function previewBills(
  companyId: ID,
  _period: string,
  billDate: ISODate,
): Promise<BillPreview[]> {
  const company = await db.companies.get(companyId);
  if (!company) return [];

  const members = await db.members.where({ companyId }).toArray();
  const heads = await db.billHeads.where({ companyId }).toArray();
  heads.sort((a, b) => a.index - b.index);

  const balances = await ledgerBalancesAsOn(companyId, billDate);

  const previews: BillPreview[] = [];
  for (const member of members) {
    if (member.omitFromBilling) continue;

    const headAmounts = heads.map((h, i) => ({
      headId: h.id,
      label: h.label,
      amount: member.rates[i] ?? 0,
    }));
    const subtotal = headAmounts.reduce((s, h) => s + h.amount, 0);

    // Arrears = member ledger's current debit balance (what they owe)
    const ledgerBal = balances.get(member.ledgerId) ?? 0;
    const arrears = ledgerBal > 0 ? ledgerBal : 0;

    // Interest on arrears
    let interest = 0;
    if (company.settings.interestEnabled && !member.noInterest && arrears > 0) {
      interest = Math.round(arrears * company.settings.interestRate / 100);
    }

    const rebate = 0; // rebate logic TBD per company settings
    const grandTotal = subtotal + arrears + interest - rebate;

    previews.push({ member, headAmounts, subtotal, arrears, interest, rebate, grandTotal });
  }

  return previews;
}

/** Generate and persist bills from previews. Does NOT post to ledgers — call updateBills for that. */
export async function generateBills(
  companyId: ID,
  period: string,
  billDate: ISODate,
  previews: BillPreview[],
): Promise<Bill[]> {
  const existing = await db.bills.where({ companyId }).toArray();
  let nextNo = existing.reduce((max, b) => Math.max(max, b.number), 0) + 1;

  const bills: Bill[] = previews.map((p) => ({
    id: uid('bill_'),
    companyId,
    memberId: p.member.id,
    number: nextNo++,
    date: billDate,
    period,
    heads: p.headAmounts.map((h) => ({ headId: h.headId, amount: h.amount })),
    arrears: p.arrears,
    interest: p.interest,
    rebate: p.rebate,
    grandTotal: p.grandTotal,
    posted: false,
  }));

  await db.bills.bulkAdd(bills);
  return bills;
}

/** Post (Update) generated bills to member ledgers via journal vouchers. */
export async function updateBills(companyId: ID, billIds: ID[]): Promise<void> {
  const bills = await db.bills.bulkGet(billIds);
  const members = await db.members.where({ companyId }).toArray();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const heads = await db.billHeads.where({ companyId }).toArray();
  const headById = new Map(heads.map((h) => [h.id, h]));

  await db.transaction('rw', db.bills, db.vouchers, async () => {
    for (const bill of bills) {
      if (!bill || bill.posted) continue;
      const member = memberById.get(bill.memberId);
      if (!member) continue;

      // Create journal lines: Dr Member's dues ledger, Cr each bill head's post-to ledger
      const lines: VoucherLine[] = [];
      // Debit member
      lines.push({ ledgerId: member.ledgerId, drCr: 'D', amount: bill.grandTotal });
      // Credit each bill head's target ledger proportionally
      for (const h of bill.heads) {
        if (h.amount <= 0) continue;
        const head = headById.get(h.headId);
        if (!head) continue;
        lines.push({ ledgerId: head.postToLedgerId, drCr: 'C', amount: h.amount });
      }
      // Interest credited to interest account if any
      if (bill.interest > 0) {
        const interestHead = heads.find((h) => h.label.toLowerCase().includes('interest'));
        if (interestHead) {
          lines.push({ ledgerId: interestHead.postToLedgerId, drCr: 'C', amount: bill.interest });
        }
      }

      // Only post if balanced
      const totalDr = lines.filter((l) => l.drCr === 'D').reduce((s, l) => s + l.amount, 0);
      const totalCr = lines.filter((l) => l.drCr === 'C').reduce((s, l) => s + l.amount, 0);
      if (totalDr !== totalCr) continue; // skip unbalanced

      const existingVouchers = await db.vouchers.where({ companyId }).toArray();
      const nextNo = existingVouchers.filter((v) => v.type === 'journal').reduce((max, v) => Math.max(max, v.number), 0) + 1;

      const voucher: Voucher = {
        id: uid('vch_'),
        companyId,
        type: 'journal',
        number: nextNo,
        date: bill.date,
        narration: `Bill #${bill.number} — ${bill.period}`,
        isMemo: false,
        lines,
        createdAt: Date.now(),
      };
      await db.vouchers.add(voucher);
      await db.bills.update(bill.id, { posted: true });
    }
  });
}

/** Delete unposted bills for a given period. */
export async function deleteBillsForPeriod(companyId: ID, period: string): Promise<number> {
  const bills = await db.bills.where({ companyId }).toArray();
  const toDelete = bills.filter((b) => b.period === period && !b.posted);
  await db.bills.bulkDelete(toDelete.map((b) => b.id));
  return toDelete.length;
}
