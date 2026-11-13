// Demo data loader — so the Masters screens (and everything downstream) have
// something real to look at the moment the app starts, instead of a blank DB.
// Creates one realistic housing-society company: groups, chart of accounts,
// and a handful of members with billing rates. All money is integer paise.
import { db, uid } from '../db/db';
import { signed } from '../lib/money';
import type { Company, Group, Ledger, Member } from '../types/model';

export async function seedDemoCompany(): Promise<Company> {
  const companyId = uid();
  const company: Company = {
    id: companyId,
    code: '01',
    name: 'Green Meadows CHS',
    type: 'society',
    address: 'Green Meadows Co-operative Housing Society Ltd, Pune',
    periodStart: '2026-04-01',
    periodEnd: '2027-03-31',
    settings: {
      interestEnabled: true,
      interestMethod: 'A',
      interestRate: 21,
      rebateEnabled: false,
      costCentreEnabled: false,
      buildingWiseBilling: false,
      currencySymbol: '₹',
    },
    createdAt: Date.now(),
  };

  // ── Groups — legacy 11-19/21-29/31-39/41-49 numbering (SUMMARY.md §5.2) ──
  const groupDefs: Array<Pick<Group, 'code' | 'name' | 'nature' | 'isSchedule' | 'column'>> = [
    { code: '11', name: 'Share Capital', nature: 'liability', isSchedule: false, column: 'inner' },
    { code: '16', name: 'Current Liabilities', nature: 'liability', isSchedule: false, column: 'inner' },
    { code: '21', name: 'Cash & Bank Balance', nature: 'asset', isSchedule: false, column: 'inner' },
    { code: '26', name: "Member's Dues", nature: 'asset', isSchedule: true, column: 'inner' },
    { code: '31', name: 'Contribution From Members', nature: 'income', isSchedule: false, column: 'inner' },
    { code: '35', name: 'Income', nature: 'income', isSchedule: false, column: 'inner' },
    { code: '43', name: 'Maintenance Expenses', nature: 'expenditure', isSchedule: false, column: 'inner' },
    { code: '45', name: 'Office Expenses', nature: 'expenditure', isSchedule: false, column: 'inner' },
  ];
  const groups: Group[] = groupDefs.map((g) => ({ id: uid(), companyId, ...g }));
  const groupIdByCode = (code: string) => groups.find((g) => g.code === code)!.id;

  function makeLedger(
    code: string,
    name: string,
    groupCode: string,
    openingBalance: number,
    openingDrCr: 'D' | 'C',
    flags: { isBank?: boolean; isMember?: boolean } = {},
  ): Ledger {
    return {
      id: uid(),
      companyId,
      code,
      name,
      groupId: groupIdByCode(groupCode),
      openingBalance,
      openingDrCr,
      isBank: flags.isBank ?? false,
      isMember: flags.isMember ?? false,
      currentBalance: signed(openingBalance, openingDrCr),
    };
  }

  // ── Chart of accounts — cash, bank, a few expense/income heads ──────────
  const ledgers: Ledger[] = [
    makeLedger('210001', 'Cash on Hand', '21', 500000, 'D'),
    makeLedger('210002', 'HDFC Bank — Current A/c', '21', 18500000, 'D', { isBank: true }),
    makeLedger('210003', 'SBI Bank — Savings A/c', '21', 6200000, 'D', { isBank: true }),
    makeLedger('110001', 'Member Share Capital', '11', 2500000, 'C'),
    // Corpus / General Reserve Fund — the accumulated-fund credit that balances
    // the society's net assets so the opening trial balance is in equilibrium
    // (assets 2,82,000 - other liabilities 40,000 = 2,42,000 reserve).
    makeLedger('110002', 'General Reserve Fund', '11', 24200000, 'C'),
    makeLedger('160001', 'Audit Fees Payable', '16', 1500000, 'C'),
    makeLedger('350001', 'Interest on Fixed Deposits', '35', 0, 'D'),
    makeLedger('310001', 'Non-Occupancy Charges', '31', 0, 'D'),
    makeLedger('430001', 'Housekeeping Charges', '43', 0, 'D'),
    makeLedger('430002', 'Security Charges', '43', 0, 'D'),
    makeLedger('450001', 'Printing & Stationery', '45', 0, 'D'),
  ];

  // ── Members + their dues ledgers (group 26, Member's Dues) ──────────────
  const flats = [
    { name: 'Rajesh Shah', wing: 'A', flatNo: '101', area: 650 },
    { name: 'Priya Mehta', wing: 'A', flatNo: '102', area: 650 },
    { name: 'Arvind Kulkarni', wing: 'B', flatNo: '201', area: 820 },
    { name: 'Sunita Rao', wing: 'B', flatNo: '202', area: 820 },
    { name: 'Vikram Desai', wing: 'C', flatNo: '301', area: 1050 },
  ];

  const memberLedgers: Ledger[] = flats.map((f, i) =>
    makeLedger(`26${String(i + 1).padStart(4, '0')}`, f.name, '26', 350000 + i * 125000, 'D', { isMember: true }),
  );

  const members: Member[] = flats.map((f, i) => {
    const rates = new Array(16).fill(0);
    rates[0] = 150000; // MM1 — maintenance
    rates[1] = 50000; // MM2 — sinking fund
    rates[2] = 20000; // MM3 — repair fund
    return {
      id: uid(),
      companyId,
      ledgerId: memberLedgers[i].id,
      wing: f.wing,
      flatNo: f.flatNo,
      area: f.area,
      category: 'flat',
      noInterest: false,
      omitFromBilling: false,
      rates,
    };
  });

  await db.transaction('rw', db.companies, db.groups, db.ledgers, db.members, async () => {
    await db.companies.add(company);
    await db.groups.bulkAdd(groups);
    await db.ledgers.bulkAdd([...ledgers, ...memberLedgers]);
    await db.members.bulkAdd(members);
  });

  return company;
}
