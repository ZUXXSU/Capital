import { db, uid } from '../src/db/db';
import type { Company, Group, Ledger } from '../src/types/model';

/** Wipe every table so each test starts clean. */
export async function resetDb() {
  await Promise.all([
    db.companies.clear(), db.groups.clear(), db.ledgers.clear(),
    db.vouchers.clear(), db.members.clear(), db.billHeads.clear(),
    db.bills.clear(), db.costCentres.clear(),
  ]);
}

export interface Fixture {
  company: Company;
  groups: Record<string, Group>;
  ledgers: Record<string, Ledger>;
}

/** A minimal but realistic company: cash, bank, one income, one expense, two members. */
export async function makeFixture(): Promise<Fixture> {
  const company: Company = {
    id: uid(), code: '01', name: 'Test Society', type: 'society',
    periodStart: '2026-04-01', periodEnd: '2027-03-31',
    settings: {
      interestEnabled: false, interestMethod: 'none', interestRate: 0,
      rebateEnabled: false, costCentreEnabled: false, buildingWiseBilling: false,
      currencySymbol: '₹',
    },
    createdAt: Date.now(),
  };
  await db.companies.add(company);

  function mkGroup(code: string, name: string, nature: Group['nature']): Group {
    return { id: uid(), companyId: company.id, code, name, nature, isSchedule: false, column: 'outer' };
  }
  const groups = {
    assets: mkGroup('21', 'CURRENT ASSETS', 'asset'),
    dues: mkGroup('26', "MEMBER'S DUES", 'asset'),
    income: mkGroup('31', 'INCOME', 'income'),
    expense: mkGroup('41', 'EXPENDITURE', 'expenditure'),
    liab: mkGroup('11', 'FUNDS', 'liability'),
  };
  await db.groups.bulkAdd(Object.values(groups));

  function mkLedger(code: string, name: string, groupId: string, extra: Partial<Ledger> = {}): Ledger {
    return {
      id: uid(), companyId: company.id, code, name, groupId,
      openingBalance: 0, openingDrCr: 'D', isBank: false, isMember: false,
      currentBalance: 0, ...extra,
    };
  }
  const ledgers = {
    cash: mkLedger('C001', 'Cash in Hand', groups.assets.id),
    bank: mkLedger('B001', 'HDFC Bank', groups.assets.id, { isBank: true }),
    maint: mkLedger('I001', 'Maintenance Income', groups.income.id, { openingDrCr: 'C' }),
    repairs: mkLedger('E001', 'Repairs & Maintenance', groups.expense.id),
    member1: mkLedger('M001', 'Flat A-101', groups.dues.id, { isMember: true }),
    member2: mkLedger('M002', 'Flat A-102', groups.dues.id, { isMember: true }),
  };
  await db.ledgers.bulkAdd(Object.values(ledgers));

  return { company, groups, ledgers };
}
