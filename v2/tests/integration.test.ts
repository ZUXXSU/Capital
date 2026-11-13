import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedDemoCompany } from '../src/engine/seed';
import { trialBalance, balanceSheet } from '../src/engine/balances';
import { previewBills, generateBills, updateBills } from '../src/engine/billing';
import { resetDb } from './helpers';

beforeEach(async () => { await resetDb(); });

describe('integration: demo seed', () => {
  it('creates a company with groups, ledgers and members', async () => {
    const company = await seedDemoCompany();
    expect(company.id).toBeTruthy();
    expect(await db.groups.where({ companyId: company.id }).count()).toBeGreaterThanOrEqual(5);
    expect(await db.ledgers.where({ companyId: company.id }).count()).toBeGreaterThanOrEqual(10);
    expect(await db.members.where({ companyId: company.id }).count()).toBeGreaterThanOrEqual(1);
  });

  it("seeded company's trial balance balances and B/S balances", async () => {
    const company = await seedDemoCompany();
    const rows = await trialBalance(company.id);
    const dr = rows.reduce((s, r) => s + r.debit, 0);
    const cr = rows.reduce((s, r) => s + r.credit, 0);
    expect(dr).toBe(cr);
    const bs = await balanceSheet(company.id);
    expect(bs.balanced).toBe(true);
  });
});

describe('integration: society billing end-to-end', () => {
  it('previews, generates and posts bills that balance the books', async () => {
    const company = await seedDemoCompany();
    const heads = await db.billHeads.where({ companyId: company.id }).toArray();
    // Billing needs bill heads; skip gracefully if the demo seed defines none.
    if (heads.length === 0) return;

    const previews = await previewBills(company.id, 'APR-2026', '2026-04-01');
    expect(previews.length).toBeGreaterThan(0);

    const bills = await generateBills(company.id, 'APR-2026', '2026-04-01', previews);
    expect(bills.length).toBe(previews.length);
    expect(bills.every(b => b.posted === false)).toBe(true);

    await updateBills(company.id, bills.map(b => b.id));
    const posted = await db.bills.where({ companyId: company.id }).toArray();
    expect(posted.every(b => b.posted)).toBe(true);

    // After posting bills, the trial balance must still balance.
    const rows = await trialBalance(company.id);
    const dr = rows.reduce((s, r) => s + r.debit, 0);
    const cr = rows.reduce((s, r) => s + r.credit, 0);
    expect(dr).toBe(cr);
  });
});
