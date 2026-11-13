import { describe, it, expect } from 'vitest';
import { parsePaise, formatPaise, signed, balanceLabel } from '../src/lib/money';

describe('money: parsePaise', () => {
  it('parses plain rupees to paise', () => {
    expect(parsePaise('100')).toBe(10000);
    expect(parsePaise('1234.50')).toBe(123450);
    expect(parsePaise('0.01')).toBe(1);
  });
  it('strips commas, spaces and symbol', () => {
    expect(parsePaise('1,234.50')).toBe(123450);
    expect(parsePaise(' ₹ 1,00,000 ')).toBe(10000000);
  });
  it('handles blank and bare minus', () => {
    expect(parsePaise('')).toBe(0);
    expect(parsePaise('-')).toBe(0);
  });
  it('rounds to the nearest paise (no float drift)', () => {
    expect(parsePaise('0.005')).toBe(1); // 0.5 paise rounds up
    expect(parsePaise('19.999')).toBe(2000);
  });
});

describe('money: formatPaise', () => {
  it('formats with Indian grouping', () => {
    expect(formatPaise(123450)).toBe('1,234.50');
    expect(formatPaise(10000000)).toBe('1,00,000.00');
    expect(formatPaise(100000000)).toBe('10,00,000.00');
  });
  it('handles zero and negatives', () => {
    expect(formatPaise(0)).toBe('0.00');
    expect(formatPaise(-500)).toBe('-5.00');
  });
  it('symbol and accounting sign options', () => {
    expect(formatPaise(123450, { symbol: true })).toBe('₹ 1,234.50');
    expect(formatPaise(-500, { sign: true })).toBe('(5.00)');
  });
  it('round-trips with parsePaise', () => {
    for (const s of ['0.01', '1,234.50', '1,00,000.00']) {
      expect(formatPaise(parsePaise(s))).toBe(s);
    }
  });
});

describe('money: signed & balanceLabel', () => {
  it('signs debit positive, credit negative', () => {
    expect(signed(100, 'D')).toBe(100);
    expect(signed(100, 'C')).toBe(-100);
  });
  it('labels a balance with Dr/Cr', () => {
    expect(balanceLabel(5000)).toEqual({ text: '50.00', drcr: 'D' });
    expect(balanceLabel(-5000)).toEqual({ text: '50.00', drcr: 'C' });
    expect(balanceLabel(0).drcr).toBe('');
  });
});
