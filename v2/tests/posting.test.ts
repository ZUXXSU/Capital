import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import {
  saveVoucher, nextVoucherNumber, PostingError,
  buildCashReceiptLines, buildBankPaymentLines, buildContraLines, buildJournalLines,
} from '../src/engine/posting';
import { makeFixture, resetDb, type Fixture } from './helpers';

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await makeFixture();
});

describe('posting: saveVoucher happy paths', () => {
  it('posts a cash receipt (Dr Cash, Cr member) balanced', async () => {
    const v = await saveVoucher({
      companyId: fx.company.id, type: 'cash_receipt', date: '2026-04-05',
      lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.member1.id, 10000),
    });
    const debit = v.lines.filter(l => l.drCr === 'D').reduce((s, l) => s + l.amount, 0);
    const credit = v.lines.filter(l => l.drCr === 'C').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(10000);
    expect(await db.vouchers.count()).toBe(1);
  });

  it('auto-increments voucher number per type', async () => {
    expect(await nextVoucherNumber(fx.company.id, 'cash_receipt')).toBe(1);
    await saveVoucher({ companyId: fx.company.id, type: 'cash_receipt', date: '2026-04-05', lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.member1.id, 100) });
    await saveVoucher({ companyId: fx.company.id, type: 'cash_receipt', date: '2026-04-06', lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.member2.id, 200) });
    expect(await nextVoucherNumber(fx.company.id, 'cash_receipt')).toBe(3);
    // numbering is per-type, so a bank payment starts fresh at 1
    expect(await nextVoucherNumber(fx.company.id, 'bank_payment')).toBe(1);
  });

  it('posts a bank payment and a contra', async () => {
    await saveVoucher({ companyId: fx.company.id, type: 'bank_payment', date: '2026-04-07', lines: buildBankPaymentLines(fx.ledgers.bank.id, fx.ledgers.repairs.id, 5000) });
    await saveVoucher({ companyId: fx.company.id, type: 'contra', date: '2026-04-08', lines: buildContraLines(fx.ledgers.cash.id, fx.ledgers.bank.id, 20000) });
    expect(await db.vouchers.count()).toBe(2);
  });

  it('posts a multi-line balanced journal', async () => {
    const v = await saveVoucher({
      companyId: fx.company.id, type: 'journal', date: '2026-04-09',
      lines: buildJournalLines([
        { ledgerId: fx.ledgers.repairs.id, drCr: 'D', amount: 3000 },
        { ledgerId: fx.ledgers.cash.id, drCr: 'C', amount: 1000 },
        { ledgerId: fx.ledgers.bank.id, drCr: 'C', amount: 2000 },
      ]),
    });
    expect(v.lines).toHaveLength(3);
  });

  it('marks memo vouchers isMemo', async () => {
    const v = await saveVoucher({ companyId: fx.company.id, type: 'memo', date: '2026-04-10', lines: buildJournalLines([
      { ledgerId: fx.ledgers.repairs.id, drCr: 'D', amount: 500 },
      { ledgerId: fx.ledgers.cash.id, drCr: 'C', amount: 500 },
    ]) });
    expect(v.isMemo).toBe(true);
  });
});

describe('posting: validation rejects bad input', () => {
  it('rejects blank date', async () => {
    await expect(saveVoucher({ companyId: fx.company.id, type: 'cash_receipt', date: '', lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.member1.id, 100) }))
      .rejects.toMatchObject({ code: 'NO_DATE' });
  });
  it('rejects an unbalanced journal', async () => {
    await expect(saveVoucher({ companyId: fx.company.id, type: 'journal', date: '2026-04-05', lines: [
      { ledgerId: fx.ledgers.repairs.id, drCr: 'D', amount: 1000 },
      { ledgerId: fx.ledgers.cash.id, drCr: 'C', amount: 900 },
    ] })).rejects.toBeInstanceOf(PostingError);
  });
  it('rejects a zero-amount voucher', async () => {
    await expect(saveVoucher({ companyId: fx.company.id, type: 'cash_receipt', date: '2026-04-05', lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.member1.id, 0) }))
      .rejects.toMatchObject({ code: 'ZERO_AMOUNT' });
  });
  it('rejects fewer than two postings', async () => {
    await expect(saveVoucher({ companyId: fx.company.id, type: 'journal', date: '2026-04-05', lines: [
      { ledgerId: fx.ledgers.cash.id, drCr: 'D', amount: 1000 },
    ] })).rejects.toBeInstanceOf(PostingError);
  });
});
