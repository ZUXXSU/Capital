// Exact money arithmetic. Everything is integer PAISE internally.
import Decimal from 'decimal.js';
import type { Paise } from '../types/model';

export const RUPEE = '₹';

/** Parse a user string like "1,234.50" or "1234.5" into integer paise. */
export function parsePaise(input: string): Paise {
  const cleaned = input.replace(/[,\s₹]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  return new Decimal(cleaned).times(100).round().toNumber();
}

/** Format paise as a grouped rupee string, e.g. 123450 -> "1,234.50". */
export function formatPaise(p: Paise, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const d = new Decimal(p).div(100);
  const neg = d.isNegative();
  const abs = d.abs();
  // Indian grouping (lakh/crore) to feel native to Tally/Busy users.
  const [int, frac = '00'] = abs.toFixed(2).split('.');
  const grouped = groupIndian(int);
  const body = `${grouped}.${frac}`;
  const s = (opts.symbol ? RUPEE + ' ' : '') + body;
  if (opts.sign) return neg ? `(${s})` : s;
  return neg ? `-${s}` : s;
}

function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Signed balance helper: debit positive, credit negative. */
export function signed(amount: Paise, drcr: 'D' | 'C'): Paise {
  return drcr === 'D' ? amount : -amount;
}

export function balanceLabel(signedPaise: Paise): { text: string; drcr: 'D' | 'C' | '' } {
  if (signedPaise === 0) return { text: formatPaise(0), drcr: '' };
  const drcr = signedPaise > 0 ? 'D' : 'C';
  return { text: formatPaise(Math.abs(signedPaise)), drcr };
}
