# CAPITAL v2 — Build Contract (read before writing any module)

v2 is a ground-up modern rewrite of the PACE / CAPITAL PLUS accounting app. It
must feel superior to Tally Prime / Zoho Books / Busy in UI and ergonomics,
**while preserving every legacy PACE keystroke** (number hotkeys, F-keys, Esc,
Enter) so existing operators keep their muscle memory — and adding full mouse
interaction as a peer.

## Stack (already set up — do not change)
- Vite + React 19 + TypeScript (strict)
- Tailwind CSS with semantic tokens (see `src/index.css`, `tailwind.config.js`)
- Dexie (IndexedDB) persistence — `src/db/db.ts`
- Zustand session store — `src/store/session.ts`
- Hash routing (`react-router-dom`)
- `decimal.js` money — NEVER use floats for money

## Shared APIs you MUST reuse (do not re-invent)
- **Domain types:** `src/types/model.ts` — Company, Group, Ledger, Voucher,
  VoucherLine, Member, Bill, etc. All money is **integer paise**.
- **Money:** `src/lib/money.ts` — `parsePaise`, `formatPaise`, `signed`,
  `balanceLabel`. Indian digit grouping built in.
- **DB:** `src/db/db.ts` — `db.ledgers`, `db.vouchers`, … and `uid()`.
- **UI primitives:** `src/ui/primitives.tsx` — `Button` (supports `hotkey`
  prop), `Card`, `PageHeader`, `Field`, `Input`, `Badge`, `EmptyState`. Use
  these, and Tailwind semantic classes (`bg-surface`, `text-fg`, `border-border`,
  `text-brand`, `tabular` for numbers). Never hardcode hex colors.
- **Keyboard:** `src/keyboard/HotkeyProvider.tsx` —
  - `useHotkey(combo, label, fn, { scope })` registers a key (e.g. `'f1'`,
    `'enter'`, `'esc'`, `'1'`, `'ctrl+s'`).
  - `useScope('voucher-entry')` activates a scope while a screen is mounted;
    deepest scope wins, falling back to `'global'`.
  - Legacy map to honor: Voucher pick 1-7, ledger pickers F1/F2/F4, Esc=back,
    Enter=confirm/next-field. Always ALSO provide a mouse path.

## Where your module goes
Each module is ONE top-level screen component with internal `<Routes>`:
- Masters → `src/screens/masters/MastersModule.tsx` exporting `MastersModule`
- Vouchers → `src/screens/vouchers/VouchersModule.tsx` exporting `VouchersModule`
- Reports+Books → `src/screens/reports/ReportsModule.tsx` exporting `ReportsModule`
  (also handles the `/books` route screens; export `BooksModule` too)

Put shared engine logic in `src/engine/` (e.g. `posting.ts`, `balances.ts`,
`billing.ts`). The main agent wires your module into `src/App.tsx` by swapping
the matching `<Placeholder>` for your exported component — so just export the
component; do not edit `App.tsx` yourself (avoids merge conflicts).

## Accounting rules (from /SUMMARY.md Part II — authoritative)
- Double-entry: every voucher balances (sum of debits = sum of credits).
- Legacy groups: 11-19 liability, 21-29 asset, 31-39 income, 41-49 expenditure;
  codes ending 9 = surplus/deficit.
- Balance sign convention: debit positive, credit negative (see `signed()`).
- Trial Balance, Ledger, Balance Sheet, Income & Expenditure derive from
  ledgers + voucher postings. Society billing: MIT rates → Bill → post to member
  ledger. See SUMMARY §"Deep Dive: The Accounting Engine" and "Billing Engine".

## Quality bar
- `npx tsc -b` and `npx vite build` must stay green.
- Light AND dark themes must both look right (use tokens only).
- Every screen: keyboard-drivable end to end AND mouse-drivable end to end.
- Seed/demo data is welcome so screens aren't empty, but guard for empty DB.
