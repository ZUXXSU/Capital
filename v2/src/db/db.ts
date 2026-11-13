// Local-first persistence with Dexie (IndexedDB). Offline-capable like the
// original DOS app — all data lives on the machine. A future sync/server layer
// can sit behind the same repository API in src/db/repo.ts.
import Dexie, { type Table } from 'dexie';
import type {
  Company, Group, Ledger, Voucher, Member, BillHead, Bill, CostCentre,
} from '../types/model';

export class CapitalDB extends Dexie {
  companies!: Table<Company, string>;
  groups!: Table<Group, string>;
  ledgers!: Table<Ledger, string>;
  vouchers!: Table<Voucher, string>;
  members!: Table<Member, string>;
  billHeads!: Table<BillHead, string>;
  bills!: Table<Bill, string>;
  costCentres!: Table<CostCentre, string>;

  constructor() {
    super('capital-v2');
    this.version(1).stores({
      companies: 'id, code, name',
      groups: 'id, companyId, code, nature',
      ledgers: 'id, companyId, code, groupId, isBank, isMember',
      vouchers: 'id, companyId, type, number, date',
      members: 'id, companyId, ledgerId, wing, flatNo',
      billHeads: 'id, companyId, index',
      bills: 'id, companyId, memberId, number, date, posted',
      costCentres: 'id, companyId, code',
    });
  }
}

export const db = new CapitalDB();

export function uid(prefix = ''): string {
  return prefix + crypto.randomUUID();
}
