# PACE / CAPITAL PLUS — Complete Project Summary

A full technical and functional reference for this application, reconstructed by
reverse-engineering the data tables, the program binary, and the bundled manual.
For how to **run and deploy** it, see [README.md](README.md); this document
explains **what it is, how it's built, and how it works** in depth.

> **Status of verification.**
>
> - **Static analysis — done.** All 121 data tables parsed, `PACE.EXE` strings
>   read, all 30 manual files converted. Everything in this document comes from
>   that.
> - **Boot — verified.** `PACE.EXE` was run headlessly under the bundled
>   DOSBox-X against a throwaway copy of the tree (live data never touched). The
>   FoxPro DOS extender initialized cleanly — **XMS allocated (50 handles), EMS
>   page frame set, zero fatal/`Can't alloc`/VCPI errors** — and the app switched
>   the display into its own video mode (640×480 → 720×400 → 720×540) and sat at
>   its menu waiting for input. So the app loads and runs on this machine.
> - **Interactive QA — still human-run.** Creating a society and entering every
>   voucher/report means driving the FoxPro keyboard menus and reading each
>   screen. That can't be automated reliably or safely (blind keystrokes risk the
>   wrong menu, e.g. the Day Book DELETION option, and can't be verified without
>   seeing the screen). The [Test Plan](#test-plan-manual-human-run) is the path
>   to a verified "0 errors" on those steps: a human runs it at the keyboard.
>
> Do not read this summary as a claim the full workflow was exercised — only that
> the app boots and its runtime environment is sound.

---

## 1. What it is

**CAPITAL PLUS** (engine `PACE.EXE`) is a DOS double-entry financial accounting
package built in **FoxPro 2.5 for DOS**, by **Databyte Computers / SAKET
Consultant** (contact `james_desouza@hotmail.com`). The binary is a 16-bit
MS-DOS executable; the latest internal version string seen is **v6.04** (INFO.AID
banners v5.00).

The core ledger engine is generic. Its install prompt offers six entity types —
`COMPANY`, `NON COMMERCIAL/INDIVIDUAL`, `SOCIETY`, `COMMISION AGENT`, `CLEARING
AGENT`, `COMMUNICATION CENTRE` — so the same engine serves plain company
bookkeeping, personal accounting, and commission/clearing agents. Its **flagship
use is co-operative housing-society maintenance billing and accounting**:
per-flat charge matrices, bill generation, interest on arrears, rebates, member
ledgers and the society's Income & Expenditure account and Balance Sheet.

- One **society/company** = one data module = one subfolder under `PACE/`.
- Up to **99 societies per drive**.
- A separate Windows add-on, **Society Plus** (`attic/SocietyPlus3.06.exe`),
  layered statutory forms, mailing lists and a diary on top — out of scope here.

---

## 2. Architecture & how it runs

### 2.1 Why `PACE.EXE` cannot run natively

`CAPITAL/PACE.EXE` is a **16-bit MS-DOS binary** (`file` → `MZ for MS-DOS`),
compiled with the FoxPro 2.5 DOS runtime — its own strings say `FOXPRO DOS,
Copyright (C) Microsoft Corporation` and `%foxprox -MAXI 64 -MAXR 65535`. It is
linked against a DOS extender that uses **XMS / VCPI / VDS** to reach extended
memory from real/V86 mode (`pages from XMS driver`, `pages from VCPI (EMS
emulator)`, `XMS version =`).

None of that exists on a modern OS:

- **64-bit Windows** removed **NTVDM**, the subsystem that ran 16-bit DOS
  binaries — the EXE simply cannot load.
- **macOS and Linux** never ran DOS binaries at all; no DOS personality, no
  extender, no BIOS to satisfy the XMS/VCPI calls.

The fix is a full PC emulator — **DOSBox-X** — that reconstructs a real DOS
environment including the memory managers the extender expects.

### 2.2 The mount-as-C: trick

Every file path compiled into `PACE.EXE` is **drive-less and root-anchored**:
`\capital\control.pro`, `\capital\co.dbf`, `\PACE\*.*`, `\pace\insta2.lan`,
`\pace\bilreg.lan`. No `C:`, no parent folder. The program assumes it lives
directly off the root of its drive (the original install was the network share
`\\SAKET2\D`).

So the launchers mount **this project folder itself** — the one with `CAPITAL/`
and `PACE/` as immediate children — as the DOS `C:` drive. Then `\capital\…` and
`\pace\…` resolve correctly. The mount is a **live host folder, not a disk
image**, so every read/write lands directly on `CAPITAL/`, `PACE/` and
`PACE/<society>/` as ordinary files you can back up and inspect with normal
tools. Nothing is written elsewhere except a throwaway emulator config in the
system temp dir, regenerated each launch and deleted on exit.

### 2.3 The generated `[autoexec]`

```ini
[autoexec]
mount c "<this folder>"
c:
set PATH=%PATH%;C:\CAPITAL
cd \CAPITAL
del *.tmp
pace -t
exit
```

| Line | Why |
|---|---|
| `mount c "<folder>"` | bind the project folder as DOS `C:`, so root-anchored paths resolve |
| `set PATH=…;C:\CAPITAL` | let `pace` and `ARJ.EXE`/`browse.com` be found by bare name |
| `cd \CAPITAL` | FoxPro must start from the dir holding `CONTROL.PRO`, `BLACK.BOX`, `CO.DBF`, `FOXUSER.DBF` |
| `del *.tmp` | clear FoxPro temp files left by an unclean exit, which otherwise trip file-lock errors |
| `pace -t` | launch the app (`-t` is an app-defined flag, leave as-is) |
| `exit` | close DOSBox-X when the user quits, returning to the host cleanly |

`--shell` mode replaces the last three lines with an interactive DOS prompt for
diagnosis.

### 2.4 Emulator config — every setting and its reason

| Setting | Value | Reason |
|---|---|---|
| `machine` | `svga_s3` | video card the app's text/graphics modes expect |
| `memsize` | `16` | RAM pool backing the XMS/VCPI managers |
| `core` / `cputype` / `cycles` | `dynamic` / `pentium` / `max` | JIT core, run the 1995 app flat out |
| `aspect` / `scaler` | `true` / `none` | original pixel aspect, no smoothing |
| `ver` | `7.1` | DOS version reported to the extender |
| `xms` | `true` | **required** — the FoxPro extender allocates via XMS |
| `ems` | `true` | the extender also probes VCPI/EMS; avoids init failure |
| `file access tries UTF-8` | `true` | **the critical one** — see below |
| `ipx` | `false` | app uses file-locking LAN sharing, not IPX |

**`file access tries UTF-8`** is the setting most likely to cause
silent-corruption-looking bugs if missed. The society folder `01»` is stored on
the macOS (APFS) disk as bytes `30 31 C2 BB` — ASCII `01` plus the UTF-8
encoding (`C2 BB`) of `U+00BB` (»). Inside DOS the name is a **single high
byte** in the active code page; DOSBox-X's UTF-8 option does the 1-byte ↔
2-byte-UTF-8 translation transparently, so FoxPro's `\PACE\*.*` directory scan
sees the single-byte name it expects. (Note the byte is code-page dependent:
`U+00BB` "»" is byte `0xAF` in CP437 and `0xBB` in CP1252 — `0xBB` in CP437 is
actually "╗". What matters is that the host-UTF-8 ↔ DOS-byte mapping round-trips,
which `chcp 437` + this option ensure.) **Plain DOSBox has no such option** —
society names with high-byte characters come through mangled under it. Use
DOSBox-X.

### 2.5 Launcher fallback chain (emulator discovery)

Each launcher tries, in order:

1. **Bundled** `emu/` build matching the host (CPU-ordered on macOS).
2. **System DOSBox-X** on `PATH` or in standard install locations.
3. **Flatpak** `com.dosbox_x.DOSBox-X` (Linux).
4. **Plain `dosbox`**, flagged degraded (ignores the UTF-8 option).
5. Else exit with the right per-OS install hint.

This copy ships only `emu/mac-arm64/dosbox-x.app` (DOSBox-X 2026.10.01). See the
README's table for what to drop into `emu/win64/`, `emu/mac-x86_64/`, etc. to
make other platforms self-contained.

### 2.6 macOS TCC / quarantine / EPERM

Two separate macOS problems, two mechanisms:

- **Quarantine on the bundled emulator** — anything from download/USB/AirDrop
  gets `com.apple.quarantine` and Gatekeeper blocks it. `PACE.sh`'s
  `clear_quarantine()` strips the flag (with a `find … xattr -d` fallback, since
  recent macOS ships an `xattr` without working `-r`), re-signs the bundle
  ad-hoc, and drops a `.pace-cleared` marker so it runs once.
- **TCC disk-access denial on the app bundle** — when the folder is on an
  external/USB/network volume, a Finder-launched ad-hoc-signed bundle is refused
  with a bare `Operation not permitted` and **no consent dialog**. `PACE.app`
  works around this by doing **no filesystem work itself** and handing off to
  `open -a Terminal PACE.command` (AppleScript fallback prompts an acceptable
  "control Terminal" dialog). `PACE.command` then `exec`s `PACE.sh` under
  Terminal's existing disk grant. This is why `PACE.command` is the reliable
  fallback when `PACE.app` is denied.

---

## 3. Data model

### 3.1 Master-vs-society architecture (empirically proven)

`PACE/` is the **master template set** — every `.DBF`/`.LAN` is a near-empty copy
of a table schema (record counts almost all 0, a few hold universal pick-lists
like `MONTH.LAN`=12, `GROUP.LAN`=25). When a society is created, the master
tables are **copied into a new subfolder** named after the society code (here
`01»`), and the app fills those copies with live data — e.g. `GLTX.LAN` grows
from 0 records in the master to 439 in society 01; `GLMAS.LAN` 6 → 72.

The society folder also accumulates **30 working/report tables that don't exist
in the master at all** (`TEMP*`, `TMP*`, `TRIAL`, `PAY_OLD`, `CASHBANK`,
`CHQRET`, `BRS`, `SLIP`, `TDS`, …), created on demand by report and
reconciliation routines.

`.DBF`/`.LAN` are the same dBase III/FoxPro format (the `.LAN` extension is just
a rename). Each is paired with a `.CDX` compound index and sometimes an `.FPT`
memo store. `FOXUSER.DBF/.FPT` is the FoxPro runtime resource file, not business
data.

> **Schema drift:** a few tables differ slightly between master and live copy
> (e.g. `SOCFILE.PAIDAMT` present in master, absent in society; `GLTX.C_CENTRE`
> `C(2)` vs `C(6)`) — from uneven version upgrades over the years.

### 3.2 Tables by module

**General ledger / chart of accounts**

| Table | Records (master/soc01) | Purpose |
|---|---|---|
| `GLMAS.LAN` | 6 / 72 | Chart of accounts — one row per ledger head (code, group link, name, opening/current balance, interest flags) |
| `GLTX.LAN` | 0 / 439 | Main journal — every double-entry posting (doc no/date, ledger, contra, amount, narration, cheque, cost centre) |
| `SLEDGER.DBF` | 5 / 5 | Secondary/subsidiary ledger master |
| `GROUP.LAN` / `GROUP1.DBF` | 25 / 20 | Account group master (Assets/Liabilities/Income/Expense, schedule flags) |
| `SUBGROUP.LAN` | 0 / 0 | Sub-groups under a group |
| `PRO_LOS.DBF` | 3 / 3 | P&L summary extract |
| `INDEX.DBF` | 23 / 23 | Internal catalog of each table's index files/key expressions |

**Debtors / creditors & statutory audit**

| Table | Records | Purpose |
|---|---|---|
| `DR.DBF` / `CR.DBF` | 0 / 23 | Debtors / creditors register & ageing |
| `3CD.DBF` | 0 / 0 | Income-Tax Form 3CD audit annexure (loans/deposits by mode, §269SS/269T) |

**Society maintenance billing**

| Table | Records | Purpose |
|---|---|---|
| `SOCFILE.LAN` | 0 / 0 | Flat/unit master — area, bill amount, rebate per flat |
| `MIT.LAN` | 0 / 29 | Maintenance Item Table — per-flat matrix of 16 monthly charge heads (rate master) |
| `BILREG.LAN` | 0 / 36 | Bill register — one row per bill issued, 16 charge columns + interest + arrears |
| `BILTX.LAN` | 0 / 116 | Bill transaction history — superset of BILREG incl. interest-on-arrears calc |
| `BILLS.LAN` / `PAID.LAN` | 0 / 0 | Bill-vs-payment matching / allocation |
| `C_PCO.LAN` | 0 / 0 | Telephone/PCO call-charge billing |
| `NARATION.LAN` / `NARRAT.LAN` | — | Per-document and canned narration text |
| `LAYOUT.LAN` | 4 / 4 | Print-layout column definitions |

**Banking / bank reconciliation**

| Table | Records | Purpose |
|---|---|---|
| `BANK.LAN` | 0 / 1 | Bank account master |
| `BRS.DBF` | — / 59 | Bank Reconciliation Statement entries (society-only) |
| `BRS_CL.LAN` / `ADD_PAY` / `ADD_REC` | 0 / 0 | Cleared list + extra reconciliation payments/receipts |
| `CHQRET.DBF` | — / 1 | Cheque-returned (bounced) register |
| `SLIP.DBF` | — / 47 | Bank deposit slip register |
| `CASHBANK.DBF` | — / 3 | Cash↔Bank ledger pairing used by entry screens |
| `PETTY.DBF` / `PETTY1.LAN` | 0 / 11 | Petty cash voucher register |
| `TRAV.LAN` | 0 / 0 | Travel expense voucher register |

**Tax / TDS**

| Table | Records | Purpose |
|---|---|---|
| `TAXMAS.LAN` | 7 / 7 | Tax rate master (VAT/sales-tax codes & %) |
| `TAXTX.LAN` | 0 / 0 | Per-invoice-line tax breakup |
| `TDS.LAN` / `TDS1.LAN` | — / 0 | TDS deduction register + deductee/certificate master (PAN, circle) |

**Inventory / invoicing (J4 module — commercial build)**

| Table | Records | Purpose |
|---|---|---|
| `PRODUCT.LAN` / `PROD_GP.LAN` | 0 / 0 | Product/item master + group |
| `INSTOCK.LAN` | 0 / 0 | Stock movement (in/out) |
| `J4INV.LAN` | 0 / 0 | Sales invoice / delivery-challan header + lines |
| `J4UNIT.LAN` | 15 / 15 | Unit-of-measure conversion master |
| `REGY.DBF` | 0 / 0 | Sales/purchase register with tax & stock impact |
| `EXPENSE.DBF` | 0 / 0 | Expense voucher register |
| `LAB.LAN` | 0 / 0 | Party/ledger address book with contact details |

**Config / installation masters**

| Table | Records | Purpose |
|---|---|---|
| `INSTA.LAN` | 1 / 1 | Core company profile — name, address, tax reg nos, ~75 module flags; holds the `SEC`/`RET` security fields |
| `INSTA2.LAN` / `INSTA22.LAN` | 1 / 1 | Invoice/bill print-layout config (headers, footers, column widths) |
| `INSTA3.LAN` | 1 / 1 | Party/invoice numbering & widths |
| `INSTA4.LAN` / `INSTA44.LAN` | 0 / 28 | Bill heading/title text per cycle |
| `INSTA5.LAN` | 1 / 1 | Maintenance-bill letter text + interest/grace/rebate rules |
| `MONTH.LAN` | 12 / 12 | Month master + interest % per month |
| `SIGN.LAN` | 0 / 0 | Authorized signatory |
| `EXTRA1–7.LAN` | 0 | User-defined pick-lists |
| `COST.LAN` | — / 0 | Cost-centre master (society-only) |

**Working / report-extract tables** (society-only, built on demand):
`TEMP1/2/3`, `TMP`, `TMP8`, `TMPA` (opening-balance build), `TMPD` (debit column),
`TMPX` (monthly extract), `TRIAL.DBF` (trial balance), `MIDDLE.DBF`,
`PAY_OLD.DBF` (archived journal), `BK`/`BK2` (pick-lists), `BANK0`, `MAY.LAN`
(monthly MIT snapshot), `DATA1`/`FORM1` (letter templates).

> `NOTEPAD.LAN` is **not a table** — it's a 29-byte plain-text developer note
> ("what to do to print bills ?") left in the data folder.

### 3.3 Security fields

`SEC`/`RET`/`CODE_L` in `INSTA.LAN` and `SECURE1` in `INSTA2.LAN` hold the
registration/security codes (the same `SEC` field the archived `crack.bat`
blanks). Their **values were deliberately not read**. The installation unlock
**Codeword `james`** is a fixed code openly printed in the bundled `HELP.AID`,
not a user secret.

---

## 4. Features & workflows

### 4.1 Main menu

```
0. Quit            (also: CANCEL / QUIT / SWITCH TO / CREATE SOCIETY)
1. Master Maint.   Ledger accounts, groups, member details, narrations, banks
2. Voucher Entry   Bank / cash / petty-cash vouchers, journal, memo
3. Bills/Vouchers  Generate / print / delete / re-bill, receipts, outstanding
4. Account Books   Cash/bank/petty/journal books, bill & member registers
5. Reports         Ledger, Trial Balance, Income & Exp, Balance Sheet, Cash Flow
6. Open/Clos Bal.  Opening & closing balances as on any date
7. Accessories     Mailing, labels, BRS, backup/restore, reminders, help
8. Setup           Design bill, change password, advanced settings
9. Installation    Company name, accounting period, super-user password
```

The **Quit screen doubles as the society switcher/creator**: `CANCEL ; QUIT ;
SWITCH TO ; CREATE SOCIETY`.

### 4.2 Account groups

Four broad groups — **Liabilities, Assets, Income, Expenditure** — each up to 10
sub-groups. Group numbers 11–19 = Liabilities, 21–29 = Assets, 31–39 = Income,
41–49 = Expenditure; those ending in 9 are reserved for "Excess of
Income/Expenditure." Groups can be renamed, placed inner/outer column in the
Balance Sheet, or given a schedule number.

### 4.3 Voucher / transaction types

Bank Receipt, Bank Payment, Cash Receipt, Cash Payment, Petty Cash, Journal
Voucher, **Memo Voucher** (temporary, bulk-deletable), **Contra** (cash↔bank or
bank↔bank, entered once via Bank Receipt/Payment selecting Cash), bill-linked
Receipt / Re-billing, Rebate auto-JV. The commercial build adds Sales, Cash
Sales, Purchases, Cash Purchase, and Customer/Supplier Credit/Debit Notes.

Entry screens: auto-incrementing doc no, ledger selection by typing or
`<F1>`/`<F2>`/`<F4>` pick-lists, narration (cheque no/date/bank in receipts).
Edit by doc number or `<F12>` to search by date/amount range.

### 4.4 Member / flat details (society billing)

Per flat: Wing, Flat No (Unit), Area, Title, **Category** — `S`=Shop, `G`=Garage,
`L`=Gala, `O`=Office, `P`=Parking, `U`/`F`=Unit/Flat, plus `N`=no interest
charged, `X`=omit from billing (also used to retire a transferred member) —
Opening Balance and Opening Interest.

### 4.5 Billing engine

- **Generate → Print → Update** (Update posts bills to each member's ledger;
  idempotent, safe to repeat).
- **Library Option** — save/load named rate templates (e.g. "JulyRate").
- **Rebate Options** — fixed/percentage/paise, by area or bill amount, auto-JV.
- **Interest** — simple interest on arrears; Method A (grace/due-date, daywise or
  monthwise) or Method B (on earlier-month balance); per-item interest-free
  exemptions; interest wording user-replaceable (e.g. "Penalty").

### 4.6 Books & reports produced

**Books:** Petty Cash Book, Cash Book, Bank Book, Journal Book, Memo Voucher
Book, Bill Register, Member's Register, Summary Register, Collection Register,
Complete Register.

**Reports:** Ledger (alphabetical/accountwise/members), Trial Balance
(+ Consolidated/Composite), Income & Expenditure Account (T or vertical), Balance
Sheet (T or vertical, with schedules), Cash Flow Statement, Income & Expenditure
Analysis, Expense Summary, Cost Centre Report, Financial Status Report (for MC
meetings), Receipts & Payments, Outstanding List (with ageing), Payment/Receipts
Registers, Bank Reconciliation Statement, Reminder Letters, labels/address book,
and (commercial build) Taxation / Service Tax reports.

### 4.7 Bank reconciliation

Accessories → Bank Reco. → select bank → select month → tick cleared entries
against the statement with spacebar → handle unticked/previous-year items and
bank charges → Generate to view/print the BRS. "Untick BRS" reverses a month.

### 4.8 Backup / restore (uses `ARJ.EXE`)

Confirmed in the binary:
```
backup:  run arj a &filename /vva /r … /m3 &lane
restore: run arj e /vva /r &jam /y
```
Accessories → Back/Res Data → Backup → choose drive → filename → produces
`<drive>:\<filename>.arj` via the bundled `CAPITAL/ARJ.EXE` (on the DOS `PATH`).
`browse.com` is needed for on-screen report preview. **A full data backup = copy
`CAPITAL/` + `PACE/`** — that is the entire state.

### 4.9 Passwords

Two levels: **User Password** gates entry to a society module; **Superuser
Password** allows view-only of all books/reports but blocks add/edit/delete. Max
5 characters; blank clears it.

---

## 5. How a user sets up a society (distilled walkthrough)

1. **Create** — Quit → Create Society → name → Create New Company → say **N** to
   "Copy Previous Year's Master Files?" (first year) → **Switch To** it.
2. **Install** — blank password → "Install the Package?" **Y** → Codeword
   `james` → Society Name, Address/Regn No. (optional), Accounting Period.
3. **Ledger accounts** (Master Maint. → Create Account) — one per member (Group
   "Member's Dues", with opening balance), one per bill line item (Maintenance,
   Parking, Water, Sinking Fund, Interest on Arrears…), plus all other
   B/S and I&E ledgers.
4. **Member details** (Master Maint. → Member Details) — Wing/Flat/Area/Title/
   Category/Opening Balance/Opening Interest.
5. **Design the bill** (Setup → Society Bill Setup) — society header, interest
   rate + ledger, bill structure date, each bill item's text + register heading +
   auto-post ledger.
6. **Enter rates** (Member Details → "Allow editing of Rates" = Y) — per-member
   column rates; copy/fill shortcuts `<F1>`–`<F12>`, Ctrl+A areawise, Ctrl+M/Ctrl+D
   multiply/divide.
7. **Generate & update bills** (Bills/Vouchers → Bills/Receipts → Generate →
   Print → **Update**).

Routine ongoing work: Receipts/Payments via Voucher Entry (member via `<F4>`),
Journal Vouchers for adjustments (depreciation, year-end surplus transfer),
Re-billing to correct posted bills. **Year-end rollover:** create a new module
copying previous master files, finalize the old year, then Setup → Advance
Settings → Refresh Opening Balance to pull closing-as-opening (ledger
names/groups must match exactly).

---

## 6. File & folder map

```
new/
├── PACE.app / PACE.command / PACE.cmd / PACE.sh / PACE.desktop   launchers
├── README.md            run & deploy guide
├── SUMMARY.md           this document
├── CAPITAL/             the program (17 runtime files + PACE.EXE)
├── PACE/                master templates (56 tables) + 01»/ (live society data)
├── emu/mac-arm64/       bundled DOSBox-X 2026.10.01 (Apple silicon)
├── eMANUAL/             user manual (30 RTF files + viewer)
└── attic/               archived, not used at runtime
    ├── dos-installers/  1990s install .BATs (superseded by launchers)
    ├── licence-tooling/ crack.bat etc. — licence bypass, inert, unwired
    └── SocietyPlus3.06.exe   vendor's later Windows product
```

---

## 7. Test plan (manual, human-run)

Run on the real copy. "Expected" = what you should see; a mismatch is a defect.
Do the steps in order — later ones depend on earlier state. Use `PACE.command`
(or `./PACE.sh`) to launch.

**0. Pre-flight**
1. `./PACE.sh --check` → expect `societies : 01»`, `emulator : bundled
   mac-arm64`, `ok : ready to run`, exit 0. If `societies` shows `(none)` or a
   mangled name, verify bytes with `ls PACE | od -An -tx1` (expect `…30 31 c2 bb`,
   not `3f`/`?`).
2. `./PACE.sh --conf` → matches §2.3/§2.4 with your real path in `mount c`.

**1. Launch each way**
3. `./PACE.sh` → DOSBox-X window at 1280×800, DOS boots, `pace -t` runs, the
   CAPITAL splash/menu appears with **no** `XMS`/`VCPI`/`Can't alloc` error.
4. Quit back to DOS → window closes (the `exit` fires).
5. Double-click `PACE.app` → a Terminal window runs the same session. If denied
   (`Operation not permitted`), use `PACE.command` or grant Files-and-Folders
   access.
6. Double-click `PACE.command` → identical to step 3.

**2. Create dummy society "02"**
7. Main menu → Quit → **CREATE SOCIETY** → code `02`, name "TEST SOCIETY 02".
8. Quit, then host-side `ls -la PACE/` → a new `02»`-style folder with a fresh
   ~126-file set. **Risk:** if the folder name loses its trailing byte or shows
   `02?`, UTF-8/CP437 mapping is failing on **write** — flag immediately.

**3. Opening balances**
9. Re-launch, **SWITCH TO** `02`, enter an **OPENING BALANCE** for one ledger →
   no "record locked"/I/O error; balance shows correctly afterward.

**4. One of each voucher**
10. Create one of each: Cash, Bank Payment, Petty Cash, Bank Receipt, Cash
    Receipt, Journal, Memo (+ Sales/Purchase/Notes if that module is on). Each
    saves and appears in its register.

**5. One of each report/book**
11. Generate & sanity-check: Ledger, Composite Trial Balance, Consolidated Trial
    Balance, Day Book (don't trigger its DELETION option), Receipts Register,
    Payment Register, Monthwise summaries, Bills/Receipts. Each reflects steps
    9–10 and returns to the menu cleanly.

**6. Backup**
12. Accessories → Back/Res Data → Backup → produces a `.arj` via `ARJ.EXE`.
    Host-side, confirm a new `.arj` with a current timestamp and non-trivial size.

**7. Switch societies**
13. SWITCH TO `01»` → its original data shows (not `02`'s). Switch back to `02` →
    its data intact and independent. No cross-contamination.

**8. Clean quit & persistence**
14. Use **QUIT** (not force-close) → DOS prompt flashes, window closes, no
    "abnormal termination."
15. Host-side: `ls -la PACE/02»/` → files from steps 8–12 present, today's date,
    sizes > 0; folder name's raw bytes still end `C2 BB` (`od -An -tx1`).
16. `./PACE.sh --check` → `societies :` now lists **both** `01»` and `02»`.

**Known risk points**
- **`0xBB` society-folder byte** — the biggest "fine on screen, corrupt on disk"
  risk. Verify with `od`, not just `ls`.
- **XMS/extender init** — any `XMS`/`VCPI`/`Can't alloc`/`VDS` text at startup
  means `xms`/`ems` weren't honored (e.g. fell through to a system DOSBox with
  different defaults — check which `emulator :` line was named).
- **File locking** — these are shared dBase/FoxPro tables; never run two
  instances against the same `PACE/` folder at once. `del *.tmp` clears temp
  files, **not** lock files.

---

## 8. Known gaps & honesty notes

- **Not run end-to-end.** Interactive DOS TUI + emulator can't be executed from
  this tooling. §7 is the path to verified 0-errors — human at the keyboard.
- **`emu/` is Apple-silicon only.** Windows/Intel-Mac/Linux need their matching
  DOSBox-X build dropped into `emu/` (README table) to be self-contained.
- **Licence.** `CONTROL.PRO` holds `EXPIRY`/`REGD`/`SAKET CONSULTANT`. If
  expired, renew with the vendor. `attic/licence-tooling/crack.bat` is the
  registration-field wipe — archived, inert, unwired, and needs a FoxPro 2.5
  install that isn't included.
- **Schema drift** between a few master and society tables (§3.1) — cosmetic,
  from years of version upgrades.
```

---
---

# Part II — Deep Detail

> The sections above are the overview. Below is the extreme-detail reference:
> the exact logic and step-by-step mechanics of how every part of the system
> works, reconstructed from the binary (`PACE.EXE` string table), the real data
> tables (byte-level parsing), and the bundled manual. Each deep-dive section is
> self-contained and tags its claims as observed fact vs. inference.
>
> Reading order: **Runtime** (boot & config) -> **Data Layer** (on-disk storage)
> -> **Accounting Engine** (ledger money-flow) -> **Billing Engine** (society
> bill computation) -> **Operator's Manual** (every screen, field, keystroke).


---

## Deep Dive: Runtime, Configuration & Security

All file paths below are absolute. `strings` output is cited with its byte
offset inside `PACE.EXE` (via `strings -a -t x`) where available. Facts are
drawn directly from file contents/binary strings; anything inferred from
context rather than an explicit on-disk string is labeled **[inference]**.

### 1. Full boot/execution chain

The host launcher never talks to `PACE.EXE` directly — it only builds a
DOSBox-X config and `exec`s the emulator. The chain, stage by stage:

**1.1 Host launcher selection.** Five entry points, all converging on the
same `PACE.sh`:

- `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh` — POSIX `sh` launcher for
  macOS/Linux. Modes `run` (default), `--check`, `--shell`, `--conf`
  ([PACE.sh](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L12-L32)).
- `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE.cmd` — Windows `.cmd` doing the
  identical job in batch
  ([PACE.cmd](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.cmd#L1-L179)).
- `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE.command` — a 7-line shim that
  just `exec`s `PACE.sh "$@"` under Terminal's own disk permissions, used
  when `PACE.app` is denied filesystem access
  ([PACE.command](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.command#L1-L7)).
- `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE.app/Contents/MacOS/PACE` — a
  33-line shell script (the entire "app" binary is a shell script, not a
  compiled Mach-O) that deliberately touches **no files itself**: it calls
  `open -a Terminal "$TARGET"` where `TARGET="$BUNDLE/PACE.command"`, with an
  AppleScript (`tell application "Terminal" ... do script`) fallback if
  `open -a` fails
  ([PACE.app/.../PACE](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.app/Contents/MacOS/PACE#L1-L33)).
  This hand-off exists purely to dodge macOS TCC/Gatekeeper denial on
  external/USB volumes (documented in
  [SUMMARY.md §2.6](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L153-L169)).
- `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE.desktop` — a Linux XDG desktop
  entry: `Exec=sh -c '"$(dirname "%k")/PACE.sh"'`
  ([PACE.desktop](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.desktop#L1-L8)).

**1.2 Tree verification (PACE.sh, before any emulator work).** The launcher
checks `CAPITAL/` and `PACE/` exist, `CAPITAL/PACE.EXE` exists, and warns
(non-fatal) if `CONTROL.PRO`, `BLACK.BOX`, `CO.DBF`, `LAB.LBX`, `HELP.AID`,
`INFO.AID`, `FOXUSER.DBF` are missing
([PACE.sh#L124-L130](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L124-L130)).
It also enumerates society subfolders under `PACE/` into `$SOCIETIES`
([PACE.sh#L132-L137](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L132-L137)).

**1.3 Emulator discovery.** `find_emulator()` tries, in order: bundled
`emu/mac-arm64|mac-x86_64/dosbox-x.app` (CPU-ordered on Apple silicon),
`PATH`/standard install dirs, Flatpak `com.dosbox_x.DOSBox-X`, then plain
`dosbox` flagged "(plain DOSBox - degraded)"
([PACE.sh#L42-L100](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L42-L100)).

**1.4 Config synthesis + quarantine clearing.** `PACE.sh` writes a temp
DOSBox-X `.conf` (verified live via `./PACE.sh --conf`, full text in §3
below) and, for a bundled emulator, strips `com.apple.quarantine` and
ad-hoc re-signs the `.app`
([PACE.sh#L104-L120](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L104-L120)).

**1.5 DOSBox-X launch.** `exec "$EMU" -conf "$CONF"`
([PACE.sh#L234](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L234)). This
is the hand-off point into the emulator; the guest-side sequence below is
driven entirely by the `[autoexec]` block in that conf file plus the FoxPro
program itself. Not executed in this research — only read from the config
and from `PACE.EXE` strings, as instructed.

**1.6 Guest `[autoexec]` sequence** (observed verbatim via `./PACE.sh --conf`,
and matching `[SUMMARY.md §2.3](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L91-L114)`):

```
chcp 437
mount c "/Volumes/KRYPTIX/test2/CAPITAL/new"
c:
set PATH=%PATH%;C:\CAPITAL
cd \CAPITAL
del *.tmp
pace -t
exit
```

1. `chcp 437` — pins the DOS code page to CP437 *before* any directory scan,
   so the UTF-8↔CP437 filename translation (`file access tries UTF-8 = true`
   in `[dos]`) has a defined target code page. Without this DOSBox-X would
   run at "code page 0" (no translation), corrupting the high-byte society
   folder name `01»` (see §3).
2. `mount c "<project folder>"` — binds the folder containing `CAPITAL/` and
   `PACE/` as DOS drive `C:`. This is required because `PACE.EXE`'s compiled
   paths are drive-less and root-anchored: `\capital\control.pro`,
   `\capital\co.dbf`, `\pace\*.*`, `\pace\insta2.lan`, `\pace\bilreg.lan`
   (all literal strings pulled from the binary, e.g.
   `\capital\control.pro` at offset `0x1281ea` /
   [pace_strings_off.txt](file:///Volumes/KRYPTIX/test2/CAPITAL/new/CAPITAL/PACE.EXE) line 6978).
3. `set PATH=...;C:\CAPITAL` — lets `pace`, `ARJ.EXE`, `browse.com` resolve
   by bare name (`ARJ.EXE` is invoked for backup/restore, `browse.com` for
   report preview, per
   [SUMMARY.md §4.8](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L375-L385)).
4. `cd \CAPITAL` — FoxPro must start from the directory holding
   `CONTROL.PRO`, `BLACK.BOX`, `CO.DBF`, `FOXUSER.DBF` (all root-relative
   `\capital\...` references in the binary assume CWD = `\CAPITAL` for the
   bare-filename opens, e.g. `use &f_control` against `control.pro` at
   offset `0x1281ea`+context).
5. `del *.tmp` — clears FoxPro temp files (`NEST.TMP`, `527790*.TMP` seen on
   disk in `CAPITAL/`) left by an unclean prior exit, which otherwise cause
   file-lock errors on next launch.
6. `pace -t` — the actual program launch, with a command-line flag `-t`.
7. `exit` — closes DOSBox-X when the DOS session ends.

**1.7 `pace -t` flag.** No literal `-t` switch-handling string was found
inside `PACE.EXE`'s string table (searched for `-t `, `PARAMETERS`, etc. —
`PARAMETERS` appears only at generic FoxPro-language-keyword-table locations,
lines 30365/30908 of the strings dump, not tied to a `-t` check)
**[inference]**: FoxPro 2.5 for DOS's own command-line switch set includes a
documented `-t` (no "Talk" result window — functionally the startup
equivalent of `SET TALK OFF`); this is almost certainly a native FoxPro
runtime switch intercepted by the extender's own argument parser before the
compiled main `.PRG` ever runs, not a bespoke CAPITAL/PACE feature. SUMMARY.md
also treats it as opaque: "`-t` is an app-defined flag, leave as-is"
([SUMMARY.md#L110](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L110)).

**1.8 FoxPro DOS extender init (observed strings, not executed here).**
`PACE.EXE` is `file`-identified as `MZ for MS-DOS` (`MS-DOS executable, MZ
for MS-DOS` — confirmed via `file CAPITAL/PACE.EXE`), and its strings carry
the exact invocation of the DOS extender:

```
%foxprox -MAXI 64 -MAXR 65535          (offset 0x13484, strings line 989)
```

This is the command line `PACE.EXE` uses to re-exec/initialize the FoxPro
DOS extender binary `foxprox` (shipped historically as `FOXPROX.EXE`, which
is why `PACE.sh` optionally adds a `FOX25/` tools dir to `PATH` for the
archived developer tools, per
[PACE.sh#L142-L144](file:///Volumes/KRYPTIX/test2/CAPITAL/new/PACE.sh#L142-L144)
— the shipped app itself does not need `FOXPROX.EXE` present, it's bundled
in `PACE.EXE` already).

- `-MAXI 64` → the extender's own `-MAXIBUF` switch (listed in the switch
  table as `maxi[buf]`, line ~636: `maxi[buf]`) — maximum number of internal
  buffers.
- `-MAXR 65535` → the extender's `-MAXREAL` switch (`maxr[eal]`, line ~632)
  — maximum real-mode (conventional) memory in KB usable, capped at 65535
  (i.e. effectively "use up to 64MB-ish of real memory," bounded by the
  16-bit value).

Extender memory-manager probing strings confirm the exact order of operations
documented in SUMMARY.md's "Boot — verified" note
([SUMMARY.md#L14-L18](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L14-L18)):
`pages from XMS driver` (offset `0xd8f2`), `pages from VCPI (EMS emulator)`
(offset `0xd8d2`), `XMS version =` (offset `0xf9f8`), `VCPI version =`
(offset `0xf828`), and numerous `Alloc'd XMS page...`, `Alloc'd VCPI page...`
success-path strings. Failure-path strings that SUMMARY.md's "zero
fatal/Can't alloc/VCPI errors" check was looking for include `Can't alloc
XMS memory:  out of internal data structures`, `XMS memory free page count
and free bit map inconsistent`, `VCPI page limit reduction not met`, and
`VCPI memory free page count and free bit map inconsistent` (all present as
strings in the binary, i.e. the extender *can* emit them on failure, but
none were asserted as having fired — that would require actually running
the emulator, which this task explicitly excludes).

**1.9 CONTROL.PRO license check.** After the extender/runtime initializes
and the FoxPro program begins executing, the compiled `.PRG` opens
`\capital\control.pro` (string at offset `0x1281ea`/`0x12b8f4`/`0x133e15` —
three separate call sites in the binary) via `use &f_control` /
`use &adfile`. The surrounding strings show the actual gate sequence:

```
Enter  Code :                (offset 0x133d9f)
\capital\control.pro          (offset 0x133e15)
JAMES / HELLO / james / hello (offsets 0x133e47, 0x133f5b, ...)
INVALID  COPY  OF  PACKAGE !!!  (offset 0x133ebc)
PRESS  ENTER  KEY
```

i.e. the app prompts "Enter Code:", reads `control.pro`, and compares against
a fixed codeword (case-insensitive, matching both `JAMES`/`james` and a
`HELLO`/`hello` pair) — rejecting with `INVALID  COPY  OF  PACKAGE !!!` on
mismatch. This is the installation Codeword flow HELP.AID documents openly:
"You will be prompted to enter the Codeword. Enter \"james\" in lower or
UPPER case." (`HELP.AID` line 69). Separately, earlier in the same control
flow the binary also carries a demo/registration banner block:

```
D E M O   C O P Y                         (offset 0x1282a8, 0x12cc2f)
Call  26185162 / 9820335565 for
Authorised  Copy
DATABYTE
DEMONSTR
Please Authenticate your Copy via CD or call Databyte Computers
```

and, elsewhere, the company-register prompt `Regd. to : F` (strings dump
line ~7271, immediately after a second `\capital\control.pro` open at
offset `0x12b8f4`) and `Registered To:` (line 29968, offset near
`Demonstration Edition` at `0x22ae5d`). This is the control.pro-driven
"registered to / demo" banner shown at startup, consistent with the
on-disk `CONTROL.PRO` contents (§4).

**1.10 Company/society picker → password → main menu.** After the license
check, the binary's own menu strings show: `No Companies Found` /
`Select Company & Press Enter` → company/society selection → `  Enter
Password ` / ` Invalid Password Entered ...` (offset `0x1285de` for the
password prompt) → on success, the `Main Menu` (`0. Quit` … `9.
Installation`, strings around line 9064+ in the dump) matching
[SUMMARY.md §4.1](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L300-L313).
The Quit screen doubles as society switcher/creator:
`*V \!CANCEL;\<Q U I T;\<SWITCH TO;\<CREATE SOCIETY` (also present as
`...CREATE COMPANY` for the non-society entity types).

---

### 2. Memory model

The FoxPro 2.5 DOS extender (`foxprox`, invoked via `%foxprox -MAXI 64
-MAXR 65535`) is a V86-mode DOS extender: the compiled 32-bit-ish FoxPro
runtime code actually executes in a protected/virtual-86 hybrid mode and
needs a way to (a) get memory beyond the 1MB real-mode ceiling and (b)
translate linear addresses back to physical addresses so DMA/BIOS calls
still work. Three mechanisms, all referenced as literal strings in
`PACE.EXE`:

- **XMS (eXtended Memory Specification)** — the primary path. Strings:
  `pages from XMS driver`, `XMS version =`, `Total avail XMS mem = %lu
  bytes`, `Allocated XMS block of ... KB at base addr ...`. XMS exposes
  memory above 1MB (and the HMA) through a driver interface (normally
  `HIMEM.SYS`; DOSBox-X's `xms = true` setting makes the emulator provide
  this driver itself). This is why `[dos] xms = true` in the generated
  config is marked "required" — without an XMS provider the extender has
  no handles to allocate from at all (`XMS use disabled because < version
  2.0`, `XMS memory use disabled with -XMS OFF` are the failure strings).
- **VCPI (Virtual Control Program Interface)** — the fallback/companion
  path, used when the extender needs protected-mode page tables but an EMS
  emulator (like `EMM386`/DOSBox-X's built-in one) is present instead of a
  bare XMS driver: `pages from VCPI (EMS emulator)`, `VCPI version =`,
  `VCPI dbg interface init'd`, `%lu pages VCPI memory available`. This is
  why `[dos] ems = true` is set — enabling EMS emulation in DOSBox-X is what
  exposes the VCPI entry point the extender probes for (`EMS emulator
  reports VCPI but doesn't use V86 mode` is one of its sanity-check error
  strings).
- **VDS (Virtual DMA Services)** — needed because XMS-allocated linear
  addresses are not necessarily contiguous with physical memory under a
  V86 memory manager; VDS is the API that translates a linear address used
  by the extender back to a physical address safe for direct hardware
  access. Strings: ` XMS lin addr xlated by VDS to phys addr `, `XMS page
  not used: can't get VDS lock on page at lin addr `, `XMS memory use
  disabled because VDS is not present to xlate lin-->phys`. If VDS isn't
  available, the extender explicitly disables XMS use rather than risk an
  address mistranslation.

**Why `memsize=16`:** the DOSBox-X `[dosbox] memsize = 16` setting is the
emulated machine's total conventional+extended RAM pool (in MB) that
DOSBox-X's internal XMS/VCPI/EMS managers draw from when answering the
extender's allocation calls. 16MB comfortably covers what a 1990s FoxPro
app needs (the extender's own `-MAXR 65535` already caps real-mode usage at
64MB-equivalent in KB terms, and XMS/VCPI allocations beyond that come from
this same pool) without wasting emulated RAM or slowing emulation.

**MAXI 64 / MAXR 65535, precisely:**
- `-MAXI 64` sets the extender's **`-MAXIBUF`** switch (`maxi[buf]` in the
  switch table) — the ceiling on the number of internal I/O/data-structure
  buffers the extender's protected-mode kernel will allocate. `64` is a
  modest, conservative setting (the extender also exposes `-MINIBUF`,
  default-paired as `-MINIBUF %x, -MAXIBUF %x` in its diagnostic string).
- `-MAXR 65535` sets **`-MAXREAL`** (`maxr[eal]`) — the maximum amount of
  conventional ("real-mode") memory, in KB, the extender will reserve/use
  for real-mode DOS calls and buffers; `65535` is the largest value
  representable, i.e. "don't artificially cap real memory usage; take what
  conventional memory is available."

---

### 3. Emulator config — every setting and the mechanism behind it

Live output of `./PACE.sh --conf` (run from
`/Volumes/KRYPTIX/test2/CAPITAL/new`):

```ini
# Generated by PACE.sh - rewritten on every launch, do not edit.
[sdl]
windowresolution = 1280x800
output           = opengl

[dosbox]
machine = svga_s3
memsize = 16
title   = PACE / CAPITAL

[cpu]
core    = dynamic
cputype = pentium
cycles  = max

[render]
aspect = true
scaler = none

[dos]
ver = 7.1
xms = true
ems = true
file access tries UTF-8 = true

[ipx]
ipx = false

[autoexec]
chcp 437
mount c "/Volumes/KRYPTIX/test2/CAPITAL/new"
c:
set PATH=%PATH%;C:\CAPITAL

cd \CAPITAL
del *.tmp
pace -t
exit
```

Setting-by-setting mechanism:

| Setting | Value | Mechanism-level why |
|---|---|---|
| `machine` | `svga_s3` | Selects an S3-compatible SVGA chipset emulation. FoxPro for DOS's screen builder/report preview switches video modes at runtime (observed in SUMMARY.md's boot test: 640×480 → 720×400 → 720×540); an S3 SVGA profile gives DOSBox-X the broadest standard-VESA-mode coverage so whichever mode FoxPro's video-mode-set call requests is actually available, rather than failing back to plain VGA text/CGA fallback modes. |
| `memsize` | `16` | The MB of RAM DOSBox-X's internal memory controller has to hand out across conventional memory + the XMS/EMS/VCPI pools the extender draws from (see §2). |
| `core` | `dynamic` | DOSBox-X's dynamic (JIT-compiling) CPU core translates guest x86 instruction blocks to host-native code and caches them, rather than interpreting one instruction at a time (`core=normal`). Needed to run a 1995-era extender fast enough to feel instant on modern hardware. |
| `cputype` | `pentium` | Reports a Pentium-class CPUID/instruction set to the guest, matching what the extender/runtime was built and tested against circa 1995; avoids any CPU-detection branch in the WATCOM-compiled runtime (`WATCOM C 386 Run-Time system` string, offset ~line 6605) taking an unexpected path for a newer or 286/386-only profile. |
| `cycles` | `max` | Removes DOSBox-X's per-frame instruction-cycle throttle entirely, letting the dynamic core run at whatever speed the host CPU allows — appropriate for a keyboard-driven TUI app with no legacy cycle-locked timing dependency. |
| `aspect` | `true` | Rescales the output to the original 4:3-equivalent pixel aspect ratio of the DOS video mode, rather than displaying square pixels 1:1, so text/graphics proportions match the 1995 design. |
| `scaler` | `none` | Disables DOSBox-X's pixel-smoothing scalers (e.g. `hq3x`), keeping the original crisp DOS bitmap font untouched — important for a text-heavy ledger app where blurred glyphs hurt legibility. |
| `ver` | `7.1` | The DOS version number DOSBox-X reports to `INT 21h` version queries; the extender/runtime checks this (its own `DOS %02d.%02d` string, line ~30-something context) to decide feature availability — 7.1 (Windows 95 OSR2-era DOS) is a safe, modern-enough baseline that avoids any `< some DOS version` compatibility gate. |
| `xms` | `true` | **Required.** Makes DOSBox-X expose a virtual XMS driver (acting as `HIMEM.SYS`) at the standard XMS entry point, which `foxprox` immediately probes for and allocates from (§2). Without it, the extender's `XMS use disabled...` paths fire and it falls back to much more limited real-mode-only memory. |
| `ems` | `true` | Makes DOSBox-X expose EMS (and, as a side effect of DOSBox-X's EMS emulation, the VCPI entry point) so the extender's VCPI probe (§2) succeeds; prevents the `EMS emulator reports VCPI but doesn't use V86 mode`-class init failures. |
| `file access tries UTF-8` | `true` | **The critical one.** The society folder is named `01»` on disk, stored as bytes `30 31 C2 BB` (UTF-8 for ASCII `01` + U+00BB »). DOS/CP437 represents that same visual character as the single byte `0xBB`. This DOSBox-X-only option makes the mounted-folder driver transparently re-encode between the host's 2-byte UTF-8 sequence and the guest's 1-byte CP437 byte on every directory/file operation, so FoxPro's `\PACE\*.*` directory scan sees the single `0xBB` byte it was compiled to expect. The translation needs a defined code page to map through — hence `chcp 437` in `[autoexec]` runs before any file access, pinning CP437 so the UTF-8↔CP437 table has a defined target (without it DOSBox-X defaults to "code page 0" = no translation, and the `0xBB` byte round-trips incorrectly). Plain DOSBox has no such option, so society folders with high-byte characters come through mangled under it ([SUMMARY.md#L130-L137](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L130-L137)). |
| `ipx` | `false` | CAPITAL/PACE uses ordinary DOS/FoxPro file-locking (`SET MULTILOCKS`/`FLOCK`-style record locks seen in the FoxPro keyword strings, and SUMMARY.md's "never run two instances against the same PACE/ folder" warning) for any multi-user sharing, not an IPX network transport, so IPX emulation is pure overhead and is switched off. |
| `windowresolution` / `output` | `1280x800` / `opengl` (or `direct3d` on Windows) | Host-side display scaling/back-end only — no effect on the guest DOS environment. |

---

### 4. Licensing: CONTROL.PRO, demo state, and expiry

**4.1 File facts — exact structure (decoded, not guessed).** Parsing
`/Volumes/KRYPTIX/test2/CAPITAL/new/CAPITAL/CONTROL.PRO` (135 bytes, dated
15 Feb 2006) as a standard dBase-III `.DBF` (version byte `0x03`, 32-byte
field descriptors, `0x0D` header terminator, `0x1A` end-of-file marker)
gives an exact, unambiguous layout:

```
00000000: 0306 0210 0100 0000 6100 2500 0000 0000  ........a.%.....
00000010: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000020: 4558 5049 5259 0000 0000 0044 0100 0000  EXPIRY.....D....
00000030: 0800 0000 0000 0000 0000 0000 0000 0000  ................
00000040: 5245 4744 0000 0000 0000 0043 0900 0000  REGD.......C....
00000050: 1c00 0000 0000 0000 0000 0000 0000 0000  ................
00000060: 0d20 2020 2020 2020 2020 4445 4d4f 4e53  .         DEMONS
00000070: 5452 4154 494f 4e20 5245 4c45 4153 4520  TRATION RELEASE 
00000080: 2020 2020 2020 1a                              .
```

- Header fixed part (bytes `0x00-0x1F`): version `0x03`; last-update date
  bytes `06 02 10` → stored as 2006-02-16 (close to, but one day after, the
  file's on-disk mtime of 15 Feb 2006 — likely a local/UTC day-boundary
  artifact of the original write, not significant); record count (LE
  `uint32` at `0x04`) = **1**; header length (LE `uint16` at `0x08`) =
  **97** (`0x61`); record length (LE `uint16` at `0x0A`) = **37** (`0x25`).
  97 = 32 (fixed header) + 32 + 32 (two 32-byte field descriptors) + 1
  (terminator) — internally consistent.
- Field descriptor 1, at offset `0x20`: name `EXPIRY`, type byte `0x44` =
  **`D` (Date)**, width byte at offset+16 = `0x08` (8, the fixed width of a
  dBase Date field), decimals `0`.
- Field descriptor 2, at offset `0x40`: name `REGD`, type byte `0x43` =
  **`C` (Character)**, width byte at offset+16 = `0x1C` (**28**), decimals
  `0`.
- Field-descriptor block terminator: `0x0D` at offset `0x60`, exactly as
  required (32+32+32=96=`0x60`).
- The single data record (37 bytes, starting at `0x61` = header length):
  delete-flag byte = `0x20` (space → **not** marked deleted), then
  `EXPIRY` (8 bytes) = `"        "` — **all spaces, i.e. blank/unset**, then
  `REGD` (28 bytes) = `"DEMONSTRATION RELEASE       "` — the literal text
  `DEMONSTRATION RELEASE` left-justified, space-padded to the 28-character
  field width, terminated by the file's trailing `0x1A` EOF marker.

(Decoded with a short Python struct-unpack script against the standard
dBase-III header layout — `version/date/nrec@4/hlen@8/rlen@10`, then 32-byte
field descriptors each `name(11)+type(1)+reserved(4)+len(1)+dec(1)+reserved(14)`
— not by eyeballing the hex.)

**Interpretation (fact, directly from the decoded bytes):** `CONTROL.PRO`
is a **two-field, one-record** license record: `EXPIRY` (a `Date` field,
**currently blank/unset** on this copy — no expiry date is presently
stored) and `REGD` (a 28-character field meant to hold the registrant's
name, **currently populated with the fixed string `DEMONSTRATION RELEASE`
instead of an actual company/registrant name**). Both the blank `EXPIRY`
and the placeholder `REGD` text are consistent with this being an
unregistered/demonstration installation rather than a licensed one with an
expiry date and a registered owner's name on file.

**4.2 How/when the app checks it.** Per §1.9 above, the compiled FoxPro
program opens `\capital\control.pro` via `use &f_control` at at least two
call sites in `PACE.EXE` (offsets `0x1281ea` and `0x12b8f4` in the binary's
string table, both followed immediately by a `Regd. to : F` /
`D A T A B Y T E     C O M P U T E R S` banner print), and a third call site
(`0x133e15`) is wrapped in the explicit "Enter Code:" / codeword-compare /
`INVALID  COPY  OF  PACKAGE !!!` gate. The practical reading: CONTROL.PRO is
read **both** to display the demo/registration banner on relevant screens
(showing `DEMONSTRATION RELEASE` where a paid license would show the
registrant's name) **and** as the back-end record consulted by the
Codeword-gated "Install the Package" flow.

**4.3 "DEMONSTRATION RELEASE" state, factually.** This installed copy's
`CONTROL.PRO` literally contains the string `DEMONSTRATION RELEASE` in its
`REGD` field (the 28-byte character field at record offset 9, i.e. file bytes
`0x6A`-`0x85`, decoded in §4.1 above) — this is the on-disk ground truth
for "what state this copy is in," independent of any runtime banner. The
binary's own demo-mode strings reinforce this is a first-class state the
app is built to represent and display, e.g. `Demonstration Edition` (offset
`0x22ae5d`), `D E M O   C O P Y` / `Call  26185162 / 9820335565 for` /
`Authorised  Copy` / `DATABYTE` / `Please Authenticate your Copy via CD or
call Databyte Computers` (offsets `0x1282a8`/`0x12cc2f` and surrounding
context).

Separately, at offset `0x22fe7f`, the string `This beta version has
expired.` exists in the binary. **[inference]**: this is a *generic FoxPro
2.5 runtime/engine* string (it sits among other FoxPro-engine-level strings
like `Engineering Prototype`, `Demo Serial #`, `Serial #`, `Feature not
available in Demo version`, `Overwrite invalid FoxUser file...` — all
properties of the Microsoft FoxPro runtime itself, not of the
CAPITAL-specific `.PRG` logic), i.e. it is the FoxPro *compiler/runtime's
own* beta-expiry message rather than a CAPITAL-application-level expiry
check. The CAPITAL-level expiry mechanism is the `EXPIRY` date field inside
`CONTROL.PRO` (§4.1), checked by the application's own code, not this
runtime string.

**4.4 What expiry does — factual limits of what can be said.** The task
scope explicitly disallows reading/decoding the `EXPIRY` date value or
attempting to trigger/bypass the check, so the only facts assertable here
are: (a) `CONTROL.PRO` carries a `Date`-typed `EXPIRY` field; (b) the
observed `REGD` content on this copy reads `DEMONSTRATION RELEASE` rather
than a company name, i.e. this specific copy presents as unregistered/
demonstration; (c) SUMMARY.md's own "Known gaps" section independently
states: *"Licence. `CONTROL.PRO` holds `EXPIRY`/`REGD`/`SAKET CONSULTANT`.
If expired, renew with the vendor."*
([SUMMARY.md#L520-L523](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L520-L523))
— note "SAKET CONSULTANT" (the vendor/registrant name) was **not** found as
a literal string inside this copy's `CONTROL.PRO` bytes (only `EXPIRY`,
`REGD`, and the demonstration-release text were present); it is presumably
the value a *registered* copy's `REGD` field would hold instead, per
SUMMARY.md §1's vendor attribution ("Databyte Computers / SAKET
Consultant"). No bypass mechanism is documented or exercised here; the
archived `attic/licence-tooling/crack.bat` referenced in SUMMARY.md
([SUMMARY.md#L521](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L521))
was out of scope for this task and was not read.

---

### 5. Security model

**5.1 Two-tier password.** `PACE.EXE` strings show two distinct, separately
prompted passwords:

- **User/society password**, gating entry to a society module:
  `  Enter  Password ` (offset `0x1285de`) /
  ` Invalid Password Entered ...`.
- **Superuser password**, gating full edit rights while still allowing
  view-only access: ` Enter Superuser Password ` (offset `0x1352c5`) /
  ` ACCESS ALLOWED ONLY TO SUPERUSER!! `. The setup screens for both are
  explicit: ` PASSWORD SETUP `, ` SUPERUSER PASSWORD SETUP `, `Do You Want
  to Change Password ? `, `Do You Want to Change Super User Password ? `,
  `           Enter New Password :`, `Enter New Super User Password :`.

Both password-entry points share the same on-screen input-scrambling
character map string, repeated verbatim at every password prompt:

```
NO56GklmABCDdegxtEFHIJSTUyz123PR4KLMnopqrsVWXYZabcuvw7890
KINGJAMES~!@#$%^&*()_+nopqrsdegxyz`7,.4<5>1;2:36[9]{}|\/?
```

**[inference]**: this paired string (one "cleartext" charset mapped to a
second "scrambled" charset of equal length, both beginning with/containing
"KINGJAMES") is a classic FoxPro masked-input substitution technique for
password fields — each typed keystroke is looked up in the first string and
displayed as the corresponding character in the second ("scrambled") string
(or as a fixed mask character), so the real password characters are never
echoed to the screen in clear or in a simple `*`-per-char way a shoulder-
surfer could count. This is a *display-masking* mechanism, not a storage or
hashing mechanism — matches SUMMARY.md §4.9's description of the two-tier
model.

**5.2 Field width / blank-clears rule.** SUMMARY.md states both passwords
are "**Max 5 characters; blank clears it**"
([SUMMARY.md#L387-L391](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L387-L391)).
This matches the on-disk schema exactly: in
`/Volumes/KRYPTIX/test2/CAPITAL/new/PACE/01»/INSTA.LAN`, the parsed DBF
field table shows:

```
SEC          C    5 0      <- 5-character field, matches "max 5 chars"
RET          C   10 0
CODE_L       L    1 0
```

and in `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE/01»/INSTA2.LAN`:

```
SECURE1      C   10 0
```

(Field names/widths only were extracted by parsing the standard dBase
field-descriptor header of each `.LAN` file with a small script; **no
record/value data was read**, per task instructions.) `SEC` at width 5
directly backs the "max 5 characters" limit for the password actually
compared at the password prompts; `RET` (width 10) and `SECURE1` (width 10)
are additional security-related fields of larger width whose exact role
(e.g. one may be the Superuser password, or a retired/legacy field) was not
determined without reading values, which was out of scope.

**5.3 Society 01's observed state.** Per the task's own prior observation
(not independently re-verified by reading the value, in compliance with
scope): **society `01»`'s `SEC` (user password) field was blank**, i.e. this
test copy's society module has no user password set — consistent with the
getting-started flow in `HELP.AID` ("Since no Password is set yet, simply
press the Enter Key, whenever prompted to enter the password." —
`HELP.AID` line 65) and with SUMMARY.md's walkthrough step 2 ("blank
password").

**5.4 Installation Codeword.** The fixed word `james` (case-insensitive;
both `JAMES`/`james` appear as literal strings at multiple offsets, e.g.
`0x133e47`, `0x133f5b`) is required once per *new* society/company
installation, at the `Install the Package? Y` → `Enter Code:` prompt
(§1.9). This is **not a user secret**: `HELP.AID` prints it in plain text as
installation guidance —

> "You will be prompted to enter the Codeword. Enter \"james\" in lower or
> UPPER case." (`HELP.AID` line 69)

— and `INFO.AID`/`HELP.AID`'s own banner shows the vendor contact
`E-mail :james_desouza@hotmail.com` (`HELP.AID` line 6), i.e. "james" is a
mnemonic tied to the vendor's own name/email, openly documented as the
install step, functioning as a gate against accidental/blind installation
rather than as a secret license key.

---

### 6. INSTA*.LAN configuration flags — the settings database

Parsed directly from each file's dBase field-descriptor header (field name /
type / width / decimals only — no record values read), from
`/Volumes/KRYPTIX/test2/CAPITAL/new/PACE/01»/`:

**6.1 `INSTA.LAN`** (96 fields, 1082-byte record) — the core company/
society profile. Groups of fields by function:

- *Identity/address:* `CO` (company/society name, C45), `AD1-AD4` (address
  lines, C40 each), `FAD1-FAD4` (factory address, C30 each), `P` (phone,
  C41), `F` (fax, C30), `W`/`R` (work/residence tel, C36), `MOBILE`,
  `EMAIL`, `BST`/`CST` (sales-tax registration numbers, C36 each).
- *Accounting period:* `S_DT`/`L_DT` (Start Date / Last Date, Date fields).
- *Security (values not read, widths only):* `SEC` (C5 — user password),
  `RET` (C10), `CODE_L` (Logical).
- *Module enablement (Logical flags, on/off switches):* `INV` (invoicing?),
  `CR` (credit?), `ST`/`PT`/`ST2`/`PT2` (sales-tax/purchase-tax toggles ×2
  generations), `HLP` (help), `TRAC` (track bills for debtors/creditors —
  confirmed by the prompt string "Track Bills for Debtors/Creditors List
  ?"), `QTY_COL`/`PROD_COL`/`PROD_GP` (quantity/product columns in
  invoices — confirmed by prompts "Quantity Details in Sales/Purchase ?",
  "With Product Column?", "With Product Group ?"), `PC_VOV`/`BK_VOV`
  (petty-cash/bank voucher numbering modes?), `CUR_DISP`, `COST_CEN` (cost
  centres), `MULTI_S`/`MULTI_P`/`MULTI_C` (multiple Sales/Purchase/Cash
  books — confirmed by menu string " MULTIPLE REGISTERS OPTION " / "Multiple
  Sales Register ?" / "Multiple Purchase Register?"), `NEG_CAS` (allow
  negative cash — confirmed by runtime check string "Please Check..,
  Negative Cash Bal. of Rs." ), `SAL_X`/`PUR_X`.
- *Invoice numbering/format:* `C1-C4` (C6, likely numbering prefixes/
  counters), `TR`, `IOL`, `CC`/`CC2`, `DD`/`DD2`, `LL`, `FF` (all C2 —
  short code fields, likely numbering-series codes), `FORMAT` (C1),
  `DECIMA` (N1 — decimal places for quantity, confirmed by "Enter number of
  Decimal points for Quantity" / "Enter 0,2 or 3 as Decimal").
- *Invoice column layout (commercial/J4 module):* `SAL_COL1-4`,
  `PUR_COL1-4`, `SAL_KOL1-4`, `PUR_KOL1-4` (C11 each — column
  header/label text), `SAL_CC1-5`/`PUR_CC1-5` (C10 each — cost-centre-linked
  columns?), `GROSS_PR` (gross profit logical flag).
- *Misc:* `COPY_DT` (backup/last-copy date).

**6.2 `INSTA2.LAN`** (155 fields, 2096-byte record) — invoice/bill
print-layout configuration:

- *Header/body text:* `TOP1`, `VATTOP`, `HEAD`/`HEAD_1` (C75), `I_MES`/
  `I_MES1`/`I_MES2` (invoice messages), `BODY`-`BODY6` (C80 each, free-text
  body lines), `SIGN` (signatory line), `TO` (addressee line).
- *Numbering:* `PREF`/`SUFF` (invoice number prefix/suffix, C8 each),
  `I_FA-I_FD`, `I_F1-I_F6` (C14 — numbered invoice format fields),
  `CODE1-5` (C6 each), `CODE_OPT1`/`CODE_OPT2`.
- *Column/field layout toggles (Logical "on/off"):* `D_F4`, `L_AD1-5`
  (print address lines 1-5?), `P_AD1`/`P_AD2`, `FOOT`, `X_DET`/`X_DET_WID`
  (extra-detail column + its width), `QTY_YN`/`RAT_YN`/`RAT_ROND`
  (quantity/rate shown + rate rounding), `D_UNIT`, `LINK_P`, `TAX_1-5`
  (per-column tax-shown toggles), `PRINT_FELD`, `COMP`, `ADRES`,
  `LIN_TOP`/`LIN_MID`/`LIN_BOT` (separator-line placement), `DASH`,
  `SUB_TOT`/`SUBTOT_LIN`, `TOT_KOL`, `QQQ_TOT`, `UNIT_KOL`/`UNIT_DOWN`,
  `SHOW_AD`, `GRAND_PR`, `ROUND_NUM`/`ROUND2`/`ROUND3`, `PRODCODE`,
  `NO_REF`, `WORDS` (amount-in-words toggle), `SUR_FIRST`, `INKJET` (inkjet
  vs dot-matrix print mode), `SPEC_FUN`, `DISCOUNT`, `XRATE`/`XRAT_NAME`,
  `PRINT_CODE`, `EXCISE`/`EXCISERATE`, `LINNES`, `PRESET`, `TAILOR`,
  `SMALLBILL`, `FEEDAMT`.
- *Dimensions:* `KOLL1-4`, `LIN1-4`, `GAP1`/`GAP2`, `DBAND`, `PART_ROW`,
  `LONG`/`WIDE`, `SKIPLINE`, `XLINENO`, `CHALLANTOP`.
- *Footer text:* `FOOT1-10` (C45), `CFOOTNOTE1-4` (C45).
- *Tax/turnover:* `TURNOVER`/`SURCHARGE` (C16), `TURN_TAX`/`SUR_TAX`
  (N5.2 percentages), `TAX_PRINT`.
- *Security (width only):* `SECURE1` (C10).
- *Other:* `M_AD1-5`/`N_AD1-5` (member-address variants), `LED_NAR`
  (ledger narration link), `BACK_NAME`/`BACK_DRIVE` (backup target),
  `LOG_PATH`, `ITEMLEV1`/`ITEMLEV2`, `CASH2`, `STYLE`, `OPTX`, `OPT1`.

**6.3 `INSTA3.LAN`** (21 fields, 82-byte record) — party/invoice numbering
& widths, the smallest and most narrowly scoped of the four:

- `PARTY_1-3` / `PPARTY_1-3` (C10 each — party/customer code numbering
  series, "current" vs "previous"?).
- `IN_REG_1-3`, `IN_INV_1-3`, `IN_PUR_1-3` (Logical — per-series
  registration/invoice/purchase numbering enable flags, in 3 parallel
  series, matching the "MULTIPLE REGISTERS" concept from `INSTA.LAN`).
- `PW1-3` / `SW1-3` (N2 each — numeric width settings, almost certainly
  "Purchase Width"/"Sales Width" (or similar) column-width pairs for the
  three numbering series).

**6.4 `INSTA5.LAN`** (93 fields, 2518-byte record) — maintenance-bill
letter text + interest/grace/rebate rules (the society-billing-specific
master):

- *Bill header/footer letter text:* `TOP1-7` (C40/C68), `FOOT1-18` (C68
  each — up to 18 footnote lines, matching HELP.AID changelog item 28:
  "Option to have more lines for footnote, now can be extended to 18
  lines."), `FOOT_COND` (Logical — conditional footer), `SIGNA` (C78,
  signatory block), `LETHEAD`/`LET1-8` (C70 each — reminder-letter body
  text).
- *Interest rules:* `IN` (N2 — interest basis/method code), `GRACE` (N2 —
  grace-period days), `PAYBY` (N3), `IN_CD` (C6), `SIMP_INT` (simple
  interest toggle), `RRATE`/`RDAYS`/`RBASE`/`RUNIT` (rate/days/base/unit for
  interest calc), `INTA_MD` (interest method A/B selector), `INT_WORD`
  (C12 — user-replaceable word for "Interest", matching changelog item 27:
  "Option to Replace the Word <Interest> with your own word e.g.
  <Penalty>"), `EARLIERM`/`DDATE` (Dates — earlier-month balance / due
  date, matching the two interest methods described in
  [SUMMARY.md §4.5](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L345-L353)).
- *Rebate rules:* `REBATE` (toggle), `RVALUE`, `RSTYLE`, `RCODE`, `RNOTE`/
  `RNOTETYPE` (rebate auto-narration/journal note).
- *Billing layout/behavior:* `UNIT` (C5), `MQ` (C1), `ROUND_OF`, `BLDG`
  (building-wise toggle, matching changelog item 4: "Cost Centres ...
  building wise"), `PREPRINT`, `PSIZE`/`PMICRO`/`RMICRO`, `XTRAFOOT`,
  `BL_NAME`, `OPTWORD` (C40), `AOMIT`, `MANIPULATE`/`XSTYLE`, `BILL_REC`/
  `BILL_LED`/`BILL_DUE`/`BILL_COL`, `AREA2`/`NBLDG`, `COL1-3`, `XITEMS`
  (16-vs-12-item toggle per changelog item 10), `CASHBASIS`, `RECHEAD`,
  `OMIT_WING`, `OUTS` (outstanding list), `XREF`, `INWORDS` (amount in
  words), `MINIREC` (mini-receipt, changelog item 33/47), `HBOLD`,
  `AREAUNIT`, `PFIX`/`SFIX` (prefix/suffix), `BTOP`/`RTOP`, `OPT1`.

All four files are flat, single-record (`1/1`) configuration masters — one
record per society — consistent with their role as the "settings database"
(SUMMARY.md §3.2's "Config / installation masters" table
([SUMMARY.md#L265-L277](file:///Volumes/KRYPTIX/test2/CAPITAL/new/SUMMARY.md#L265-L277))).
Total across `INSTA.LAN`+`INSTA2.LAN`+`INSTA3.LAN`+`INSTA5.LAN`: 365 fields,
the large majority Logical (`L`) on/off switches — consistent with the
task brief's "~75 boolean/option flags" estimate for the module-enablement
subset alone (many more Logical fields exist across all four files once
print-layout and numbering toggles are included).

---

### 7. Version history (from HELP.AID's changelog)

`/Volumes/KRYPTIX/test2/CAPITAL/new/CAPITAL/HELP.AID` opens with:

```
CAPITAL PLUS FINANCIAL ACCOUNTING PACKAGE
       For Co-operative Societys
             Version  5.00
TEL: 2618 5162    CELL: 98203 35565
E-mail :james_desouza@hotmail.com
```

(`HELP.AID` lines 1-6 — note this banner's "Version 5.00" is the *manual's*
cover version, distinct from the binary's internal version strings; SUMMARY
notes the binary's latest internal version string is v6.04, with INFO.AID
banners at v5.00, i.e. the manual text was not kept in lockstep with every
engine point release.)

The changelog block, headed "LIST OF NEW FEATURES ADDED, SINCE THE LAST
MANUAL PRINTED.." (`HELP.AID` line 642), lists 51 numbered feature additions
(lines 644-770), with explicit version tags embedded inline for the later
entries:

- Item 42 — "Changes in Default Password setup to avoids inserting error
  passwords." — **(v 5.90)**
- Item 43 — "Shows Groups in Opening / Closing Balance Lists & option for
  Nil amounts" — **(v 5.91)**
- Item 45 — "Option in Recepts List for Non Member-related receipts" —
  **(v 5.92)**
- Item 46 — "Option for Replication of Members, to create another set of
  billing ... can also set separate interest rates" — **(v 5.97)**
- Item 47 — "Option for Mini Receipt in Bills, including 2 columnar
  bills." — **(v 6.00)**
- Item 50 — "Oustanding List with Ageing Option (3-3-7)" — **(v 6.04)**

Undated items in the same numbered list (1-41, 44, 48, 49, 51) are earlier,
unversioned incremental features — covering title-copy shortcuts
(Ctrl+T), alphanumeric unit numbers, cost centres, non-billing receipts,
2-column bill printing, 16-item bills (up from 12), receipts & payments
statements, additional member categories (F/L/O/P/U), rebate options,
rateable-value printing/storage, ledger multi-select (F1-F5), per-bill
interest exemption, rate-copy function keys (Ctrl+A areawise, Ctrl+M
multiply, Ctrl+D divide), date-range transaction deletion (password
gated), word-replacement for "Interest"/"Bldg", extended footnotes (up to
18 lines), the "X" category toggle to exclude members from a billing run,
reminder letters, sorted payment lists, bill-date-inclusive payment
crediting, bankwise receipt lists, daywise interest, collection/signature
registers, and Ctrl+S/Ctrl+F search shortcuts. HELP.AID closes this section
with a disclaimer (lines 835-843) and the advice "You are advised to
update the package to keep abreast of the latest."

`INFO.AID` (6893 bytes) is a separate reference document, not a changelog —
it holds the **Profession Tax rate chart** ("w.e.f. 1st April 1999" salary
slabs, `INFO.AID` lines 3-28) and an **"IMPORTANT DATES UNDER DIRECT
TAXES"** table (`INFO.AID` lines 31-98) covering Annual TDS Return due
dates (Forms 24/25/26/27A/26A/26B/26BB/26C, lines 36-53), Income/Wealth/
Gift Tax return due dates for various assessee classes including
"Co-operative Societies" (lines 55-69), Advance Tax installment
percentages/dates for Companies vs Others (lines 74-85), and Half-Yearly
TDS Collection-at-Source return dates (Forms 27EA/27EB/27EC/27ED, lines
87-98) — static Indian income-tax reference data bundled with the package
for the accountant/user's convenience, not functional code.



---

## Deep Dive: Data Layer & File Mechanics

> Method note: every byte offset, hex value, field name, record count, and
> string below was read directly off real files with `od`/`xxd` and a
> purpose-built Python header parser (`dbfparse.py`, written to the scratchpad
> for this task), or lifted verbatim from `strings` output of `PACE.EXE`. Where
> a claim goes beyond what was directly observed (e.g. the semantics of a
> B-tree node's internal bytes, or *why* a `.TBK` file exists), it is marked
> **[inference]**. Everything else is **[observed]**.

### 1. The dBase III / FoxPro 2.5 table format, byte by byte

**[observed]** All business tables in `PACE/` — regardless of whether the
extension is `.DBF` or `.LAN` — share one binary layout: a fixed-size header
describing the schema, followed by fixed-length records, followed by a single
EOF marker byte. This was confirmed by writing a header parser
(`dbfparse.py`) and running it against master and society copies of
`GLMAS`, `GLTX`, `INDEX`, `J4INV`, `REGY`, `SOCFILE`, `FOXUSER`, and others —
all parse with the identical offset table below with no exceptions.

#### 1.1 Header layout (bytes 0–31)

| Offset | Size | Field | Meaning |
|---|---|---|---|
| 0x00 | 1 | version byte | `0x03` = dBase III plain table, no memo (also the value FoxPro 2.5 writes for non-memo tables here) |
| 0x01–0x03 | 3 | last-update date | `YY MM DD`, each a raw byte (not BCD) — `YY` is the 2-digit year with the century assumed (FoxPro treats low values as 19xx/20xx by its own rule, not stored) |
| 0x04–0x07 | 4 | record count | little-endian `uint32`, number of (undeleted + deleted) records |
| 0x08–0x09 | 2 | header length | little-endian `uint16`, byte offset where the first data record begins |
| 0x0A–0x0B | 2 | record length | little-endian `uint16`, bytes per record **including** the 1-byte delete flag |
| 0x0C–0x0D | 2 | reserved | observed `00 00` in every file checked |
| 0x0E | 1 | incomplete-transaction flag | observed `0x00` everywhere checked |
| 0x0F | 1 | encryption flag | observed `0x00` everywhere checked |
| 0x10–0x1B | 12 | reserved (multi-user/dBASE IV reserved block) | not decoded — out of scope, always zero-filled in samples |
| 0x1C | 1 | production MDX/CDX flag | observed `0x01` on every table that has a matching `.CDX` (confirmed against `GLMAS.LAN`, `INDEX.DBF`); **[inference]** this is FoxPro's "has a structural compound index" bit |
| 0x1D | 1 | language driver ID | observed `0x00` (no code-page translation table applied) on every sample |
| 0x1E–0x1F | 2 | reserved | observed `00 00` |

#### 1.2 Field descriptor array (from byte 0x20 / 32 onward)

Starting at offset 32, one 32-byte descriptor per field, terminated by a
single `0x0D` byte:

| Sub-offset | Size | Meaning |
|---|---|---|
| 0–10 | 11 | field name, ASCII, NUL-padded |
| 11 | 1 | field type: observed `C` (character), `N` (numeric), `D` (date), `L` (logical), `M` (memo) |
| 12–15 | 4 | field data address (unused in the on-disk file; some tools write the in-memory field offset here, little-endian `uint32`) |
| 16 | 1 | field length (bytes) |
| 17 | 1 | decimal-place count (numeric fields only) |
| 18 | 1 | field flags — observed `0x00` throughout the sample |
| 19–31 | 13 | reserved — observed zero-filled |

#### 1.3 Worked example: `PACE/GLMAS.LAN` (master copy, chart-of-accounts table)

Raw header bytes 0x00–0x1F (`od -An -tx1 -N 32`):

```
03 06 0a 1e 06 00 00 00 e1 01 99 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00
```

Byte-by-byte:

- `0x00 = 0x03` — plain dBase III-format table, no memo field (confirmed: no `M`-type field appears below, no `.FPT` sits next to `GLMAS.LAN`).
- `0x01–0x03 = 06 0A 1E` — last-update date `06`/`0A`(10)/`1E`(30) → the table was last saved **2006-10-30** by FoxPro (the file's own `mtime` on this host is 29-Oct-2006, one day earlier — the header date is FoxPro's internal "last write" stamp, baked in at save time; a later copy/backup can carry an `mtime` that doesn't exactly match it).
- `0x04–0x07 = 06 00 00 00` → record count = **6** (matches `SUMMARY.md §3.2`'s "GLMAS.LAN 6/72" master figure).
- `0x08–0x09 = E1 01` = `0x01E1` = **481** → header length; first data record starts at byte 481.
- `0x0A–0x0B = 99 00` = `0x0099` = **153** → every record is 153 bytes (152 data bytes + 1 delete-flag byte).
- `0x1C = 0x01` → structural `.CDX` flag set; and indeed `GLMAS.CDX` exists alongside it.
- `0x1D = 0x00` → no code-page/language driver id stamped.

Field descriptor array (offset 32 → 479, 14 fields × 32 bytes = 448 bytes,
32 + 448 = 480, terminator at 480):

| Offset | Name | Type | Len | Dec |
|---|---|---|---|---|
| 0x020 (32) | `GL_CD` | C | 6 | 0 |
| 0x040 (64) | `ADD` | C | 6 | 0 |
| 0x060 (96) | `GL_NM` | C | 35 | 0 |
| 0x080 (128) | `YR_OB` | N | 14 | 2 |
| 0x0A0 (160) | `CUR_BAL` | N | 14 | 2 |
| 0x0C0 (192) | `LAST_BAL` | N | 12 | 2 |
| 0x0E0 (224) | `HD_UP` | C | 10 | 0 |
| 0x100 (256) | `HD_DOWN` | C | 10 | 0 |
| 0x120 (288) | `TR` | L | 1 | 0 |
| 0x140 (320) | `D_DAYS` | N | 3 | 0 |
| 0x160 (352) | `OPT` | N | 7 | 0 |
| 0x180 (384) | `ACC_INT` | N | 6 | 0 |
| 0x1A0 (416) | `XOPTION` | N | 14 | 2 |
| 0x1C0 (448) | `PYR` | N | 14 | 2 |

Sum of field lengths = 152; +1 delete-flag byte = **153**, exactly matching
the record-length field at 0x0A — a direct, verifiable cross-check that the
header was parsed correctly.

Terminator at offset `0x1E0` (480) = `0x0D` **[observed]**, confirmed by
`od -An -tx1c -j 480 -N 48`.

First data record, at offset 481 (`od` dump):

```
0d 20 32 37 30 30 30 31 20 20 20 20 20 20 43 61
73 68 20 ...
```

- Byte 480 = `0x0D` is the last byte of the *header* region (the terminator
  itself), **not** part of the record — the record truly begins at byte 481.
- Byte 481 (first byte of the record) = `0x20` → the **delete flag**: ASCII
  space `0x20` means *active* record; ASCII `*` (`0x2A`) marks a *soft-deleted*
  record awaiting a `PACK`.
- Bytes 482–487 (`GL_CD`, 6 chars) = `270001`.
- Bytes 494–528 (`GL_NM`, 35 chars) = `Cash` + trailing spaces (fixed-width,
  space-padded — xBase C fields are never NUL-padded on disk, always
  space-padded).

The file's last byte, at offset `hdrlen + nrec*reclen = 481 + 6*153 = 1399`,
is `0x1A` — the classic dBase **end-of-file marker** (Ctrl-Z) **[observed]**,
one byte past the last record, and the file is exactly 1400 bytes long (`od`
confirms byte 1399 = `0x1A`, and `ls -la` reports 1400 bytes total).

The society copy `PACE/01»/GLMAS.LAN` parses with the **identical** field
descriptor table (same 14 fields, same offsets, same lengths) but
`record-count = 72`, `last-update = 06/0C/1C` (2006-12-28), file size 11498
bytes = `481 + 72*153 + 1(EOF)`. This is the same schema, just with 72 live
chart-of-accounts rows instead of 6 template rows — direct, byte-level proof
of the master→society copy mechanism (§5 below).

### 2. `.LAN` vs `.DBF` — confirmed identical dBase format

**[observed]** Every `.LAN` file parsed above (`GLMAS.LAN`, `GLTX.LAN`,
`INSTA.LAN`, `J4INV.LAN`, …) has byte 0 = `0x03`, the same header/field
layout, the same `0x0D` terminator and `0x1A` EOF marker as the files with a
plain `.DBF` extension (`INDEX.DBF`, `REGY.DBF`, `CR.DBF`, `FOXUSER.DBF`). The
parser required **zero** extension-specific branching — it works unmodified
on both. `SUMMARY.md §3.1`'s claim that "`.LAN` is just a rename" of the dBase
III/FoxPro format is confirmed directly: there is no header flag, magic
number, or structural difference correlated with the extension. The `.LAN`
convention appears to exist purely so the application can tell "its own"
tables (business data, almost entirely `.LAN`) apart from a handful of
tables that for historical/module reasons kept the generic `.DBF` extension
(`INDEX.DBF`, `CR.DBF`, `DR.DBF`, `REGY.DBF`, `SLEDGER.DBF`, `FOXUSER.DBF`,
`EXPENSE.DBF`, `GROUP1.DBF`, `PRO_LOS.DBF`, `3CD.DBF`, `BK.DBF`, and the
working tables `TEMP*.DBF`, `TMP*.DBF`, `TRIAL.DBF`, etc.) — **[inference]**:
no evidence was found of a functional reason for the split; it looks like an
inherited naming convention from the vendor's original module layout (`.LAN`
= "ledger/accounts" tables vs. generic FoxPro `.DBF` for registers/audit/temp
tables), not a format distinction.

### 3. Indexes: `.CDX` compound indexes and `INDEX.DBF`

#### 3.1 `INDEX.DBF` — the application's own index catalog

**[observed]** `PACE/INDEX.DBF` (and its society copy) is itself a 3-field
dBase table — parsed header: version `0x03`, record count 23, header length
129, record length 57:

| Field | Type | Len | Purpose |
|---|---|---|---|
| `DBF_NM` | C | 8 | lower-case table name the index belongs to |
| `NDX_NM` | C | 8 | tag/index name |
| `KEY` | C | 40 | FoxPro key expression for that tag |

Full dump of the 23 records (identical in master and `01»` — the catalog
itself is copied verbatim, since it describes schema, not data):

| # | DBF_NM | NDX_NM | KEY |
|---|---|---|---|
| 1 | bank | gl_cd | `gl_cd` |
| 2 | glmas | gl_cd | `gl_cd` |
| 3 | glmas | glalp | `upper(gl_nm)` |
| 4 | gltx | doc_no | `doc_no` |
| 5 | j4inv | doc_no | `doc_no` |
| 6 | lab | gl_cd | `gl_cd` |
| 7 | lab | lab | `uppe(name)` |
| 8 | narrat | nar | `uppe(nar)` |
| 9 | product | product | `uppe(prod)` |
| 10 | taxmas | tax_cd | `tax_cd` |
| 11 | taxmas | taxalp | `upper(tax_nm)` |
| 12 | taxtx | doc_no | `doc_no` |
| 13 | j4unit | j4unit | `unit` |
| 14 | paid | paid | `b_no` |
| 15 | mit | mit | `gl_cd` |
| 16 | biltx | biltx | `gl_cd` |
| 17 | biltx | bil1 | `righ(doc_no,5)` |
| 18 | bilreg | bilreg | `gl_cd` |
| 19 | gltx | trial | `gl_cd+dtos(doc_dt)` |
| 20 | bills | bills | `p_doc` |
| 21 | group | gr_cd | `gr_cd` |
| 22 | j4inv | part | `part` |
| 23 | naration | doc_no | `doc_no` |

(`uppe(...)` is not a typo in this write-up — it is a truncated/aliased form
of `UPPER()` as literally stored in the `KEY` field, observed byte-for-byte in
the raw record bytes.)

This table is clearly a **driver list for reindexing**: it tells the
"House Keeping" routine (§3.3) exactly which `.DBF`/`.LAN` needs which named
tag rebuilt with which expression, rather than hard-coding that list in
`PACE.EXE`. Two tables (`glmas`, `biltx`, `gltx`) have **multiple tags**,
confirming multiple tags live inside one compound `.CDX` per table (FoxPro
compound-index convention — one `.CDX` file can hold many named tags, each a
separate B-tree, keyed by a separate expression).

#### 3.2 `.CDX` compound index file structure

**[observed]** Every indexed `.DBF`/`.LAN` table has exactly one same-stem
`.CDX` file (e.g. `GLMAS.LAN` ↔ `GLMAS.CDX`, `INDEX.DBF` ↔ `INDEX.CDX`,
`GLTX.LAN` ↔ `GLTX.CDX`). A scan of every table in master `PACE/` found 31
tables with a matching `.CDX`/`.IDX` and 31 with none (listed below) —
**[observed]**: the ones with no index are exactly the single-record
configuration tables (`INSTA*.LAN`, `MONTH.LAN`, `EXTRA1–7.LAN`,
`SUBGROUP.LAN`, `LAYOUT.LAN`, `SOCFILE.LAN`, `PETTY1.LAN`, `SIGN.LAN`,
`C_PCO.LAN`, `BRS_4.LAN`, `PROD_GP.LAN`, `J4NOTE.LAN`) plus a few small
audit/debtor-creditor tables (`CR.DBF`, `DR.DBF`, `EXPENSE.DBF`,
`FOXUSER.DBF`, `GROUP1.DBF`, `PRO_LOS.DBF`, `REGY.DBF`, `SLEDGER.DBF`) — i.e.
tables that are either too small/singleton to need random-access lookup, or
are only ever scanned sequentially by report code.

Raw header of `PACE/GLMAS.CDX` (first 16 bytes, master copy — 2 tags per
`INDEX.DBF`: `gl_cd`, `glalp`):

```
00 04 00 00  00 00 00 00  00 00 00 00  0a 00 e0 01
```

Parsed:

| Offset | Size | Value | Meaning |
|---|---|---|---|
| 0x00–0x03 | 4 | `00000400` LE → **1024** | pointer (byte offset) to the index's root B-tree node |
| 0x04–0x07 | 4 | `0` | free-block list pointer (none — no reclaimed nodes) |
| 0x08–0x0B | 4 | `0` | unused/reserved |
| 0x0C–0x0D | 2 | `0x000A` = **10** | key length in this index structure |
| 0x0E | 1 | `0xE0` | index-options bit flags |
| 0x0F | 1 | `0x01` | format signature |

**[observed, corroborating]** The node at file offset 1024 (the root pointer
above) begins `03 00 02 00 FF FF FF FF FF FF FF FF ...`. Read as
attributes(2)=`0x0003`, key-count(2)=`0x0002`, left-sibling(4)=`0xFFFFFFFF`
(none), right-sibling(4)=`0xFFFFFFFF` (none): a node flagged as *both root and
leaf* holding **exactly 2 keys** — which matches precisely the 2 tags
(`gl_cd`, `glalp`) that `INDEX.DBF` says belong to `GLMAS`. **[inference]**:
this root node is FoxPro's internal **tag directory** (a tiny B-tree keyed by
tag name, whose leaf entries point to each tag's own separate key B-tree
elsewhere in the same `.CDX` file) rather than a data-key node — consistent
with the 10-byte key length in the header matching FoxPro's ≤10-character tag
name limit, not a 6-character `GL_CD` data key. The deeper internal node
format (how the tag-name leaf entry encodes the pointer to that tag's actual
key-tree root) was not decoded byte-by-byte; that level of detail wasn't
needed to confirm the catalog/key-expression facts above, which is
`INDEX.DBF`'s job, not the `.CDX`'s.

The society copy `01»/GLMAS.CDX` is bigger (16896 bytes vs 4608 in the
master) and has the identical 16-byte header pattern (`00 04 00 00 ... 0a 00
e0 01`) — same root offset, same key length, same flags — because the index
*structure* (2 tags on `GL_CD` and `UPPER(GL_NM)`) is identical; only the
number of B-tree leaf pages differs with the 72 vs 6 live rows.

#### 3.3 Reindex / "House Keeping" — why corrupt or missing indexes break the app

**[observed, from `PACE.EXE` strings]** The binary contains these exact
runtime error strings:

```
Index does not match database file. Recreate index.
Index file does not match database.
Index File is Missing, Try Reindexing
Structural CDX file not found
Reindexing index file -
Reindexing Tag
REINDEX
```

and the accessories menu, read directly out of the EXE's own menu-string
table:

```
2. System Info
3. Bank Reco.
4. House Keeping
5. Back/Res Data
6. Party Info.
```

— confirming `eMANUAL/accessories.rtf`'s text ("4. House Keeping ... sets
your database in order and optimizes it for better performance ... use this
option at least once a month") maps to menu item **4**, which the EXE itself
also expects: the string table carries `_MDA_PACK` and `_MDA_RINDX`
identifiers near it, i.e. **[inference]** House Keeping is FoxPro's own
`PACK` (physically remove soft-deleted rows, byte `0x2A`) immediately followed
by a rebuild of every tag in every table's `.CDX`, driven by the `DBF_NM` /
`NDX_NM` / `KEY` rows of `INDEX.DBF` (§3.1) — i.e. the catalog table is read
by the House Keeping routine to know *what to rebuild and with what
expression*, rather than that logic being hard-coded per table.

**Why it breaks without this:** a `.CDX`'s B-tree leaf entries store the
record's physical byte offset (a stale pointer the moment records are
inserted/packed out of order, or if the two files' modification dates
diverge — e.g. a crashed write updated the `.DBF` but not the `.CDX`, or a
backup/restore copied one file but not its pair). FoxPro detects this by
comparing internal counters/dates between the `.DBF` header and the `.CDX`
header and throws exactly the "`Index does not match database file`" /
"`Index file does not match database`" string observed above rather than
silently returning wrong rows. A **missing** `.CDX` (e.g. partial copy/backup
that only grabbed `*.DBF`) throws "`Index File is Missing, Try Reindexing`" or
"`Structural CDX file not found`" — again straight out of the binary's own
string table. House Keeping's `PACK`+reindex cycle is the only in-app fix;
deleting the `.CDX` and having the app regenerate it from `INDEX.DBF`'s key
expressions is the equivalent manual fix.

### 4. Memo fields: `.FPT` structure and which tables use them

**[observed]** A field type of `M` in the field descriptor means the actual
text is stored out-of-line in a companion `.FPT` file at the same stem; the
`.DBF`/`.LAN` record only holds a 10-byte block-pointer placeholder (e.g.
`J4INV.LAN`'s `DETAL` field: type `M`, length `10`; `REGY.DBF`'s `REMARKS`
field: type `M`, length `10`; `FOXUSER.DBF`'s `DATA` field: type `M`, length
`10`). Confirmed present in `PACE/`:

| Table | Memo field | Companion file | Observed size |
|---|---|---|---|
| `J4INV.LAN` | `DETAL` | `J4INV.FPT` | 512 bytes (master & society) |
| `REGY.DBF` | `REMARKS` | `REGY.FPT` | 512 bytes |
| `FOXUSER.DBF` | `DATA` | `FOXUSER.FPT` | 120128 bytes (master) / 99008 bytes (society) — the only heavily-populated memo store, because it's FoxPro's own runtime resource file (window positions, printer driver blobs, etc.), **not business data** (confirmed per `SUMMARY.md §3.1`) |

`.FPT` header (`od -An -tx1 -N 16`, identical on `REGY.FPT` and `J4INV.FPT`):

```
00 00 00 08  00 00 00 40  00 00 00 00  00 00 00 00
```

Parsed as big-endian (FoxPro memo headers are the one place this format uses
big-endian ints, unlike the little-endian `.DBF`/`.CDX` headers):

| Offset | Size | Value | Meaning |
|---|---|---|---|
| 0x00–0x03 | 4 | `0x00000008` = **8** | next-free-block pointer (block index, not byte offset) — i.e. only the one empty header block (block 0) has ever been allocated plus 7 reserved/padding blocks before the next write |
| 0x04–0x05 | 2 | `0x0000` | reserved |
| 0x06–0x07 | 2 | `0x0040` = **64** | block size in bytes |

**[observed]** Both `J4INV.FPT` and `REGY.FPT` are exactly 512 bytes (8
blocks × 64 bytes) in every copy inspected (master and society) — meaning no
memo text has actually been typed into `DETAL` or `REMARKS` in this dataset
yet; the memo store is present (so the field type is live and usable) but
empty of content. This matches the module context: `J4INV`/`REGY` are the
commercial invoicing/sales-register tables, and `SUMMARY.md §3.2` records 0
records for `J4INV.LAN`/`REGY.DBF` in both master and this society — no
invoice lines exist yet to carry memo text.

### 5. Master → society copy mechanics at the file level

**[observed]** Comparing the table *stems* (filename without extension) in
master `PACE/` against live `PACE/01»/`:

- **54 stems exist in the master** and **all 54 are present in the society
  folder** (`comm -23` between the two stem lists returns **empty** — nothing
  exists only in the master). This is a complete, byte-level confirmation of
  `SUMMARY.md §3.1`'s claim that society creation copies the master template
  set wholesale.
- The society folder additionally has **38 extra stems that do not exist in
  the master at all**: `ADD_PAY`, `ADD_REC`, `BANK0`, `BK2`, `BRS`,
  `CASHBANK`, `CHQRET`, `COST`, `DATA1`, `DOC`, `DOC_DT`, `FORM1`, `GL_CD`,
  `INSTA22`, `MAY`, `MIDDLE`, `NOTEPAD`, `PAY_OLD`, `PETTY`, `SLIP`, `TDS`,
  `TDS1`, `TEMP`, `TEMP1`, `TEMP2`, `TEMP3`, `TMP`, `TMP1`–`TMP4`, `TMP8`,
  `TMPA`, `TMPD`, `TMPX`, `TRAV`, `TRIAL`, `X`. These are exactly the
  "working/report-extract tables" `SUMMARY.md §3.2` describes as built on
  demand, plus stray `.IDX`/`.TXT` artefacts from running report/BRS/petty
  routines (e.g. `DOC.IDX`, `DOC_DT.IDX`, `GL_CD.IDX`, `MONTH.IDX`, `SIGN.IDX`,
  `TMP1.IDX`–`TMP4.IDX`, `TMP8.IDX`, `TRIAL.IDX`, `X.IDX` — old-style
  single-key `.IDX` sort orders, not structural `.CDX` tags, confirmed by
  header inspection below).

**Lifecycle [inference from filenames + timestamps + content]:**
- `TEMP`, `TEMP1`–`TEMP3`, `TMP`, `TMP8`, `TMPA`, `TMPD`, `TMPX` — scratch
  extract tables rebuilt and overwritten each time a report (bill register
  extract, monthwise summary, opening-balance build) is run; their field
  layouts mirror slices of `GLTX`/`BILREG`/`MIT` fields. `TMP.TXT` (158
  bytes, plain text, not a `.DBF`) is a human-readable byproduct of a report
  run — its content is two formatted ledger lines (`00047  16/12/2004 ...`),
  confirming it's a transient print-preview/export buffer, not a database.
- `TRIAL.DBF` + `TRIAL.IDX` — the trial-balance working table rebuilt (and its
  single-key index re-created) every time Reports → Trial Balance runs.
- `PAY_OLD.DBF` — "archived journal" per `SUMMARY.md §3.2`: an accumulation
  table rather than a scratch one — it is **not** overwritten each run, it
  grows (9424 bytes observed, holding prior-period postings moved out of
  active `GLTX`).
- `BK`/`BK2` — pick-list snapshots (`BK.DBF`/`BK2.DBF`, both 2618–2870 bytes)
  used to populate `<F1>`/`<F4>` selection lists in entry screens;
  `BK2` only exists in the society copy, confirming it's generated, not
  templated.
- `MAY.LAN` — a monthly `MIT` (Maintenance Item Table) snapshot, named for a
  specific calendar month, confirming the "snapshot per billing cycle"
  pattern described in `SUMMARY.md §3.2`.
- `DATA1.LAN`/`FORM1.LAN` — letter/reminder-letter templates (`DATA1.CDX`
  present, `FORM1` has none) used by Accessories → Reminder Letter.
- `NOTEPAD.LAN` — confirmed **not a table**: 29 raw bytes, no dBase header
  (`od -c` shows plain ASCII `what to do to print bills ?\r\n`), i.e. a
  developer's plain-text sticky note accidentally left inside the data
  folder and literally copied verbatim between master and society (its
  content is identical — the developer's one-off note, not application
  output).
- Old-style single-key `.IDX` files (`DOC.IDX`, `DOC_DT.IDX`, `GL_CD.IDX`,
  `MONTH.IDX`, `SIGN.IDX`, `TMP1–4.IDX`, `TMP8.IDX`, `TRIAL.IDX`, `X.IDX`) —
  header of `01»/DOC.IDX` (`od -An -tx1 -N 32`):
  ```
  00 04 00 00  00 00 00 00  00 00 00 00  08 00 20 01
  1c 00 00 00  1c 00 00 00  2b 00 00 00  01 00 00 00
  ```
  root pointer = 1024, key length = 8 (`0x08`), options byte `0x20` (vs the
  `.CDX`'s `0xE0` for `GLMAS`), signature `0x01` — a visibly different,
  simpler single-tag format from the compound `.CDX`. **[inference]**:
  these are temporary sort orders built by `INDEX ON <expr> TO <name>.IDX`
  inside specific report/reconciliation routines (e.g. sorting a temp table
  by document number or date for a register print), not part of each table's
  permanent structural index — which is why they only ever appear in the live
  society folder, never the master template.

### 6. Record locking and multi-user coordination

**[observed, from `PACE.EXE` strings]** The binary contains the full
vocabulary of dBase/FoxPro's shared-file locking model:

```
Database locked
Database not opened exclusively
Exclusive open of file is required.
Exclusive USE
File cannot be locked.
File Locked
File is in use.
File is in use by another.
File must be opened exclusively to convert Memo file.
Attempting to lock...  Press ESC to cancel.
Record %ld locked
Lock Records
A. Locking Option
NOLOCK / FLOCK / MULTILOCKS
```

**[inference from this vocabulary + standard FoxPro semantics]**: PACE uses
classic dBase-style **cooperative file/record locking** rather than a
client-server database engine — every workstation on a LAN opens the *same*
physical `.DBF`/`.CDX`/`.FPT` files directly (hence the string `NETWORK`,
`Network: %s`), and FoxPro's runtime takes out OS-level byte-range record
locks (`RLOCK()`/`FLOCK()` equivalents) before a write, releasing them after.
`Record %ld locked` and `Attempting to lock... Press ESC to cancel.` are the
user-facing symptoms of a lock collision; `Database not opened exclusively` /
`Exclusive open of file is required.` are what fires when an operation needs
nobody else to have the file open at all (structural changes, memo-file
conversion, index rebuild — matching `File must be opened exclusively to
convert Memo file.` and the House Keeping reindex of §3.3, both of which
necessarily require sole access).

**Why `*.tmp` cleanup and single-instance matter:** `SUMMARY.md §2.3`'s
generated `[autoexec]` runs `del *.tmp` before every launch specifically
because an unclean exit (crash, forced VM shutdown) can leave FoxPro work
files like `\capital\nest.tmp`, `member.tmp`, `0.TMP1` (all three confirmed
present as literal strings inside `PACE.EXE`) still on disk, and/or leave the
previous session's exclusive/record locks still effectively "held" from the
app's point of view on next launch, producing the same `File is in use` /
`Record %ld locked` errors against a file nobody is actually using anymore.
Running **two instances against the same `PACE/` folder** (two DOSBox
sessions, or one real and one accidental second launch) is the live version
of that same hazard — each instance opens the same `.DBF`/`.CDX` pair, and a
write from one collides with a read/write lock held by the other, which is
why `SUMMARY.md §7` calls this out as a named risk ("never run two instances
against the same `PACE/` folder at once").

### 7. The high-byte society folder name: `01»` on disk vs. in DOS

**[observed]** `ls "PACE/" | grep '^01' | od -An -tx1` on the real folder
returns:

```
30 31 c2 bb 0a
```

i.e. the macOS/APFS directory entry's name bytes are `30 31 C2 BB`
(trailing `0A` is just the newline `ls` added) — ASCII `0`, `1`, then the
two-byte **UTF-8** encoding of Unicode code point **U+00BB** (`»`,
RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK): `C2 BB` is the standard UTF-8
sequence for any code point in the `U+0080`–`U+07FF` range, here
`U+00BB = 0b00000010_10111011`, split per UTF-8's 2-byte rule into
`11000010 10111011` = `0xC2 0xBB`. This matches `SUMMARY.md §2.4`'s claim
exactly.

**What DOS/FoxPro sees:** DOSBox-X's `file access tries UTF-8 = true` option
does the reverse translation on every directory operation — presenting the
single DOS byte `0xBB` to the guest `\PACE\*.*` directory scan in place of the
host's two-byte `C2 BB` sequence, and reassembling the two-byte UTF-8 form on
writeback when FoxPro (which only knows single bytes, no multi-byte-aware
filesystem calls) creates or renames a folder. This 1-byte ↔ 2-byte
correspondence is itself directly **[observed]**-verifiable: any tool that
decodes the host's `C2 BB` as UTF-8 gets back exactly one code point, `»`.

**Discrepancy worth flagging [observed vs. SUMMARY.md's inference]:**
`SUMMARY.md §2.4` states "on the DOS/CP437 side that `»` is the single byte
`0xBB`" — i.e. it asserts byte `0xBB`, rendered through the IBM PC code page
437 that real DOS/FoxPro text screens use, *displays as* the guillemet `»`.
Checking this directly: Python's `cp437` codec decodes byte `0xBB` to `╗`
(box-drawing double-line top-right corner), **not** `»` — in true CP437,
`»` does not appear at `0xBB` at all (CP437's closest visual analogue sits
elsewhere in the table). Byte `0xBB` only decodes to `»` under Latin-1 /
Windows-1252 (`cp1252`), confirmed by the same test. **[inference]**: the
numerically-identical byte value `0xBB` happening to equal the low byte of
Unicode code point `U+00BB` is very likely *why* the folder got this name in
the first place — someone (or some tool) treated the Unicode code point
number and the DOS byte value as interchangeable — but the two are only
byte-identical, not glyph-identical under the DOS code page the app actually
uses. This doesn't change the mechanical correctness of DOSBox-X's
byte-for-byte 1↔2 translation (FoxPro's directory scan still gets back
exactly the single byte `0xBB` it's looking for, matching whatever the
installer originally wrote), but it does mean a screenshot of the running
DOS app showing that folder/society name would most likely render the
box-drawing glyph `╗`, not a printed `»`, if CP437 is really the active
screen code page — a cosmetic detail `SUMMARY.md` appears to get wrong,
separate from the (correct and verified) byte-translation mechanism itself.


---

## Deep Dive: The Accounting Engine

> **Method.** Every field name, record count and numeric example below was read
> directly off the live tables in `PACE/01»/` (society 01) with a small Python
> dBase-III header/record parser (fields read in field-descriptor order at
> offset 32 of the `.DBF`/`.LAN` header; records read from `header_len` at
> `record_len` strides; the leading byte of each record is the delete flag).
> Nothing was read from `SEC`/`RET`/`SECURE1`/`CODE_L` (those live in
> `INSTA.LAN`/`INSTA2.LAN`, outside the tables this section uses). Statements
> below marked **(observed)** are read straight off the tables, including a
> reproducible before/after arithmetic check; statements marked **(inferred)**
> are the author's interpretation of a field whose only evidence is its name,
> type and the pattern of values seen — flagged as such so a maintainer knows
> what still needs confirming against the FoxPro source or `eMANUAL`.

### 1. Chart of accounts: `GLMAS` + `GROUP`

#### 1.1 `GLMAS.LAN` — one row per ledger head

**(observed)** Field layout, society 01 copy, 72 records, 153-byte records
(the master template at `PACE/GLMAS.LAN` has the identical 14-field layout,
same 153-byte record length, just 6 template rows):

| Field | Type | Len.Dec | Meaning (observed / inferred) |
|---|---|---|---|
| `GL_CD` | C | 6 | Ledger code. First 2 digits = the owning `GROUP.GR_CD`; remaining 4 digits are a per-group sequence (e.g. `26 0001` = group 26, member #1). **(observed** — every `GL_CD` in the sample ties to a `GROUP.GR_CD` matching its first two characters.) |
| `ADD` | C | 6 | Salutation/title prefix for the ledger name — only populated on member ledgers (`Mrs.`, `Mr.`) **(observed)**. |
| `GL_NM` | C | 35 | Ledger (account) name, e.g. `Vaishali Shah`, `Syndicate Bank`, `Service Charges` **(observed)**. |
| `YR_OB` | N | 14.2 | **Opening balance** for the current accounting year — the figure entered once under "Opening Balance" or carried in by the year-end rollover. Signed: positive = debit opening balance, negative = credit opening balance **(observed, see §3)**. |
| `CUR_BAL` | N | 14.2 | **Current (closing) balance** — `YR_OB` plus the signed sum of every `GLTX` posting to this `GL_CD` to date. Recomputed/cached by the posting routines, not derived on the fly for every screen **(observed, exact arithmetic match, see §3)**. |
| `LAST_BAL` | N | 12.2 | Amount of the **most recent posting** to this ledger (e.g. the last maintenance bill raised on a member) — tracks the previous individual transaction value, used by entry screens to default/compare against the next one **(inferred from matching the most recent bill amount per member)**. |
| `HD_UP` / `HD_DOWN` | C | 10 / 10 | Character fields holding what look like numeric strings (e.g. `HD_UP='2000'`) mirroring `LAST_BAL`; `HD_DOWN` empty on every row sampled. Likely a cached "amount last billed / amount last receipted" pair used to print running "Dr./Cr." indicators on ledger reports **(inferred — name suggests "heading up/down" i.e. increase/decrease markers; exact semantics not confirmed against source)**. |
| `TR` | L | 1 | Logical. `T` on almost every live account (member, bank, expense, income), blank on special/system accounts (`Cash`, `Excess of Income Over Expenditure`, `Excess of Expenditure Over Income`, `Income & Expenditure A/c`). Reads as a "**T**ransactable / show-in-pick-lists" flag — i.e. whether this ledger is a normal posting account vs. a system-reserved balancing account **(inferred)**. |
| `D_DAYS` | N | 3 | Blank on every sampled row; by name, a per-ledger "**d**ue **days**" setting (credit period), relevant to the ageing/outstanding and interest-on-arrears logic described in `reports.rtf`/`NoInterest.rtf` **(inferred, unexercised in this data)**. |
| `OPT` | N | 7 | Blank on every sampled row — an option/flag code, purpose not evidenced here **(unconfirmed)**. |
| `ACC_INT` | N | 6 | **Accumulated interest** on this ledger (populated only on member ledgers, e.g. `3597`, `3522`, `3451` for the first three members) — the running interest-on-arrears total referenced by the Opening/Closing-Balance "Pick Opening Balance… will pick the accumulated interest" manual text (§4) **(observed field population pattern; semantics corroborated by `opening.rtf`)**. |
| `XOPTION` | N | 14.2 | On member ledgers, **(observed)** `XOPTION = YR_OB + (sum of debit/bill postings only, before netting receipts)` — e.g. Vaishali Shah: `YR_OB 21000.00 + Bill 2873.00 (doc INV00001) = XOPTION 23873.00` exactly; Arvind Shah: `19250.00 + 3731.00 (INV00002) = 22981.00` exactly. Reads as a **gross-dues/outstanding-before-credit** accumulator, used by ageing and outstanding-list reports so they needn't re-scan `GLTX` for "billed vs. paid" **(inferred mechanism, but the arithmetic match is exact and reproducible)**. |
| `PYR` | N | 14.2 | **P**revious **Y**ea**r**'s closing balance — on almost every row equals the current `YR_OB` (i.e. this year's opening = last year's closing), the value the year-end "Refresh/Pick Opening Balance" mechanic (§4) carries forward for comparative statements **(inferred from name + value pattern)**. |

A representative member row **(observed)**:

```
GL_CD=260001  ADD=Mrs.  GL_NM=Vaishali Shah
YR_OB=21000.00  CUR_BAL=32757.00  LAST_BAL=2000.00
TR=T  ACC_INT=3597  XOPTION=23873.00  PYR=21000.00
```

A representative system/bank/expense row **(observed)**:

```
GL_CD=210002  GL_NM=Syndicate Bank   YR_OB=90641.00  CUR_BAL=-8532.00
GL_CD=430002  GL_NM=Salary A/c       YR_OB=0.00      CUR_BAL=48887.00
GL_CD=190001  GL_NM=Income & Expenditure A/c  YR_OB=-268160.50  CUR_BAL=-618477.50
```

`SLEDGER.DBF` (5 records, society 01) is a **narrower, parallel copy** of the
same ledger-master layout (`GL_CD, ADD, GL_NM, YR_OB, CUR_BAL, LAST_BAL,
HD_UP, HD_DOWN, TR, D_DAYS, OPT, ACC_INT, XOPTION` — no `PYR`), holding exactly
the handful of **fixed system accounts** every society needs regardless of
chart-of-accounts customisation: `Cash on Hand` (210001), `Excess of
Income over Expenditure` (490001), `Excess of Expenditure over Income`
(390001), `Income and Expenditure A/c` (190001), `Interest on Arrears`
(350001). **(inferred)** `SLEDGER` is a lookup/reference seed the installer or
"Create Account" routine uses to know which ledgers are mandatory system
accounts (so it can create them automatically / protect them from deletion),
distinct from `GLMAS`'s role as the live, full chart of accounts.

#### 1.2 `GROUP.LAN` — the account-group master

**(observed)** Field layout (20 records, society 01; master `GROUP1.DBF`
carries the generic-COMPANY-module default groups — see below):

| Field | Type | Len | Meaning |
|---|---|---|---|
| `GR_CD` | C | 2 | 2-digit group number. |
| `GR_NM` | C | 25 | Group display name (renameable per §4.2 of `SUMMARY.md` / `Accounts.rtf`). |
| `SCH` | L | 1 | **Schedule flag** — `T` = this group's ledgers are broken out on a numbered Balance-Sheet schedule instead of being listed inline; `F` = printed directly in the B/S body. |
| `IN` | C | 1 | **Inner/outer column flag** for the Balance Sheet/I&E layout — `I` = inner column, `O` = outer column (the vertical Balance Sheet format described in `reports.rtf` §4). |
| `JU` | C | 1 | Schedule number/letter for groups with `SCH=T` (`0` when no schedule applies). |
| `CAT` | C | 7 | The broad accounting category this group belongs to: `LIAB.`, `ASSETS`, `INCOME`, `EXPENSE`. |

The live society's 20 groups, **confirming `SUMMARY.md`'s stated numbering
scheme exactly** (11–19 Liabilities, 21–29 Assets, 31–39 Income, 41–49
Expenditure, `x9` reserved):

```
11 SHARE CAPITAL                 LIAB.
12 RESERVES & SURPLUS            LIAB.
13 REPAIR FUND                   LIAB.
14 SINKING FUND                  LIAB.
15 OTHER FUNDS                   LIAB.
16 CURRENT LIABILITIES           LIAB.
17 PROVISIONS                    LIAB.
19 INCOME & EXPENDITURE A/C      LIAB.   (IN=O — printed in the OUTER column, as the
                                           carry-forward surplus/deficit ledger)
21 CASH & BANK BALANCE           ASSETS
22 INVESTMENTS                   ASSETS
24 DEPOSITS                      ASSETS
25 LOANS & ADVANCES              ASSETS
26 MEMBER'S DUES                 ASSETS  (SCH=T, JU=2 — printed as Schedule "2")
27 FIXED ASSETS                  ASSETS
31 CONTRIBUTION FROM MEMBERS     INCOME
35 INCOME                        INCOME
39 EXCESS OF EXP OVER INCOME     INCOME  (the "x9" balancing group)
43 MAINTENANCE EXPENSES          EXPENSE
45 OFFICE EXPENSES               EXPENSE
49 EXCESS OF INCOME OVER EXP     EXPENSE (the "x9" balancing group)
```

Note group `19` is tagged `CAT=LIAB.` (the accumulated surplus sits on the
liabilities/equity side of the Balance Sheet, as is standard for a
not-for-profit) but has `IN=O`, i.e. it is deliberately pulled out of the
inner Liabilities column into the outer column — it is the headline
accumulated-surplus figure, not just another liability line.

`GROUP1.DBF` (24 records) is the **generic "COMPANY" module's default group
set** (`CAPITAL ACCOUNT`, `SALES ACCOUNT`, `SUNDRY DEBTORS`/`SUNDRY
CREDITORS`, `PURCHASES`, `OPENING STOCK`/`CLOSING STOCK`, `PROFIT`/`LOSS`) —
same `GR_CD` numbering convention, same field layout, proving the group-number
scheme (11–19/21–29/31–39/41–49) is a property of the **engine**, not of the
society billing feature: a plain trading company gets `SUNDRY DEBTORS`/`SUNDRY
CREDITORS`/`FIXED ASSETS` with `SCH=T` schedules (`JU=1,2,3`) where a society
gets `MEMBER'S DUES` with `SCH=T, JU=2`. **(observed)** `SUBGROUP.LAN` exists
in both master and society copies with 0 records in this install (fields
`GR_CD C(2)`, `SUB1 N(2)`, `SUB2 C(20)` — a second-level breakdown under a
group, unused in this society's chart of accounts).

### 2. Voucher → ledger posting: `GLTX.LAN`

#### 2.1 Field layout

**(observed)** Society 01's `GLTX.LAN`: 439 records, 162-byte records, 15
fields. The master template's `GLTX.LAN` has the **same 15 fields** but a
158-byte record — the single difference is `C_CENTRE`, which is `C(2)` in the
master and `C(6)` in the society copy (the schema-drift the project's
`SUMMARY.md` flags, confirmed here byte-for-byte):

| Field | Type | Len.Dec | Meaning |
|---|---|---|---|
| `DOC_NO` | C | 8 | Document number: a 3-letter voucher-type prefix + a 5-digit sequence, e.g. `BRE00001` (Bank REceipt), `BPE00001` (Bank Payment Entry), `CRE00001` (Cash REceipt), `CPE00001` (Cash Payment Entry), `JVO00001` (Journal VOucher), `INV00001` (bill/INVoice posting), plus the two batch placeholders `INV_XXXX` and `EXP11111`/`EXP00000` described in §2.3. |
| `DOC_DT` | D | 8 | Transaction/voucher date. |
| `GL_CD` | C | 6 | The ledger this row posts to — joins straight to `GLMAS.GL_CD`. |
| `CN` | C | 6 | **Cheque number** on bank-voucher rows (e.g. `CN='066802'` on a Bank Payment); on Journal Vouchers it instead holds a **sequential JV serial number** (`000001`, `000002`, `000003` — one per `JVO` document, *not* a ledger code) **(observed)**. |
| `AMT` | N | 12.2 | **The signed posting amount — this is the debit/credit flag.** Positive = debit to `GL_CD`; negative = credit to `GL_CD` (see §2.2). |
| `B_AMT` | N | 12.2 | Blank on every one of the 439 live rows — by name, a secondary **b**ank-column amount (bank-reconciliation worksheets built on demand, e.g. `BRS.DBF`, apparently populate/consume this separately rather than via `GLTX`) **(unconfirmed — no populated example in this dataset)**. |
| `D_AMT` | N | 12.2 | Also blank on every live row — a secondary "**d**iscount"/"**d**ue" amount column, purpose not evidenced here **(unconfirmed)**. |
| `NARR` | C | 34 | First line of narration (cheque no./date, bill reference, "Receipt No. 0001", payee description…). |
| `NARR1` | C | 34 | Second line of narration (bank name, "on account", additional payee detail…). |
| `B` | C | 1 | **Bank-reconciliation "cleared" tick.** Blank = not yet reconciled; populated rows store the single byte `0xFB` (CP437 "√", the FoxPro check-box glyph) — i.e. this is a checkbox field, not a Y/N text flag **(observed raw byte)**. Matches the manual's BRS workflow ("tick cleared entries against the statement with spacebar"). |
| `CDATE` | D | 8 | Populated only alongside `B` — the **clearing date** on which the cheque is confirmed cleared by the bank (every observed example is `20040630`, a quarter-end BRS run date) **(observed co-occurrence with `B`)**. |
| `ALPHA` | C | 6 | On Journal Voucher rows, holds the **`GL_CD` of the contra (other) leg** of the entry — e.g. a JV crediting `350001` carries `ALPHA='260024'` (the debit leg's code) and vice-versa on its pair. This is the actual **contra-ledger cross-reference field** (not `CN`, despite `CN`'s superficial resemblance to "contra") **(observed, exact)**. Blank on every bank/cash-voucher row sampled — those vouchers rely on scanning for the other row sharing the same `DOC_NO` instead. |
| `V_NO` | C | 5 | Blank on every live row in this sample; by name a voucher-type/number field distinct from `DOC_NO`, not exercised by this society's data **(unconfirmed)**. |
| `CR_DAYS` | N | 3 | Populated (`'0'`) only on the `EXP00000` petty-cash-voucher batch (§2.3) — **c**redit-period/ageing **days**, apparently defaulted to 0 on cash-settled petty expenses **(inferred)**. |
| `C_CENTRE` | C | 6 (society) / 2 (master) | **Cost-centre code** the posting is tagged with — blank on every row in this install (the society has 0 rows in `COST.LAN`, i.e. cost centres were never set up here); see §5. |

#### 2.2 The debit/credit sign convention — verified on real postings

**(observed, exact)** `AMT`'s sign is the only debit/credit indicator; there
is no separate "Dr/Cr" field. Positive `AMT` = a debit to `GL_CD`; negative
`AMT` = a credit to `GL_CD`. Every two-legged voucher type in the data sums
to **exactly zero** across its `DOC_NO`:

**Bank Receipt** `BRE00001` (26 April 2004, a member's cheque banked):

```
DOC_NO=BRE00001  GL_CD=210002 (Syndicate Bank)   AMT= 11879.00   <- debit: bank asset ↑
DOC_NO=BRE00001  GL_CD=260028 (member)            AMT=-11879.00   <- credit: member's dues ↓
NARR = "103917 dt 26/4/04 bill : 167"   NARR1 = "Indian Overseas Bank, Andheri (W)"
        (the cheque no./drawee bank goes in the narration, not a structured field)
```

**Bank Payment** `BPE00001` (1 April 2004, paying a liftman by cheque):

```
DOC_NO=BPE00001  GL_CD=210002 (Syndicate Bank)   CN=066802  AMT=-2000.00  <- credit: bank ↓
DOC_NO=BPE00001  GL_CD=430002 (Salary A/c)                   AMT= 2000.00  <- debit: expense ↑
```

**Cash Receipt** `CRE00001` / **Cash Payment** `CPE00001` follow the same
pattern against `GL_CD=210001` (Cash) in place of the bank ledger.

**Journal Voucher** `JVO00002` (16 Oct 2004, waiving a member's interest):

```
DOC_NO=JVO00002  CN=000002  GL_CD=260024 (member)   AMT= 100.00  ALPHA=350001  <- debit member
DOC_NO=JVO00002  CN=000002  GL_CD=350001 (Interest…) AMT=-100.00  ALPHA=260024  <- credit interest income
```

`CN` here is the **JV's own running serial number** (`000001`, `000002`,
`000003` across the three JVs in this book), shared by both legs of that JV;
`ALPHA` on each leg cross-references the *other* leg's `GL_CD` — i.e. the
"contra ledger" the task brief anticipated is `ALPHA`, not `CN`, on this
voucher type.

**Contra entries** (cash deposited to/withdrawn from bank, bank-to-bank
transfer) are, per `Vouchers.rtf`, **entered once**, as an ordinary Bank
Receipt/Bank Payment that simply selects `Cash` (or the other bank) as the
contra `GL_CD` instead of a member/expense ledger — there is no distinct
"contra" voucher type or flag; it is the same two-row `GLTX` mechanism as any
other Bank Receipt/Payment, just with both legs being Cash/Bank ledgers.

#### 2.3 The batch posting technique (bills and petty cash) — single-entry contra at the batch, not the row, level

Two high-volume posting paths in this engine do **not** write a balanced pair
per transaction; instead they write **one row per debit** and **a small
number of aggregate rows** that balance the whole batch. This is the
"single-entry contra technique" the task brief refers to, and it is directly
demonstrable in the data:

**Bill posting (`Bills/Vouchers → Update`).** Each member's bill posts a
single debit row under its own `DOC_NO` (`INV00001`, `INV00002`, …):

```
INV00001  GL_CD=260001 (Vaishali Shah)  AMT=2873.00   NARR="Bill No. 00001"
INV00002  GL_CD=260002 (Arvind Shah)    AMT=3731.00   NARR="Bill No. 00002"
```

— **144 such single-row documents** in this book (one per member per billing
month). The **credit side is never split per member**; instead, once per
billing run, the engine writes a handful of rows all sharing the placeholder
document number **`INV_XXXX`**, one row per income/liability head that the
bill matrix charges, each carrying the **month's total** for that head:

```
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=310002 (Bmc Property Tax)      AMT= -79125.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=310001 (Service Charges)       AMT=-118688.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=140001 (Sinking Fund)          AMT=  -7825.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=150001 (Repair Fund)           AMT= -25040.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=310008 (Parking Charges)       AMT=  -2950.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=310004 (Non Occupancy Charges) AMT=  -2290.00
DOC_NO=INV_XXXX  DOC_DT=20040401  GL_CD=350001 (Interest On Prev. Dues)AMT=  -3133.00
```

**(observed, exact)** Summing every member's `INV*` debit row dated
2004‑04‑01 gives **₹239,051.00**; summing the seven `INV_XXXX` credit rows for
the same date gives **-₹239,051.00** — the batch balances to zero even though
no individual member row has a matching individual credit row. The same
exact match holds for the 2004‑05‑01, 2004‑06‑01 and 2004‑07‑01 billing
runs (₹242,867 / ₹243,601 / ₹247,727 respectively, each matched to the rupee).
So the ledger-posting unit of double-entry here is **the billing run**, not
the individual bill.

**Petty cash vouchering** shows the identical pattern on a smaller scale.
Voucher `EXP00000` (30 April 2004) posts six expense-ledger debit rows under
one shared doc number:

```
EXP00000  GL_CD=430004 (Pest Control Services)  AMT=650.00
EXP00000  GL_CD=430006 (Plumbing Exp)            AMT=660.00
EXP00000  GL_CD=430011 (Repairs (minor))         AMT=540.00
EXP00000  GL_CD=450001 (Conveyance)              AMT=150.00
EXP00000  GL_CD=450002 (Printing & Stationery)   AMT=240.00
EXP00000  GL_CD=450003 (Couriers & Transport)    AMT= 35.00      -- sum = 2275.00
```

and the matching aggregate credit is a **single row** under the placeholder
`EXP11111`:

```
EXP11111  GL_CD=210001 (Cash)  AMT=-2275.00    NARR="Petty Cash"
```

**(observed, exact)** `650+660+540+150+240+35 = 2275.00`, matching `EXP11111`
to the rupee. Note the credit lands on **Cash** (`210001`), not on the
dedicated Petty Cash imprest ledger (`210003`) — in this book the only
`GLTX` posting ever made to `210003` is the imprest's own funding, a normal
two-row Bank Payment (`BPE00024`: debit `210003` +1900.00 / credit
`210002` Syndicate Bank −1900.00). This indicates the Petty Cash ledger
(`210003`) tracks the **imprest float**, while individual petty expenses are
reconciled against **Cash** directly through this batch mechanism — the
detailed per-voucher petty cash trail lives in `PETTY.DBF`/`PETTY1.LAN`
(11 records in the society), not in `GLTX`.

### 3. How balances are computed

#### 3.1 Running balance: `CUR_BAL = YR_OB + Σ GLTX.AMT`

**(observed, exact, reproducible)** For every `GL_CD` checked, `GLMAS.CUR_BAL`
equals `GLMAS.YR_OB` plus the signed sum of every `GLTX` row posted to that
code:

| `GL_CD` | Ledger | `YR_OB` | `Σ GLTX.AMT` | `YR_OB + Σ` | `CUR_BAL` |
|---|---|---|---|---|---|
| 260001 | Vaishali Shah | 21,000.00 | 11,757.00 | 32,757.00 | 32,757.00 ✓ |
| 210002 | Syndicate Bank | 90,641.00 | -99,173.00 | -8,532.00 | -8,532.00 ✓ |
| 430002 | Salary A/c | 0.00 | 48,887.00 | 48,887.00 | 48,887.00 ✓ |
| 190001 | Income & Expenditure A/c | -268,160.50 | -350,317.00 | -618,477.50 | -618,477.50 ✓ |
| 310001 | Service Charges | 0.00 | -459,159.00 | -459,159.00 | -459,159.00 ✓ |

This is the engine's one invariant: `CUR_BAL` is a **cached** running total,
re-derivable at any time by re-summing `GLTX`, not an independently-maintained
figure that could drift. "**Closing Balance as on any date**" (main-menu
option 6, confirmed in `opening.rtf`) is the same formula restricted by date:

```
closing_balance(GL_CD, as_of_date) = YR_OB + Σ AMT  WHERE GL_CD = GL_CD
                                                        AND DOC_DT <= as_of_date
```

— i.e. the Opening/Closing Balance report and the Ledger report's "ledger as
on any date"/date-range filters are both just this sum with `DOC_DT`
range-bounded, which is also exactly how `reports.rtf` describes the Ledger
report's "start date/last date" options and the "Exclude Opening Balance"
switch (drop the `YR_OB` term).

#### 3.2 Trial Balance (`TRIAL.DBF`)

**(observed)** `TRIAL.DBF`: 2 fields, `GL_CD C(6)` and `AMT N(16.2)` — 61
records in the society (close to, but not identical to, `GLMAS`'s 72 — some
zero-balance or newly added ledgers are evidently dropped when the Trial
Balance is (re)built, consistent with it being a **report-extract scratch
table**, rebuilt fresh each time Reports → Trial Balance is run, not a
permanently-maintained table). Each row is one ledger's closing balance,
signed the same way as `GLMAS.CUR_BAL`/`GLTX.AMT` (e.g. `140001 → -31,300.00`
for Sinking Fund). **(observed, exact)** summing all 61 `AMT` values gives
**0.00** — the Trial Balance's defining double-entry check, confirming the
whole ledger — including every batch-posted bill and petty-cash run from §2.3
— nets to zero in aggregate even though individual postings don't pair off
one-to-one.

#### 3.3 Income & Expenditure / Profit & Loss (`PRO_LOS.DBF`)

**(observed)** `PRO_LOS.DBF`: 3 fields (`GL_CD C(6)`, `GL_NM C(37)`,
`CUR_BAL N(14.2)`), 3 records, all `CUR_BAL=0.00` in this snapshot (it has
been reset/not regenerated since the last full P&L run). Its three rows are
report-scratch placeholder accounts, keyed by the fixed pseudo-codes
`x99999` under the "excess of income/expenditure" groups:

```
199999  Income & Expenditure Account          (group 19's rollup total)
499999  Excess of Income over Expenditure     (group 49's balancing figure)
399999  Excess of Expenditure over Income      (group 39's balancing figure)
```

**(inferred)** This mirrors `GROUP`'s reserved "`x9`" groups exactly (19 =
I&E account itself; 39/49 = Excess of Expenditure/Excess of Income) and the
live `GLMAS` accounts `190001`, `390001`, `490001` seen in §1.1 are the
*permanent* ledger postings of the same concept; `PRO_LOS.DBF` is the
*transient* scratch copy the Income & Expenditure / Balance Sheet report
builds (per `reports.rtf` §3–4) to sum all `GROUP.CAT='INCOME'` ledgers
against all `GROUP.CAT='EXPENSE'` ledgers and park the net surplus/deficit
figure before formatting the printed statement — i.e. it is working storage
for exactly the computation `reports.rtf` describes ("The user has to update
the I&E whenever new transactions are fed in").

#### 3.4 Balance Sheet: inner/outer columns and schedules, from `GROUP`

**(observed)** As shown in §1.2, `GROUP.IN` (`I`/`O`) and `GROUP.SCH`
(`T`/`F`, with `GROUP.JU` giving the schedule number) directly implement the
Balance Sheet layout features `reports.rtf` describes: a group with `SCH=F`
prints its member ledgers' names and balances directly in the Balance
Sheet/I&E body; a group with `SCH=T` (e.g. `MEMBER'S DUES`, `JU=2`) instead
prints a single summary line in the body and defers the ledger-by-ledger
detail to numbered Schedule "2", printed after the main statement if the user
answers "Y" to "Print Schedules?". `IN`/`O` controls which of the Balance
Sheet's two physical columns (the standard T-format splits Liabilities+Assets
into an inner and an outer column) a group's total is placed in — observed
here pulling the headline `INCOME & EXPENDITURE A/C` group out to the outer
column while every other group stays `I` (inner). The Balance Sheet, P&L and
Trial Balance are therefore all derived from the same three tables by
filtering/grouping on `GROUP.CAT`:

- **Trial Balance** = every `GLMAS`/`TRIAL` row, unfiltered by `CAT`.
- **Income & Expenditure (P&L)** = `GLMAS` rows whose `GL_CD`'s group has
  `CAT IN ('INCOME','EXPENSE')`, netted to a surplus/deficit parked via
  `PRO_LOS.DBF`.
- **Balance Sheet** = `GLMAS` rows whose group has `CAT IN ('LIAB.','ASSETS')`,
  plus the I&E's net surplus/deficit folded in as the closing `190001`/
  `390001`/`490001` balance, laid out into inner/outer columns and
  schedules per `GROUP.IN`/`SCH`/`JU`.

### 4. Opening balances and the year-end rollover

#### 4.1 Entry and storage

**(observed)** Opening balances are a single numeric figure per ledger, stored
in `GLMAS.YR_OB` (§1.1), entered once per ledger either at society setup
(`Master Maint. → Create Account`, entering the opening balance alongside the
new ledger — per `Accounts.rtf`: "create the Ledger Accounts... After all the
Ledgers are created, and the opening Balance are fed in.. Check if your
opening Balances tally as per you previous years Balance sheet figure") or via
the main menu's "Open/Clos Bal." → Opening Balance screen (per `opening.rtf`).
Member ledgers additionally carry **opening interest** in `GLMAS.ACC_INT`
(§1.1) — distinct from the opening principal in `YR_OB` — matching
`SUMMARY.md` §4.4's "Opening Balance and Opening Interest" fields entered
under Member Details.

#### 4.2 The year-end Refresh/Pick-Opening-Balance mechanic

Per `opening.rtf` and `SUMMARY.md` §5, a new accounting year is a **new
society module** (a fresh `PACE/<code>/` folder, created via "Create Society
→ Copy Previous Year's Master Files? = Y"), not a new period inside the same
module. The old year's module is finalized, and the new module's Opening
Balance screen offers:

- **Pick Opening Balance** — pulls each ledger's prior-year **closing**
  balance into the new module's `YR_OB`, *and* carries the accumulated
  interest figure (`opening.rtf`: "This option will pick the accumulated
  interest... only used in the subsequent year... not recommended for use in
  the first year"). **(inferred mechanism)** Given `GLMAS.CUR_BAL` of the old
  module equals the old module's final closing balance (§3.1) and `PYR` in the
  live data consistently mirrors the *current* `YR_OB`, the most consistent
  reading is: `new_module.GLMAS.YR_OB := old_module.GLMAS.CUR_BAL` and
  `new_module.GLMAS.PYR := old_module.GLMAS.YR_OB` (i.e. `PYR` becomes the
  prior year's opening, for year-over-year comparative printing), matched
  **ledger-by-ledger by name/group** — hence `SUMMARY.md`'s requirement that
  "ledger names/groups must match exactly" between the two modules: the
  refresh is a **name+group join**, not a `GL_CD` join (a new module's
  `GLMAS` is freshly re-created from the master template/copied chart, so raw
  `GL_CD` values cannot be assumed stable across the rollover, but the
  ledger's name and owning group can).
- **Import Data** — a separate, explicitly cautioned-against ("Contact
  Databyte Computers... advised not to try this feature unless you are sure")
  feature to merge a second accounting module (e.g. a parallel "Major Repairs
  A/c" module) into the main one — not part of the normal year-end flow.

### 5. Cost centres: `COST.LAN` and `GLTX.C_CENTRE`

**(observed)** `COST.LAN` (society copy): 4 fields, 27-byte records, **0
records** in this society (cost centres were never configured here, matching
`SUMMARY.md`'s note that the Cost Centre feature must be switched on via
Advance Settings before use — `reports.rtf` §8: "Cost Centre option has to be
set on, through the Advance settings (via Setup)"):

| Field | Type | Len | Meaning |
|---|---|---|---|
| `COST_NAME` | C | 12 | Cost-centre name/code, e.g. a building or block name in a multi-building society. |
| `PRI_SEC` | C | 1 | **P**rimary/**S**econdary flag — whether this is a top-level cost centre or a sub-cost-centre nested under another one **(inferred from name)**. |
| `UNDER` | C | 12 | The parent `COST_NAME` this cost centre nests under, when `PRI_SEC` marks it secondary **(inferred)**. |
| `TIC` | C | 1 | An active/selected tick flag, consistent with the tick-to-select UI pattern used elsewhere in this app (e.g. the `B` field in `GLTX`, the BRS tick workflow) **(inferred)**. |

Every `GLTX` row carries a `C_CENTRE` field (§2.1) that, when populated,
tags that individual posting with a `COST.COST_NAME` value — letting Voucher
Entry attribute any bank/cash/journal/expense line to a specific cost centre
at the point of entry. The **Cost Centre Report** (`reports.rtf` §8:
"displays or prints a report based on the cost centres created, viz, a
building-wise expense statement") is then simply `GLTX` grouped by
`C_CENTRE`, each group's postings summed and broken out by ledger/group the
same way the Trial Balance sums the whole book — i.e. it reuses the identical
`YR_OB + Σ GLTX.AMT` running-balance machinery from §3.1, scoped to
`WHERE C_CENTRE = <code>` instead of `WHERE GL_CD = <code>`. In a society
with no cost centres configured (as here), `C_CENTRE` is simply blank on
every row and the whole book behaves as a single, un-partitioned cost centre.


---

## Deep Dive: The Society Billing Engine

> **Sourcing legend.** Every claim below is tagged. **[FACT — parsed]** = read directly
> off the `.LAN` file's own dBase/FoxPro header or a live, unredacted data record in
> `/Volumes/KRYPTIX/test2/CAPITAL/new/PACE/01»/`. **[FACT — manual]** = quoted/paraphrased
> from the converted eMANUAL `.rtf` text. **[FACT — strings]** = a literal prompt/field
> string pulled from the `PACE.EXE` binary (via the `PACE_strings.txt` extraction already
> present in this scratchpad from static analysis). **[INFERENCE]** = a reasoned
> connection the sources don't state outright (e.g. mapping an opaque 1-byte flag to a
> manual's menu wording), always flagged as such. No `SEC`/`RET`/`SECURE`/password field
> was read anywhere in this write-up (none of the eight billing tables carry one; those
> live only in `INSTA.LAN`/`INSTA2.LAN`, outside scope).
>
> All live-data figures are for society **`01»`** (folder name carries a trailing `»`,
> byte `0xBB` under CP437 — see SUMMARY.md §2.4). Bill-structure/live figures below are
> for the **July 2004** billing cycle (`BL_DT`/`DOC_DT` = `2004-07-01`) unless stated.

---

### 1. The flat/unit master: `SOCFILE.LAN`

**[FACT — parsed]** `SOCFILE.LAN`'s own header (257-byte header, 43-byte record) declares
exactly these 7 fields:

| Field | Type | Len.Dec | Purpose (inferred from name + SUMMARY.md §3.2) |
|---|---|---|---|
| `GL_CD` | C | 6 | Ledger-account code — foreign key into `GLMAS.LAN` (the member's own ledger head) |
| `WING` | C | 1 | Building wing letter (`A`, `B`, …) |
| `GALA` | N | 4 | Flat/Gala number (numeric here, vs. character in `MIT.LAN` — see below) |
| `XDATE` | D | 8 | A date field **not mentioned in the task brief** — undocumented in the manual; likely a possession/occupancy or last-modified date **[INFERENCE]** |
| `AREA` | N | 5 | Carpet/built-up area of the unit, used as the areawise-calculation base (Ctrl+A, §2) |
| `BILLAMT` | N | 10.2 | A flat, non-itemized bill amount per unit |
| `REBATE` | N | 8 | A flat rebate figure per unit |

**[FACT — parsed]** Record count: **0 rows in the master template AND 0 rows in live
society `01»`** — confirmed directly (`header_len=257, record_len=43`, record loop
produced zero live rows). This matches SUMMARY.md §3.2's table (`SOCFILE.LAN — 0 / 0`).

**[INFERENCE]** Given `SOCFILE` is completely empty in this society while `MIT.LAN` (§2)
holds all 29 flats' live data with a richer 36-field schema (area split into
`GROUND`+`LOFT`, 16 charge columns, category, interest flags), **the actual per-flat
master for *this* society's itemized maintenance billing lives in `MIT.LAN`, not
`SOCFILE.LAN`.** `SOCFILE`'s simple `AREA`/`BILLAMT`/`REBATE` shape looks designed for a
*flat-rate, non-itemized* billing mode (one amount per flat, no per-head breakup) that
this particular society does not use — it is carried in the schema as an alternate/legacy
billing style but is dormant here. SUMMARY.md's own §3.1 schema-drift note ("a few tables
differ slightly between master and live copy … from uneven version upgrades") is
consistent with `SOCFILE` being an older or parallel mechanism superseded by `MIT.LAN` in
practice.

**Member → Ledger mapping [FACT — manual, step4.rtf].** Per the manual's *"4. Entering
Members' Details viz. Flat Nos, Wing, Area etc."*: each member/flat is entered via **Main
Menu → 1. Master Maint. → Member Details**, capturing Wing, Flat No. (Unit), Area, Title
(`Mr`/`Mrs`/`Dr.`, copyable to all rows with **Ctrl+T**; Wing copyable with **Ctrl+W**),
Category (`Cat` column — `S`=Shop, `G`=Garage, `L`=Gala, `O`=Office, `P`=Parking,
`U`=Unit, `N`=**no interest charged to this member regardless of arrears**, `X`=**omit
from bill generation entirely**, also reused to retire/replace a transferred member),
Opening Balance, and Opening Interest (if Simple Interest is in force). SUMMARY.md §4.4
corroborates the same category-code list. Underneath this screen, each member row's
`GL_CD` is literally the ledger-account code the member was created under in **Master
Maint. → Create Account** (Group "Member's Dues") — i.e. one ledger account per flat, and
`GL_CD` is the join key used by every billing table in this document (`MIT`, `BILREG`,
`BILTX`, `GLMAS`, `GLTX`).

---

### 2. The rate matrix: `MIT.LAN` ("Maintenance Item Table")

**[FACT — parsed]** Full field list (1153-byte header, 279-byte record):

```
GL_CD(C6) WING(C1) GALA(C10) TAGS(C2) GROUND(N5) LOFT(N4)
MM1..MM16 (N9.2 each — 16 charge-head rate columns)
DETAIL1(C25) DETAIL2(C25) DETAIL3(C25) ALPHA(C6) BLDG(C2) CAT(C1)
RV(N7.2) IFREE(N9.2) IRATE(N2) X(C1) Z(C1) A(C1) B(C1)
```

**Record count: 29 — i.e. society `01»` has 29 billable flats**, exactly matching
SUMMARY.md §3.2 (`MIT.LAN — 0 / 29`). `GALA` here is a **10-char string** (vs. numeric
`N4` in `SOCFILE`) — flat numbers like `001`, `101`, `201`, `301`, `403`, `904` were
observed, allowing alphanumeric gala labels. `GROUND`+`LOFT` together form the area basis
(`LOFT` always blank in this data set — none of these 29 units has a mezzanine/loft).
`RV` = Rateable Value (property-tax base; step5.rtf: *"If rateable value is to be printed
in the bills enable the option"*). `IFREE` and `IRATE` are blank/0.00 for all 29 live
records in this society — i.e. **no per-flat interest-rate override or per-flat
interest-free amount is in use here**; interest runs off the global rate in `INSTA5.IN`
(§4). `X`/`Z`/`A`/`B` are single-character fields with no observed non-blank values and no
manual/strings match — **purpose unknown [INFERENCE: likely reserved/legacy flags]**.
`CAT` and `BLDG` are blank for all 29 rows in this data set (the manual's `S/G/L/O/P/U/N/X`
category scheme exists in the schema but wasn't populated for any flat here).

A sample slice of real rates (`GL_CD`, Wing, Gala, Ground area, MM1–MM6; MM7–MM16 are 0
for every row in this society — only 6 of the 16 possible charge heads are actually
priced):

| GL_CD | Wing | Gala | Ground | MM1 | MM2 | MM3 | MM4 | MM5 | MM6 |
|---|---|---|---|---|---|---|---|---|---|
| 260001 | A | 001 | 300 | 750.00 | 1125.00 | 75.00 | 240.00 | 100.00 | 250.00 |
| 260002 | A | 002 | 450 | 1125.00 | 1688.00 | 75.00 | 240.00 | 0.00 | 300.00 |
| 260003 | A | 003 | 500 | 1250.00 | 1875.00 | 75.00 | 240.00 | 250.00 | 100.00 |
| 260029 | B | 904 | 4000 | 10000.00 | 15000.00 | 1000.00 | 3200.00 | 150.00 | 0.00 |

Note the clean ratio MM1 = 2.5×Ground, MM2 = 3.75×Ground, MM3 = 0.25×Ground,
MM4 = 0.8×Ground across every row — i.e. this society's first four charge heads are
**areawise rates** (per-sq.-ft. multipliers of `GROUND`), which is exactly the "Ctrl+A
areawise calculation" workflow described below, already baked into the live rate table.

**Column identity, confirmed empirically (§3):** cross-referencing `MIT`'s `MM1..MM6`
against `BILREG`'s posting rows (below) proves `MM1`→Property Tax, `MM2`→Service Charges,
`MM3`→Sinking Fund, `MM4`→Repair Fund, `MM5`→Parking Charges, `MM6`→Non-Occupancy
Charges, for this society's bill structure — **[FACT — parsed, derived, see §3]**.

**How rates are entered, and the copy/fill shortcuts [FACT — manual, step6.rtf
"6. Entering Bill Rates"]:**

1. **Master Maint. → Member Details → (2nd item) Allow Editing of Rates** opens the rate
   grid ("Rates Template — Use Function Keys to Copy / Ctrl+A for Areawise Calculation"
   **[FACT — strings]**, line ~8399 of the binary's string table).
2. **`<F1>`…`<F12>`** — pressing **Fn** while the cursor is in column *n* copies that
   row's value in column *n* down to every row below it to the end of the table (so
   `<F1>` repeats field/column 1's rate, `<F2>` column 2, … up to `<F12>`).
3. **Pattern-fill:** typing any character into the "Unit 2" column lets you group rows —
   rows sharing the same letter (e.g. all `A`) get the same rate when you next copy,
   letting you copy "in a certain pattern" rather than uniformly to every row.
4. **Ctrl+A — Areawise:** enter the column (field) number, and that column's rate is
   computed proportionally to each row's `AREA`/`GROUND` rather than copied flat — this
   is exactly the MM1..MM4 ratio pattern observed live, above.
5. **Ctrl+M — Multiply:** enter a column number and a multiplier (manual's example:
   doubling Parking charges in column 4 → multiply by 2).
6. **Ctrl+D — Divide:** enter a column number and a divisor (manual's example: halving
   Water charges in column 5 → divide by 2).
7. All of the above are gated by **"Enable Function Keys, for Rates"** — Bill Option #5
   **[FACT — strings, line ~8376: `"5. Enable Function Keys, for Rates"`]**, part of the
   same "Bill Options" screen that also has `"7. Replicate Members (upto 999 membrs)"`
   and `"8. Non Interest Chargeable Amount"` (§4).

**`MAY.LAN` as a per-month snapshot of `MIT` [FACT — parsed, with live corroboration]:**

```
GL_CD(C6) BLDG(C2) WING(C1) GALA(C10) TAGS(C2) CAT(C1) GROUND(N5) LOFT(N4)
MM1..MM16(N9.2) IFREE(N9.2)
```

29 records (one per flat, same key `GL_CD`), a near-identical field set to `MIT.LAN`
minus `DETAIL1-3`/`ALPHA`/`RV`/`IRATE`/`X`/`Z`/`A`/`B`, plus `CAT` is actually populated
here (`S` for flat 260001-260003 in this snapshot, where it was blank in the current
`MIT`). SUMMARY.md §3.2 lists `MAY.LAN` under "working/report-extract tables… built on
demand" as *"monthly MIT snapshot."* **Live proof that it's a point-in-time copy, not a
live mirror:** for `GL_CD 260001`, `MIT.MM2` (current master) = **1125.00**, but
`MAY.MM2` (the saved snapshot) = **525.00** — the master rate was revised upward
*after* that month's snapshot was taken, and the snapshot still shows the old, lower rate.
This is direct, live evidence for the manual's/SUMMARY's description: `MAY.LAN` freezes
the rate table used for a specific bill run so that later rate edits in `MIT.LAN` don't
retroactively change already-generated bills.

---

### 3. Bill generation: `MIT`+`SOCFILE` → `BILREG.LAN` and `BILTX.LAN`

**`BILREG.LAN` — the bill register [FACT — parsed]:** 897-byte header, 224-byte record,
**36 live records**. Fields:

```
DOC_DT(D8) DOC_NO(C8) GL_CD(C6)
FD1..FD16(N8.2)
INT(N8.2) AMT(N10.2) ARR(N10.2) GTOT(N10.2) REBATE(N10.2)
NARR(C17) ALPHA(C6) BUILDING(C2)
```

Of the 36 rows for the July-2004 cycle, **29 are per-flat bills** (`DOC_NO` = `INV00088`
… `INV00116`, `GL_CD` = each member's `260xxx` code), and **7 are per-ledger control/total
rows** (`DOC_NO` = the literal placeholder `INV_XXXX`, `GL_CD` = an *income-ledger* code,
`NARR` = `"Bill Reg."`, every `FDn`/`INT`/`ARR`/`GTOT` blank, only `AMT` populated and
**negative**). **[FACT — parsed, fully verified]** Summing each `FDn`/`INT` column across
the 29 member rows reproduces the 7 control rows' `AMT` *exactly* (sign-flipped):

| Column | Σ across 29 flats | Control row `GL_CD` | Control row `AMT` | Ledger name (`INSTA4.LAN`) |
|---|---|---|---|---|
| FD1 | 79,125.00 | 310002 | −79,125.00 | Property Tax |
| FD2 | 118,688.00 | 310001 | −118,688.00 | Service Charges |
| FD3 | 7,825.00 | 140001 | −7,825.00 | Sinking Fund |
| FD4 | 25,040.00 | 150001 | −25,040.00 | Repair Fund |
| FD5 | 2,950.00 | 310008 | −2,950.00 | Parking Charges |
| FD6 | 2,290.00 | 310004 | −2,290.00 | Non Occupancy Charges |
| INT | 11,809.00 | 350001 | −11,809.00 | *(Interest on Arrears ledger, `INSTA5.IN_CD`)* |
| FD7–FD16 | 0.00 | *(none posted)* | — | *(unused this cycle — the 7th configured item, "Other Charges" `310003`, has zero total and generates no control row)* |

This is the concrete mechanism behind SUMMARY.md §4.5's one-liner ("Update posts bills to
each member's ledger"): **Update** debits each member's `GL_CD` ledger with that bill's
`GTOT`, and credits each active income-head ledger (and the interest ledger) with the
*sum of that column across all bills in the run*, via `GLTX.LAN` postings — i.e. one JV
line per member **plus** one JV line per non-zero charge-head/interest ledger, all dated
`DOC_DT`/`BILLDATE`, self-balancing. Zero-total heads are skipped (no `310003` row
exists here).

Per-member row arithmetic (`GL_CD 260001`, July bill `INV00088`): `FD1..FD6` =
`750+1125+75+240+100+250 = 2540.00`; `INT = 466.00`; `AMT = 2540+466 = 3006.00`
(matches); `ARR = 29751.00` (brought forward); `GTOT = ARR+AMT = 29751+3006 = 32757.00`
(matches); `REBATE = 0.00`; `NARR = "Bill No. 00088"`.

**`BILTX.LAN` — the fuller bill-transaction history [FACT — parsed]:** 1057-byte header,
306-byte record, **116 live records** — exactly **29 flats × 4 archived monthly
cycles** (April, May, June, July 2004 all present for `GL_CD 260001`, confirmed by
`DOC_DT` = `2004-04-01`, `2004-05-01`, `2004-06-01`, `2004-07-01`). Fields are a superset
of `BILREG`:

```
DOC_DT DOC_NO GL_CD FD1..FD16 INT AMT ARR GTOT
ALL_INT(N10.2) TOT_INT(N10.2) INT_FREE(N9.2) REBATE(N10) PRINCIPAL(N9.2)
ALPHA(C6) M(C1) FOOTX(C60) BUILDING(C2)
```

`ALL_INT`, `TOT_INT`, `INT_FREE`, `PRINCIPAL` are the extra interest-tracking fields not
present in `BILREG` — used only in the **posted history**, not the pre-Update register.
`TOT_INT`, `REBATE`, `PRINCIPAL` are blank for every record of this flat in this data set
(no part-payment/rebate activity recorded against it); `INT_FREE` is `0.00` throughout
(matches `MIT.IFREE=0.00` for this flat — §4). `ALL_INT` is populated and is the key to
the interest mechanics worked out in §4.

**The exact Generate → Print → Update flow [FACT — manual, step7.rtf "7. Generating
Bills" + bprint.rtf "Bill Printing" + SUMMARY.md §4.1/§4.5]:**

1. **Generate** — Main Menu path **3-3-1** (`3. Bills/Vouchers → 3. Bills/Receipts →
   1. Generate`), reading `MIT.LAN` (current rates) × `SOCFILE.LAN`/member master for the
   selected **Bill Structure Date** (set in Setup → Society Bill Setup, step5.rtf), and
   writing the 29(+N) rows into `BILREG.LAN`.
2. **Print** — the 2nd menu option: select bills on-screen with the space bar;
   `<F1>` de-select all, `<F2>` select all, `<F3>` select all bills of the member under
   the cursor, `<F4>` select a whole month's bills, `<F5>`/`<F6>` select the next 25/50.
   Recommended sequence: space bar once → `<F1>` to clear any stale selection → re-select
   with space bar or `<F4>`. Page size 6–12 (inches), with a **micro-offset** control to
   nudge subsequent bills up/down when multi-bill print drifts (`+1`/`+2` if bills creep
   upward, `-1`/`-2` if downward) — this maps directly onto `INSTA5.PMICRO`/`RMICRO`
   (`N2` fields) and `PSIZE` (`N2`, live value `6`, i.e. half-page/6-inch bills in this
   society) — **[INFERENCE: exact field↔prompt mapping, by name/type match]**.
3. **Update** — *"Once the Bills are generated, always update the bills to post it to
   the Ledger. Update the bills whenever any bills are modified too."* Update is stated
   to be **idempotent/safe to repeat** (SUMMARY.md §4.5). It is the step that performs the
   `GLTX.LAN` postings quantified above, and (per `INSTA4.LAN`'s `UPDT` field, observed
   `= "U"` on all 7 live bill-item rows) flips a per-item flag recording that the item has
   been posted for that bill-structure date.
4. **Re-billing / modify** — per Modify1.rtf/Modify2.rtf: to correct one or a few bills,
   note the bill numbers from the Bill Register, fix the member's rate(s) in
   *Allow Editing of Rates*, then use **Re-billing**, entering each 5-digit
   zero-padded bill number, then **Update** the month it belongs to (and every
   subsequent month already generated must be re-billed/updated too, since each month's
   `ARR` chains from the previous month's `GTOT`). To redo a *whole month*, instead
   **Delete the bills** for that month after fixing rates, then regenerate.
5. **Adding a new bill item** (Newitem.rtf): create the ledger account first, then revisit
   *Society Bill Setup* without disturbing existing settings (press Enter to keep old
   values) and append the new item — optionally under a new Bill Structure Date if the
   change should not retroactively apply; if so, **store the old rates in the Library**
   first (the "Library Option" of SUMMARY.md §4.5).

---

### 4. Interest on arrears

**[FACT — strings]** The binary's own interest-settings dialog, verbatim (lines
~14613–14632 of the extracted string table):

```
 Interest Calculation Settings
 Keep Options < A B > as 0 days for Standard Interest Calculation
Calculate Simple Interest            [Option for Simple Interest {Yes/No}]
If Simple Interest, and part payment is made, the System will
deduct Accumulated Interest first, then Principal by default,
But I want the reverse Method ?       [This option is for Super Users]
Select either Method A or Method B or None for Standard Method
Method A
   e.g. Bill Date is 01.04.2004, Due date is 15.04.2004 (Monthly Billing)
   Charge Interest if not paid within ___ Days
   Charge for Delay on Daywise basis or for Whole Month [D/M]
   If you don't want to opt for Method-A, set it to None.
   Enter M-onthly or D-aywise, N-None
Method B
   Charge Interest on the Balance of earlier Month ?
   Interest will be calculated on the Balance of Bill Dated <date>
```

**[FACT — parsed]** `INSTA5.LAN`'s live record (1 record; header has **94 fields** across
2518 bytes) carries, among others, these interest/rebate/layout-relevant fields with
their **live values for society 01»**:

| Field | Type | Live value | Role **[the mapping to the dialog above is INFERENCE, by field order/type/sample-value match — the strings table does not itself name the DBF field]** |
|---|---|---|---|
| `SIMP_INT` | L | `T` | "Calculate Simple Interest" toggle — **ON** |
| `INTA_MD` | C1 | `N` | Method selector — `A`/`B`/`N`=None. Live = **N**, i.e. this society currently runs **neither** Method A nor Method B's extra rule, only plain Simple Interest |
| `GRACE` | N2 | `0` | Method-A grace days ("Charge interest if not paid within ___ days") — 0 here |
| `MQ` | C1 | `M` | Method-A sub-choice, Monthwise vs Daywise delay charging (`M`/`D`) — set to **M**onthly, though inert since `INTA_MD=N` |
| `EARLIERM` | D8 | *(blank)* | Method-B's reference bill date ("Balance of Bill Dated …") — unused while `INTA_MD≠B` |
| `IN` | N2 | `21` | Global annual interest rate, **21%** |
| `IN_CD` | C6 | `350001` | Ledger code credited with interest — "Interest on Arrears" |
| `PAYBY` / `DDATE` | N3 / D8 | `0` / `2004-11-05` | Due-date / pay-by mechanics tied to the rebate-by-due-date wording on the bill (§5, §6) |
| `ROUND_OF` | L | `T` | Round bill totals to the nearest rupee |
| `OPTWORD` | C40 | `"Interest on Arrears"` | User-replaceable wording for the interest line on the printed bill (manual: e.g. can be changed to "Penalty") |

**Non-interest-chargeable amounts [FACT — manual, faq.txt + FACT — parsed, strings]:**
Master Maint. → Member Details → Bill Options → **"8. Non Interest Chargeable Amount"**
opens a per-member dialog (*"a window will open displaying all names of members, enter
the amount on which interest is not to be charged, whenever the said amount is paid by
the member do make the amount Nil"* — faq.txt). This is stored per-flat in `MIT.IFREE`
and carried through to the posted history in `BILTX.INT_FREE`. In society `01»`'s live
data, `IFREE`/`INT_FREE` are `0.00` for all 29 flats — the facility exists in the schema
but is not currently exercised by this society.

**Per-member interest exemption via category:** step4.rtf/NoInterest.rtf: entering `N` in
the `CAT` column exempts that single member from interest regardless of arrears;
alternatively, setting the global rate (`IN`) to `0` in Society Bill Setup turns off
interest for every member at once.

**Part-payment allocation [FACT — strings, quoted above]:** by default, when a member
pays only part of what's owed, the system **debits/clears Accumulated Interest first,
then Principal** — i.e. a part-payment is applied against `ALL_INT` before it reduces the
arrears principal captured in `ARR`/`PRINCIPAL`. A Super-User-only switch can reverse this
(clear Principal first, Interest second). This is exactly why `BILTX` carries a separate
`PRINCIPAL` column distinct from `ARR`/`GTOT` — it is the ledger the part-payment
allocator needs to know how much of the arrears is pure principal once `ALL_INT` has
absorbed whatever has already been paid in.

**`MONTH.LAN` per-month percent [FACT — parsed]:** `MONT(D8) M(C1) WORDS(C10)
PERCENT(N2)`, 12 records (one per month of the accounting year, `2004-04-01` through
`2005-03-01`). **All 12 `PERCENT` values are blank in the live society-01» table** — i.e.
this society is **not** using a month-by-month interest-rate override; it runs uniformly
off `INSTA5.IN` (21%) every month. The field exists in the schema precisely to let
different months carry different rates (e.g. a rate change mid-year) but isn't exercised
here.

**Worked numeric example — real data, `GL_CD 260001`, April→July 2004 [FACT — parsed,
fully reconciled]:**

| `DOC_NO` | `DOC_DT` | `ARR` (opening) | `ALL_INT` (accumulated interest, opening) | FD1-6 total | `INT` charged | `AMT` | `GTOT` (closing) |
|---|---|---|---|---|---|---|---|
| INV00001 | 2004-04-01 | 21,000.00 | 2,000.00 | 2,540.00 | **333.00** | 2,873.00 | 23,873.00 |
| INV00030 | 2004-05-01 | 23,873.00 | 2,333.00 | 2,540.00 | **377.00** | 2,917.00 | 26,790.00 |
| INV00059 | 2004-06-01 | 26,790.00 | 2,710.00 | 2,540.00 | **421.00** | 2,961.00 | 29,751.00 |
| INV00088 | 2004-07-01 | 29,751.00 | 3,131.00 | 2,540.00 | **466.00** | 3,006.00 | 32,757.00 |

Reverse-engineering the formula from these real figures: each month's **opening
principal-only arrears** = `ARR − ALL_INT` (i.e. the brought-forward balance *minus* the
interest already accrued on it — consistent with `SIMP_INT=T`: interest is never charged
on interest, only on principal):

- April: `21,000 − 2,000 = 19,000`; `19,000 × 21%/12 = 332.50` → rounds to **333** ✓
- May: `23,873 − 2,333 = 21,540`; `21,540 × 1.75% = 376.95` → rounds to **377** ✓
- June: `26,790 − 2,710 = 24,080`; `24,080 × 1.75% = 421.40` → rounds to **421** ✓
- July: `29,751 − 3,131 = 26,620`; `26,620 × 1.75% = 466.85` → rounds to **467**, actual
  **466** (off by ₨1 — FoxPro's `ROUND()`/truncation behaviour, consistent with
  `ROUND_OF=T`; not a different rate)

And each month's `ALL_INT` **is simply the previous month's `ALL_INT` plus the previous
month's `INT`** (`2,000+333=2,333`; `2,333+377=2,710`; `2,710+421=3,131`) — i.e. `ALL_INT`
is a running ledger of *all interest ever charged and not yet separately cleared*, exactly
matching the field's name and `BILTX`'s role as the fuller transaction history. This is a
live demonstration of **Method B's wording** ("interest … on the Balance of earlier
Month") even though the current `INSTA5.INTA_MD` flag reads `N` — i.e. this four-month
run was generated under a Method-B-equivalent monthly simple-interest regime at the
global 21% p.a. rate, and `INTA_MD` may simply have been reset/cleared after the fact
**[INFERENCE — the live flag and the historical postings are not necessarily from the
same point in the society's configuration history]**.

---

### 5. Rebate logic: `INSTA5.LAN` rebate fields

**[FACT — parsed]** The rebate-relevant fields in `INSTA5.LAN`, with live values:

| Field | Type | Live value | Meaning |
|---|---|---|---|
| `REBATE` | L | `F` | Master on/off switch — rebates are **off** in this society currently |
| `RRATE` | N10.2 | `0.00` | Rate of rebate |
| `RDAYS` | N3 | `0` | Days-from-bill-date window to qualify ("Rebate, if paid by Due Date") |
| `RBASE` | C1 | *(blank)* | `A`=Area-based or `B`=Bill-Amount-based rebate calculation |
| `RUNIT` | C1 | *(blank)* | `F`=Fixed amount / `C`=%age / `P`=Paise (per-unit-area) |
| `RNOTE` | L | `F` | Print a rebate footnote on the bill |
| `RNOTETYPE` | C1 | *(blank)* | Footnote style, `A`/`B`/`C` |
| `RCODE` | C6 | *(blank)* | Ledger code for "Rebate Allowed" (credited when rebate is given) |
| `RSTYLE` | C1 | *(blank)* | Additional rebate-note style flag |
| `RVALUE` | L | `F` | *(Note: this is the "print Rateable Value in bill" toggle from step5.rtf, not a rebate rate — distinct from the `RV` rateable-value figure stored per-flat in `MIT.RV`)* |

Live society 01» has rebates fully configured-off (`REBATE=F`, `RRATE=0`, `RDAYS=0`); the
mechanism below is reconstructed from the manual and the binary's own prompts, not from
live computed rebate amounts (none exist in this data set — `BILTX.REBATE` is blank for
every record of the sampled flat).

**[FACT — strings]** The exact prompts for setting up a rebate table (lines
~14446-14460):

```
Rebate Rate
Enter Rate of Rebate
Rebate Code
Fixed Amount / %age / Paise  [F/C/P]     (Enter C, P, or F)
Based on Area / Bill Amount  [A / B]     (Bill Amount will include Fields 1 to 15 only)
Print a footnote in Bill ?
Note Style ?                              (Enter A, B or C)
Auto Generate Rebate Table
Modify or Display Rebate Amount
Pass Rebate JV Automatically
```

Note the explicit caveat **"Bill Amount will include Fields 1 to 15 only"** — i.e. when
`RBASE=B` (Bill-Amount basis), the rebate is computed off `FD1..FD15`, deliberately
**excluding `FD16`** from the rebate base (`FD16` is presumably reserved for a
non-rebatable charge head such as a statutory levy).

**[FACT — strings]** The binary's own 6-step rebate setup recipe, verbatim (lines
~14589-14598):

```
1. First through the SETUP Menu - Advance Settings, opt for Rebates Option
2. Next Create a Ledger for REBATE ALLOWED, enter the Code in <Rebate Code>
3. While entering the Receipts, you will be asked for Rebate amount, Enter
   the amount of Rebate to be credited to the member...(for Auto JV)
4. Go to REBATES OPTION through the BILLS/VOUCHERS Menu, and set the Rebate
   Rates, and the rebate calculation options
5. After all the receipts are entered, thru the REBATES OPTION, opt for
   Pass Rebates JV Automatically, Next Generate the Bills as usual.
6. If you want a Rebates Foot Note, opt for <Print a Foot Note in Bill>
   and say <Y>es for <Auto Generate Rebate Table ?>
```

This matches the `3. Bills/Vouchers` sub-menu seen in the strings table (`"6. Rebate
Options"`, `"7. Interest Opts."`) — i.e. **Rebate Options** and **Interest Opts.** are
sibling menu items under Bills/Vouchers, both acting on the current bill run before
Generate. The **Auto Rebate JV** mechanic uses working files visible in the string table
(`tmpjv`, `tmpjv2`, `autojv`, narration `"Rebate given to Member"`) to post a journal line
crediting the member and debiting/crediting the `RCODE` "Rebate Allowed" ledger via
`GLTX.LAN` — the same posting mechanism Update uses for bills (§3), just triggered from
the Rebate Options screen's "Pass Rebate JV Automatically" instead of bill-Update.

**Bill-printed wording for rebates [FACT — parsed, `INSTA5` static text present even
though `REBATE=F`]:** the bill-letter template itself ships fixed label text for the
rebate lines — `"Rebate, if paid by Due Date"` and `"Net Amount Payable, if paid by Due
Date"` — which only print when a rebate is actually configured and due.

---

### 6. Bill layout/printing

**`INSTA5.LAN` — the bill letter text, live content [FACT — parsed]:**

| Field | Len | Live content (society 01») |
|---|---|---|
| `TOP1` | 40 | `PINK MARBLE` |
| `TOP2` | 40 | `CO-OPERATIVE HOUSING SOCIETY LTD.` |
| `TOP3` | 68 | `Regn. No. BOM/HSG/TC/42520/2001-02 DT. 16-10-2002` |
| `TOP4` | 68 | `Bajaj Road, Vile Parle (West)` |
| `TOP5` | 68 | `Bombay 400 056.` |
| `TOP6`/`TOP7` | 68/40 | *(blank)* |
| `FOOT1` | 68 | `Please Note :` |
| `FOOT2` | 68 | `1. Please pay your previous dues and Bills in time.` |
| `FOOT3` | 68 | `2. Please pay by cheque only.` |
| `FOOT4` | 68 | `3. Write Flat No and Bill no. on reverse of cheque.` |
| `FOOT5`–`FOOT18` | 68 each | *(blank — unused)* |
| `SIGNA` | 78 | `Treasurer / Secretary` |

So `TOP1..TOP7` form the society's letterhead block (name split across two lines,
registration no., two address lines), and `FOOT1..FOOT18` are 18 free-text footnote
lines (only 4 populated here) — matching the task brief's "`TOP1-7`/`FOOT1-18`" shape
exactly. Beyond the bill body, `INSTA5` also carries a full **reminder-letter** template
(`LETHEAD`, `LET1..LET8`, each `C70`), live content:

```
LETHEAD: Reminder Letter for payment of Outstanding Society Dues
LET1:    Dear Sir,
LET3:    As a member of the Society you are aware that you have to contribute
LET4:    your share of the charges of the Society towards maintenance and other
LET5:    charges of the society.
LET6:    You are called upto to pay the dues of the society, failing which
LET7:    an application would be made, to the Assistant Registrar of the Co-
LET8:    operative Society under Cert. 101(1) of the Mah. Co-op. Act 1960
```

Other live `INSTA5` fields controlling layout/print: `UNIT="Flat"` (the unit-noun printed
on bills), `AREAUNIT="Sq. Feet"`, `PFIX="PM/"` / `SFIX="/2004-05"` (bill-number
prefix/suffix, i.e. bill numbers print as `PM/nnnnn/2004-05`), `PSIZE=6` (page size, 6 of
the 6–12 range bprint.rtf describes — a half-page/6-inch bill), `PMICRO`/`RMICRO=0`
(current micro-offset, the knob bprint.rtf tells the user to nudge `±1`/`±2` if
multi-bill printing drifts), `OUTS=T`/`XREF=T` (outstanding-list / cross-reference
options), `HBOLD=F` (bold-heading toggle).

**`INSTA4.LAN` — bill-item titles [FACT — parsed]:** `NO(C1) TIT1(C47) TIT2(C7) TIT3(C7)
CODE(C6) BL_DT(D8) UPDT(C1)`, **7 live records**, one per configured bill item, each
carrying a long name (`TIT1`) and a 2-line abbreviated register heading (`TIT2`+`TIT3`)
plus the `CODE` of the ledger it auto-posts to (and `BL_DT`, the Bill Structure Date it
belongs to, and `UPDT`, the "already posted" flag observed `= "U"` on all 7):

| TIT1 | TIT2 / TIT3 | CODE |
|---|---|---|
| Property Tax | Prop. / Tax | 310002 |
| Service Charges | Service / Charges | 310001 |
| Sinking Fund | Sinking / Fund | 140001 |
| Repair Fund | Repair / Fund | 150001 |
| Parking Charges | Parking / Charges | 310008 |
| Non Occupancy Charges | Non Occ / Charges | 310004 |
| Other Charges | Other / Charges | 310003 |

These are precisely the 7 items this document's §3 traced through to `BILREG`'s 7
control rows (the first six matched FD1-FD6 postings exactly; "Other Charges"/310003 is
configured but was zero-value and generated no posting row in the sampled July cycle) —
i.e. `INSTA4.LAN` is the literal output of the "Creating the Bill Design" step
(step5.rtf: *"enter all the items in the bill, Next enter the register column heading and
finally select the Ledger to be posted to automatically"*).

**`LAYOUT.LAN` — print-column definitions [FACT — parsed]:** `FNAME(C10) HEADLINE(C12)
PLACE(N2) WIDE(N2) TIPE(C1) DOIT(C1) DOT(L) TOTS(N10.2) EX(C1)`, 4 live records:

| FNAME | HEADLINE | PLACE | WIDE | TIPE |
|---|---|---|---|---|
| PARTICULAR | PART | 0 | 35 | C |
| QUANTITY | QTY | 36 | *(blank)* | N |
| RATE | RATE | 46 | *(blank)* | N |
| UNITS | UN | 57 | 6 | C |

Four columns (description, qty, rate, unit) with their print start-column (`PLACE`) and
width (`WIDE`) — **[INFERENCE: this generic Particulars/Qty/Rate/Units layout reads as a
line-item invoice/voucher print format, likely shared with the commercial J4 invoicing
module (SUMMARY.md §3.2's "Inventory/invoicing (J4 module)") rather than being specific
to the maintenance-bill letter itself**, which is driven by `INSTA5`'s fixed
`TOP/FOOT/FD1-16` layout, not by `LAYOUT.LAN`'s generic particulars/qty/rate grid.

**`NARATION.LAN` — canned narration text [FACT — parsed]:** `DOC_NO(C8) NARR5(C34)
NARR6(C34)`, 25 live records, keyed by document number — e.g. `BRE00024` → `")"`,
`BPE00065` → `"FINAL PAYMENT"`, `BPE00075` → `"Umesh Sheth"`. These `DOC_NO` prefixes
(`BRE`/`BPE`) indicate **Bank Receipt**/**Bank Payment** vouchers, not maintenance bills
— i.e. `NARATION.LAN` supplies extra narration lines for general ledger
vouchers/receipts, distinct from `BILREG.NARR` (the maintenance bill's own in-table
narration field, observed as `"Bill No. 00088"` style text) and distinct again from
`BILTX.FOOTX` (a 60-char free-text field attached to the archived bill transaction,
observed blank in the sampled flat's history).

---

**Summary of record counts actually observed in `PACE/01»/` (all directly parsed, not
estimated):** `SOCFILE.LAN` 0, `MIT.LAN` 29, `MAY.LAN` 29, `BILREG.LAN` 36 (29 member
bills + 7 ledger-total control rows), `BILTX.LAN` 116 (29 flats × 4 archived monthly
cycles), `BILLS.LAN` 0, `PAID.LAN` 0, `INSTA5.LAN` 1, `INSTA4.LAN` 7, `MONTH.LAN` 12,
`NARATION.LAN` 25, `LAYOUT.LAN` 4.


---

## Operator's Manual: Every Screen, Field & Shortcut

> Sources: `SUMMARY.md` §4; every `eMANUAL/*.rtf` file (welcome, getstart, features,
> faq, Vouchers, Accounts, Account1, Account2, reports, books, bprint, rprint,
> backup, accessories, opening, setup, SPLUS, step1–step7, Modify1, Modify2,
> Newitem, NoInterest, Editing, transfer); `CAPITAL/HELP.AID` (on-line help text,
> read with `strings`); and literal menu/prompt strings extracted with
> `LC_ALL=C strings CAPITAL/PACE.EXE`. Anything not found in any of the above is
> explicitly marked **(not documented in sources)**.

---

### 1. Startup / Login Flow — screen by screen

**Screen 0 — DOS launch.** Running `PACE.EXE` from `C:\PACE\` loads the title
block compiled into the binary:

```
CAPITAL  PLUS  FINANCIAL  ACCOUNTING  SYSTEMS
```
(also shown in a separate credits panel as `D A T A B Y T E   C O M P U T E R S`).

**Screen 1 — Company Picker.** Prompt text (verbatim, appears twice in the
binary — once for the list box, once as a footer hint):
```
  Select Company & Press Enter  
```
This shows the list of up to 99 societies/companies per drive (company no. +
company name, e.g. `01  Pink Marble Co-op Housing Soc Ltd`). Use the
**Up/Down arrows** to move the highlight bar, then press **Enter** to select
company 01.

**Screen 2 — Password.** After Enter on the company, the prompt
```
 Enter Password  
```
appears. On a fresh/unprotected society there is no password set — press
**Enter** on the blank field to proceed (confirmed interactively: "Enter again
(blank password)"). If a **User Password** has been set (see §3.8 Setup →
Passwords) it must be typed here (max 5 characters) or access is refused with:
```
You are not the Rightful User of this System !!!
```

**Screen 3 — Installation gate.** If the society has never been installed,
the system asks:
```
Do  You  Want  to  Install ? 
```
See §3.2 "Installing a new society (codeword james)" below. If installation
is skipped, the Main Menu still loads but flashes:
```
INSTALLATION NOT DONE
Install the Package First
```
and option 9 (Installation) must be run before bills/vouchers can be used.

**Screen 4 — Main Menu.** Header line (confirmed live):
```
C:\PACE\01»\ CAPITAL PLUS FINANCIAL ACCOUNTING SYSTEMS Version 6.14
```
Immediately below the header the package also shows the accounting-period
banner (literal string in the binary):
```
Accounting Period From :F  to 
```
i.e. the society name/accounting-period line sits above the numbered menu.
The Main Menu itself (exact on-screen text, left-hand numbered list):
```
 Main Menu 
0. Quit          
1. Master Maint. 
2. Voucher Entry 
3. Bills/Vouchers
4. Account Books 
5. Reports       
6. Open/Clos Bal.
7. Accessories   
8. Setup         
9. Installation  
```
Each item can be chosen by **typing its number** or by moving the highlight
bar with the arrow keys and pressing **Enter** (per HELP.AID General Tip "b").
Online help for any screen is available at any time by pressing **F11**
("You may Seek HELP to operate this Package at any stage by Simply Pressing
`<f11>` Key").

**Screen 5 — Quit / Switch / Create popup.** Pressing **0** (Quit) from the
Main Menu pops a vertical list (exact binary string, note the two variants —
"CREATE SOCIETY" is the co-op build, "CREATE COMPANY" is the generic/commercial
build):
```
CANCEL
Q U I T
SWITCH TO
CREATE SOCIETY      (generic build shows: CREATE COMPANY)
```
- **CANCEL** — returns to the Main Menu.
- **QUIT** — exits the package to DOS.
- **SWITCH TO** — opens the company list (same list as the login picker) to
  jump to a different society without restarting PACE.EXE.
- **CREATE SOCIETY** — launches the "Create/Delete Company" screen (§3.1).

---

### 2. Main-Menu Option → Full Submenu Tree

Legend: **[n]** = number/hot-key the operator presses from that menu.
Sub-menu item text is quoted verbatim from `PACE.EXE` strings / HELP.AID.

```
MAIN MENU
├─ [0] Quit  →  popup: CANCEL / QUIT / SWITCH TO / CREATE SOCIETY
│
├─ [1] Master Maint.           ("To Create/Edit the Ledgers Accounts, Groups,
│  │                             Member Details, Prefined Standard
│  │                             Narrations/Banks Names")
│  ├─ [1] Create Account        — new Ledger Account screen
│  ├─ [2] Edit Account           — Alter/Delete Ledger Accounts screen
│  ├─ [3] Member Details  (also shown as "Members Detail")
│  │        → "Bill Options" sub-prompt box (see §3.4):
│  │          1. Edit Name, Area, Unit, Open. Bal ?  [Y/N]
│  │          2. Allow Editing of Rates ?            [Y/N]
│  │          3. Sort according to Flat Nos. ?       [Y/N]
│  │          4. Edit Item Names in Bills & Reg. ?   [Y/N]
│  │          5. Enable Function Keys, for Rates     [Y/N]
│  │          6. Add / Edit Rateable Value           [Y/N]
│  │          7. Replicate Members (upto 999 membrs) [Y/N]
│  │          8. Non Interest Chargeable Amount      [Y/N]
│  ├─ [4] Group Entry            — "Group Master Entry" screen:
│  │          Enter Group No. / Enter Group Name / Schedule (Y/N) /
│  │          Inner/Outer Column (I/O) / Schedule No.
│  │          <F1> Account List   <F2> Groupings
│  ├─ [5] Acct.Head List          — printable account/head list
│  ├─ [6] Members' Info           — "Members \<List" / "Members \<Details"
│  ├─ [7] Group Listing           — list of Group Codes and Names
│  ├─ [8] Narrations              — pre-defined narration library
│  └─ [9] Cost Centres            — Code / Name of Cost Centre list
│         (A. Bank Names also appears in some builds — list of banks with
│          abbreviation, used for auto-fill in receipt narration)
│
├─ [2] Voucher Entry           ("To Enter Bank, Cash, Petty Cash Vouchers,
│  │                             Journal Entries")
│  ├─ [1] Petty cash
│  ├─ [2] Bank Receipt
│  ├─ [3] Bank Payment
│  ├─ [4] Cash Receipt
│  ├─ [5] Cash Payment
│  ├─ [6] Journal Voucher
│  └─ [7] Memo Voucher            — temporary/provisional journal entries
│
├─ [3] Bills/Vouchers          ("To Generate Bills, View/Print Bills, Delete
│  │                             Bills, Rebill, Print Receipts, Outstanding
│  │                             Lists etc")  — on-screen header "Bills/Rec/Voucher"
│  ├─ [1] Vouchers               — quick Cash/Bank entry shortcut
│  ├─ [2] Day Book/Erase         — delete all transactions in a date range
│  │                               (requires a deletion password — "Use Cautiously")
│  ├─ [3] Bills/Receipts         — the billing engine sub-menu:
│  │        0. Quit
│  │        1. Generate Bills
│  │        2. Print Bills
│  │        3. Delete  Bills
│  │        4. Re-billing
│  │        5. Bank Receipt
│  │        6. Cash Receipt
│  │        7. O/s List
│  │        8. Update
│  │        9. Multiple Recpt
│  │        10. Edit Interest
│  ├─ [4] Receipts List          — sub-menu:
│  │        0. Quit
│  │        1. Recpt Vouchers
│  │        2. Recpt Register
│  ├─ [5] Library Option         — sub-menu (exact labels):
│  │        List Library Names            — List of Libraries
│  │        Clear all Master Rates        — Clears Current Rates of Members
│  │        Load Rates from Library       — Loads Selected Library Rates of Members
│  │        Delete Library                — Deletes Selected Library
│  │        Store Master Rates in Library — Stores Current Rates
│  │        Load Rates from Register      — Create Library from Register
│  ├─ [6] Rebate Options         — "Rebate Options" screen (Ctrl+H = help):
│  │        Rebate Rate / Rebate Code / Fixed Amount-%age-Paise [F/C/P] /
│  │        Based on Area / Bill Amount [A/B] / Print a footnote in Bill ? /
│  │        Note Style [A/B/C] / Auto Generate Rebate Table /
│  │        Modify or Display Rebate Amount / Pass Rebate JV Automatically /
│  │        Month ?
│  ├─ [7] Interest Opts.         — interest-calculation parameter screen
│  └─ [8] Payment List           — sorted Datewise / Doc.No-wise / Accountwise,
│                                   with optional narration column
│
├─ [4] Account Books           ("To View/Print Account Books/Registers")
│  ├─ [1] Petty Cash Book         — Monthwise ; Datewise display
│  ├─ [2] Cash  Book
│  ├─ [3] Bank  Book               (select the bank, press Esc)
│  ├─ [4] Bill Register
│  ├─ [5] Journal Book
│  ├─ [6] Memo Voucher Bk
│  ├─ [7] Members' Regr.          (Members' Register)
│  ├─ [8] Summary Regist.         (Summary Register)
│  ├─ [9] Collection Regr         (Collection Register)
│  └─ [10] Complete Regr.         (Complete Register)
│
├─ [5] Reports                 ("To View/Print the Ledger, Trial Balance,
│  │                             Income & Exp. A/c, Balance Sheet, Cash Flow
│  │                             St., Analysis/Summaries etc") — on-screen
│  │                             header " Financial Rep. "
│  ├─ [1] Ledger                  — All Accounts / Accounts with Balance only /
│  │                                 Quick view; then Alphabetical / Accountwise /
│  │                                 Members Ledger
│  ├─ [2] Trial Balance           — + Exclude Opening Balance / Arrange
│  │                                 Alphabetically / Consolidated / Only Group balance
│  ├─ [3] Income & Exp A/c        (shown as "Prof.& Loss A/c" in the generic
│  │        build) → sub-menu: 0.Quit 1. I/E <T> Format  2. I/E Vertical
│  ├─ [4] Balance Sheet           → sub-menu: 0.Quit 1. B/S <T> Format
│  │                                 2. B/S Vertical  (+ "Print Schedules?")
│  ├─ [5] Cash Flow Stat.
│  ├─ [6] Income/Exp Analy        (Income & Expenditure Analysis)
│  ├─ [7] Expense Summary
│  ├─ [8] Cost Centre Rpt
│  ├─ [9] Financial Status        (management/MC-meeting report)
│  └─ [A] Recpts & Paymts         (Receipts & Payments statement)
│
├─ [6] Open/Clos Bal.          ("To View/Print the Opening and Closing
│  │                             Balances (as on any date)") — on-screen
│  │                             header " Open/Clos Bal "
│  ├─ [1] Opening Balance
│  ├─ [2] Closing Balance          (prompts for a closing-balance date — acts
│  │                                 like a trial balance as-on-any-date)
│  ├─ [3] Previous Yr. Amt
│  ├─ [4] Import Data              (merging a separate accounting module,
│  │                                 e.g. a "Major Repairs A/c" module — "Contact
│  │                                 Databyte Computers... not recommended unless sure")
│  └─ [5] Pick Open Inter.         (Pick Opening Balance / accumulated interest —
│                                    only for the 2nd+ year of use)
│
├─ [7] Accessories             ("To View/Print Mailing List, Labels, Bank
│  │                             Reconcilation, Backup/Restore Data, System
│  │                             Information, Set Day Alarm, House Keeping, HELP!!")
│  ├─ [1] Note Pad                — free-text memo; Ctrl+W = Save, Esc = Abandon
│  ├─ [2] System Info             (System Information — counts of bank/cash/
│  │                                 petty-cash entries; flags incomplete opening balances)
│  ├─ [3] Bank Reco.              → sub-menu: 0.Quit 1.Create 2.Generate
│  │                                 3.Untick B.R.S.
│  ├─ [4] House Keeping           (database optimisation/compaction)
│  ├─ [5] Back/Res Data           (Backup/Restore — see §3.9)
│  ├─ [6] Party Info.             (labels / address book / phone & file numbers)
│  ├─ [7] Set Reminder            (message + date; alerts on the day)
│  ├─ [8] Changing Case           (bulk upper/lower-case conversion of ledger names)
│  ├─ [9] HELP                    (opens `HELP.AID` online help viewer)
│  ├─ [R] Reminder Letter         (reminder letters to defaulting members with
│  │                                 their ledger attached)
│  └─ (also seen) General Info. / Locking Option
│
├─ [8] Setup                   ("To Design Society Bill, Change Password,
│  │                             Advanced Settings") — on-screen header
│  │                             "Advanced Options"
│  ├─ [1] Socty.Bill Setup        (Society Bill Setup — see §3.5)
│  ├─ [2] Refresh Open Bal        (Refresh Opening Balance — see §3.11 Year-end)
│  ├─ [3] Convert Account         (Code Convertor — shuffle one ledger a/c)
│  ├─ [4] Convert Group           (Group Convertor — shuffle a whole group)
│  ├─ [5] Merge  Accounts         (merge two ledger accounts into one)
│  ├─ [6] Delete Memo Vou.        (bulk-delete all Memo Vouchers)
│  ├─ [7] Advance Settings        ("not to be used by amateurs" — interest-free
│  │                                 items, rebate enable, cost-centre enable,
│  │                                 wording overrides e.g. "Interest"→"Penalty")
│  └─ [8] Groupwise Sort
│      Password sub-screens (also reached from Setup):
│        " PASSWORD SETUP " → "Do You Want to Change Password ?" →
│          "Enter New Password :" (max 5 chars, blank = none)
│        " SUPERUSER PASSWORD SETUP " → "Do You Want to Change Super User
│          Password ?" → "Enter New Super User Password :"
│
└─ [9] Installation            ("To Install - Change Company Name, Accounting
       Period, Super-user password etc.") — screen title "Installation of
       Financial Accounting Package":
         Society's Name
         ACCOUNTING PERIOD : Start Date / Last Date
       (generic/commercial build additionally shows: Company Name, Office
        Address, Factory Address, Telephone Nos., Fax Nos., Email Address,
        Residence Tel., B.S.T. No., C.S.T. No., and a business-type picker:
        COMPANY ; NON COMMERCIAL/INDIVIDUAL ; SOCIETY ; COMMISION AGENT ;
        CLEARING AGENT ; COMMUNICATION CENTRE)
```

---

### 3. Keystroke-Level Workflows

#### 3.1 Creating a New Society

1. From the **Main Menu**, press **0** (Quit). The vertical popup opens:
   `CANCEL / QUIT / SWITCH TO / CREATE SOCIETY`.
2. Highlight **CREATE SOCIETY** (or **CREATE COMPANY**) and press **Enter**.
   Screen title: ` CREATE / DELETE COMPANY ` with hint
   `<F1> Select Company to Delete / Rename`.
3. At **Enter Company No.** the next free company number is shown
   automatically (increments from the last one used) — press **Enter** to accept.
4. At **Enter Company Name :** type the Society's name, e.g.
   "Pink Marble Co-op Housing Soc Ltd", press **Enter**.
5. A selector appears: `Rename Company ; Create New Company ; Delete Company`
   — highlight **Create New Company**, press **Enter**.
6. At **PRESS ENTER TO PROCESS** press **Enter** — a group of files is copied
   to `C:\PACE\<nn>\`.
7. Prompt: `Copy Previous Year's Master Files ?` — answer **N** for a brand-new
   society (answer **Y** only for year-end rollover, §3.11).
8. Prompt: `Any More Companies?` — answer **N** to finish.
9. From the Quit popup, use **SWITCH TO** to open the newly created society.

#### 3.2 Installing a Society (codeword `james`)

1. Select the newly created society from the company picker, press **Enter**.
2. At ` Enter Password ` press **Enter** (blank — no password yet).
3. Prompt `Do  You  Want  to  Install ? ` — type **Y**.
4. Screen title `CAPITAL  PLUS  FINANCIAL  ACCOUNTING  SYSTEMS`, field
   `Enter  Code :` — type **james** (case-insensitive; `hello` is also accepted
   as an alternate codeword in the binary). An incorrect code shows
   `INVALID  COPY  OF  PACKAGE !!!` / `PRESS  ENTER  KEY` and must be retried.
5. Screen title ` Installation of Financial Accounting Package `:
   - **Society's Name** — confirm/enter the name.
   - **ACCOUNTING PERIOD : Start Date** — e.g. 01/04/2024.
   - **Last Date** — e.g. 31/03/2025.
   - Address and other fields may be left blank.
6. Save. The package returns to the Main Menu; "INSTALLATION NOT DONE" no
   longer appears.

#### 3.3 Creating Ledger Accounts

1. **Main Menu → [1] Master Maint. → [1] Create Account.**
2. Screen title ` LEDGER ACCOUNT CREATOR ` (hint:
   `<F8/F9> Calc./Calendar   <F12> Preview Accounts`).
3. **Ledger Account** field — type the name (e.g. member's name "Rajesh Shah",
   or a bill item such as "Property Tax", or balance-sheet item such as
   "State Bank of India"). Do **not** include the title (Mr./Mrs.) in a
   member's name — that is entered separately in Member Details.
4. A **Groups** pop-up list appears — select the appropriate group (e.g.
   `MEMBER'S DUES` for members, `MAINTENANCE EXPENSES` for an expense item,
   `CASH & BANK BALANCE` for a bank, `FIXED ASSETS`, `INVESTMENTS`,
   `PROVISIONS`, `OTHER FUNDS`, `SINKING FUND`, `CONTRIBUTION FROM MEMBERS`,
   etc. — see §5 for the full group-number map). Press **Enter**.
   Press **Ctrl+A** at the Group prompt to display all Groups.
5. **Opening Bal** field — enter the amount (may be left for later, via
   Edit Account or Member Details).
6. **Dr./Cr.** — enter **D** for a debit balance or **C** for a credit balance.
7. Prompt `Any More Entries ?` — **Y** to add another account, **N** / **Esc**
   to finish.
8. To correct a mistake: **Master Maint. → [2] Edit Account**, select the
   account from the list (` Select Account to Edit/Delete `), amend, then
   **Save** or **Delete**. Note: an account with postings cannot be deleted
   ("This Account cannot be deleted, Transactions found pertaining to it...");
   the Cash account can never be deleted; an account referenced by a Bill
   Structure or by the Interest-on-Dues setting also cannot be deleted.

#### 3.4 Entering Member / Flat Details and Rates

1. **Main Menu → [1] Master Maint. → [3] Member Details.**
2. The " B i l l   O p t i o n s " box appears:
   - **1. Edit Name, Area, Unit, Open. Bal ?** — answer **Y** to edit
     identity fields, **N** to skip.
   - **2. Allow editing of Rates ?** — answer **Y** to edit billing rates
     instead (mutually exclusive pass with option 1 in practice).
   - **3. Sort according to Flat Nos. ?** — answer **Y** to re-sort the grid
     by Wing/Flat No. after entering data out of order.
   - **4. Edit Item Names in Bills & Reg.?**, **5. Enable Function Keys for
     Rates**, **6. Add/Edit Rateable Value**, **7. Replicate Members (upto 999
     members)**, **8. Non Interest Chargeable Amount** — additional toggles.
3. With option 1 = Y, a grid opens with columns: **Title** (Mr./Mrs./Dr./
   Capt./M/s — press **Ctrl+T** to copy the title down to all remaining
   rows), **Bldg** (press **Ctrl+B** to copy down), **Wing** (press **Ctrl+W**
   to copy down), **Unit No.**, **Gala**, **Area** (press **Ctrl+R** to copy
   down; **Ctrl+R** also noted as "copy Area below"), **Area2**, **Cat**
   (category — see §5 for the full code list), **X** column (press **Ctrl+X**
   to toggle X; **Alt+X** to copy the X value down), **Open Balance**,
   **Op. Interest** (only if simple interest is used), **Details‑Prints in
   Bill**, **Other Details**. Press **Ctrl+H** at any time for the in-screen
   help popup listing all these shortcuts. Press **Ctrl+S** to search on Unit
   No.; press **Ctrl+F** to find a member's name (while entering receipts).
4. With option 2 = Y (Allow editing of Rates), the same grid instead shows
   each bill-item column (Field 1, Field 2, … up to Field 16) so rates can be
   typed per member. See §3.6 for the rate-copy function keys.
5. Save each row with **Enter**; leave the grid with **Esc** or by answering
   **N** to "Any More Entries?".

#### 3.5 Designing the Society Bill (Bill Structure)

1. **Main Menu → [8] Setup → [1] Socty.Bill Setup.**
2. A window prompts for: **Society's Name**, **Address**, **Registration No.**,
   the person who signs the bill, **rate of interest to be charged** (enter
   **0** for no interest), and (press **F1** to pick) the **interest ledger
   code** — only usable if an "Interest on Arrears" ledger account already
   exists. Enable **Building-wise** option (Yes) if wing/building-level
   outstanding statements are required. Enable **Rateable value** printing
   if required.
3. Prompt `Continue Further Bill Composition ?` — **Y**.
4. **Bill Structure Date** — e.g. `01/04/2024`. More than one structure/date
   can be created (e.g. for a supplementary bill); the correct date must be
   picked again at bill-generation time.
5. For each bill line item enter, in order:
   - **Particulars in Bill** — the wording printed on the bill (e.g.
     "PROPERTY TAXES").
   - **Column Head** (Reg Head1 / Reg Head2) — the column heading used in the
     printed Bill Register (2 lines, e.g. "Prop." / "Taxes").
   - **Select Ledger** — the ledger account to auto-post to (created in §3.3).
6. Prompt `Any More Items ?` — **Y** for another line, **N** to finish. Do
   **not** manually add an "Interest" line — it is generated automatically.

#### 3.6 Entering / Changing Bill Rates

1. **Main Menu → [1] Master Maint. → [3] Member Details** → answer **N** to
   option 1, **Y** to option 2 ("Allow Editing of Rates?").
2. Type the rate for each member under each bill-item column.
3. Copy-down shortcuts (must have "Enable Function Keys for Rates" ticked,
   §3.4 option 5):
   - **F1**–**F12** — repeats the value just entered in bill-item field 1
     through field 12 down to the last row of that column.
   - Enter a letter (A/B/C…) in the "Unit 2" column first to copy rates only
     within matching-letter groups instead of the whole column.
   - **Ctrl+A** — "Rate x Area Calculation": prompts for **Field No**, then
     calculates `Area × Rate` for that field (optionally restricted
     Wingwise or Buildingwise).
   - **Ctrl+M** — "Rate x Column Amount Calculation": prompts for **Field
     No** and **Multiply by**, multiplies the whole column by a factor.
   - **Ctrl+D** — "Column Amt / Rate Calculation": prompts for **Field No**
     and **Divide by**, divides the column by a factor.
   - **Ctrl+F1**–**Ctrl+F4** — additional copy slots (proc13–proc16,
     purpose beyond "additional field copy" **(not documented in sources)**).

#### 3.7 Generating, Printing, Re-billing and Updating Bills

1. **Generate Bills:** Main Menu → **[3] Bills/Vouchers → [3] Bills/Receipts
   → [1] Generate Bills** (shortcut referred to in the manual as "Menu
   3‑3‑1"). The system calculates arrears + interest for every member not
   marked `X` and creates the bill records.
2. **Print / View Bills:** **3 → 3 → [2] Print Bills.** A scrollable list of
   generated bills appears; use **Space bar** to tick/untick individual
   bills, then:
   - **F1** — de-select all bills.
   - **F2** — select all bills.
   - **F3** — select all bills for the single member at the cursor.
   - **F4** — select a full month's bills (the month the cursor is on).
   - **F5** — select the next 25 bills.
   - **F6** — select the next 50 bills.
   Recommended sequence: Space bar once, then **F1** to clear any stale
   selection, then re-select with Space bar or **F4**. Choose the page size
   (6"–12" paper) and, if subsequent bills print mis-aligned, correct with
   the **micro offset** field (negative value if later bills creep down,
   positive if they creep up).
3. **Delete Bills:** **3 → 3 → [3] Delete Bills** — deletes an entire month's
   generated bills (used before Re-billing a whole month, see Modify2
   workflow below).
4. **Re-bill one or a few bills (Modify1 workflow):**
   1. Note the Bill No. from **Account Books → Bill Register**.
   2. **Master Maint. → Member Details**, option 2 = Y, change the member's
      rate(s).
   3. **3 → 3 → [4] Re-billing** — enter the 5-digit, zero-padded bill number
      (e.g. `00020`); repeat for each additional bill; then **Save**.
   4. **3 → 3 → [8] Update** for the month(s) affected. If the change affects
      an earlier month, all subsequent months' bills must also be re-billed
      and updated.
5. **Re-bill a whole month (Modify2 workflow):**
   1. **Master Maint. → Member Details**, option 2 = Y, change rates.
   2. **3 → 3 → [3] Delete Bills**, select the month, delete.
   3. **3 → 3 → [1] Generate Bills** again for that month, then **[2] Print
      Bills** / **[8] Update**.
6. **Update Bills:** **3 → 3 → [8] Update** — posts the generated bills to
   each member's ledger. Safe to run repeatedly ("will post it... There is no
   harm in updating any number of times, it will post only once").
7. **Outstanding List:** **3 → 3 → [7] O/s List** — enter **Amount From** /
   **To** (enter a negative "From" amount, e.g. `-5000000`, to also include
   members in advance).
8. **Bank/Cash Receipt shortcut from billing menu:** **3 → 3 → [5] Bank
   Receipt** or **[6] Cash Receipt** post a receipt directly against a bill.
9. **Adding a brand-new bill item mid-year (Newitem workflow):** create the
   new Ledger Account (§3.3) → re-open Society Bill Setup (§3.5), press
   **Enter** on every existing field to keep old values, add only the new
   item (optionally with a new Bill Structure Date for a wholly new
   structure) → re-enter rates (§3.6) → store the old rates to a Library
   first if the structure changed completely.

#### 3.8 Entering Vouchers (every type)

All voucher entry screens share the same pattern: select **Add Mode**, the
document number auto-increments, then:

- **Bank Receipt** (Voucher Entry → 2, or Bills/Vouchers → 3 → 5):
  1. Select **Add Mode**.
  2. Select the **Bank** and press **Esc**.
  3. Enter the **Date** of receipt.
  4. Enter the **Amount**, press **Enter**.
  5. Press **F4** to pick the member/ledger from a list (or **F1** for an
     alphabetical ledger list, **F2** for an account-wise list, or simply
     type the first 2–3 letters of the name and press Enter).
  6. **Narration** line 1 — cheque number (do not literally type "cheq no")
     and cheque date.
  7. **Narration** line 2 — bank name (press **F4** for a bank-name
     pick-list, which can grow as new banks are typed).
  8. Prompt `Any Correction?` — **Y/N**.
  9. **Save** or **Delete**.
- **Bank Payment** (Voucher Entry → 3): identical steps, selecting an
  expense ledger instead of a member; press **F1** to select the account or
  type a name prefix (e.g. "Con" for Conveyance); enter the narration and
  cheque number; **Save**.
- **Cash Receipt** (Voucher Entry → 4): same steps, no bank/cheque fields.
- **Cash Payment** (Voucher Entry → 5): same steps as Bank Payment, no bank
  field.
- **Petty Cash** (Voucher Entry → 1): same pattern, posts to the Petty Cash
  Book.
- **Journal Voucher** (Voucher Entry → 6): Date → Account to Debit → Amount
  → Account to Credit → Narration → Save. (Used e.g. for Depreciation entries
  — FAQ Q3/Q13.)
- **Memo Voucher** (Voucher Entry → 7): identical to Journal Voucher but
  temporary; bulk-deletable via **Setup → [6] Delete Memo Vou.**
- **Contra entry** (cash↔bank or bank↔bank — entered only once):
  - Cash deposited into bank → **Bank Receipt**, select **Cash** as the
    ledger account, narration "Cash deposited".
  - Cash withdrawn from bank → **Bank Payment**, select **Cash** as the
    ledger account, narration "Cash withdrawn for expenses".
  - Bank-to-bank transfer → **Bank Payment** or **Bank Receipt**, selecting
    the other bank as the ledger account.
- **Editing any voucher** (Accessories/Editing workflow): choose **Edit
  Mode**, type the known **Receipt/Document No.** in place of the Doc No
  field, amend, **Save/Delete**. If the number is unknown, press **F12** to
  search instead — enter a **From/To date range** and/or a **From/To amount
  range** (leave both blank to browse all), then press **Enter** on the
  matching transaction to open it for editing. Applies identically to Bank
  Receipt, Bank Payment, Cash Receipt, Cash Payment and Journal entries.

#### 3.9 Reports and Account Books — running each

- **Ledger** (Reports → 1): choose **All Accounts / Accounts with Balance
  only / Quick view**, then **Alphabetical / Accountwise / Members Ledger**.
  In the account tick-list: **Space bar** ticks one account; **Esc** selects
  all; tick one account then press **F1** to select its whole group; **F3**
  de-selects the group under the cursor; **F4** selects all debit-balance
  accounts; **F5** selects all credit-balance accounts. Optional: **Create
  Ledger Index** (adds a page-number index at the end of the printed ledger);
  **Exclude Opening Balance**.
- **Trial Balance** (Reports → 2): options Exclude opening balance / Arrange
  Alphabetically / Consolidated trial balance / Only Group balance.
- **Income & Expenditure A/c** (Reports → 3): choose **T Format** or
  **Vertical**; prompted whether using an 80-column (small) printer for
  compressed output.
- **Balance Sheet** (Reports → 4): same T/Vertical choice; prompted **Print
  Schedules? (Y/N)** — schedule membership of a group is set via **Master
  Maint. → Group Entry**.
- **Cash Flow Statement** (Reports → 5): monthwise bank deposits/withdrawals,
  cash receipts/payments, petty cash, and closing balances.
- **Income & Exp. Analysis** (Reports → 6): monthwise comparison of all
  income/expense heads.
- **Expense Summary** (Reports → 7): monthwise expense summary split by
  bank/cash/petty cash.
- **Cost Centre Report** (Reports → 8): requires Cost Centre option switched
  on via Setup → Advance Settings.
- **Financial Status** (Reports → 9): consolidated billed/received/paid
  picture for Managing Committee meetings.
- **Petty Cash Book / Cash Book / Bank Book** (Account Books → 1/2/3):
  choose **Monthwise** or **Datewise**; options for **Summary format**,
  **Balance column**, **narration on/off**, **document numbers**, **voucher
  numbers**. In the **Cash Book**, press **F1** to open **Search** — enter a
  word (e.g. "accounting") to filter narrations/ledger names containing it;
  filtered views show no meaningful opening/closing balance.
- **Bill Register** (Account Books → 4): select the bill-generation
  month/date; the list shows each date's **Updated** / **Not Updated**
  status.
- **Journal Book / Memo Voucher Book** (Account Books → 5/6): option for
  Reference No. Yes/No.
- **Member's Register / Summary Register** (Account Books → 7/8): enter
  **From member / To member**; "Include Recovery" option shows payments too.

#### 3.10 Printing or Exporting Any Report

1. From any report's output prompt, choose one of:
   - **Screen** — view on screen (requires `browse.com` on the DOS `PATH`,
     per FAQ Q1).
   - **Printer** — print; set the printer to **12-inch page length** first
     (FAQ Q12) or pages will mis-align at the perforation.
   - **File** — export to text; enter an 8-character file name (e.g.
     `BALANCE`), producing `c:\balance.txt` (default `c:\report.txt`), which
     can then be opened in Notepad/Word/Excel (reformat as ASCII).
2. The status-bar hot-key legend for this chooser (binary string):
   `\!Screen;\<Printer;\<File;\?Quit`.

#### 3.11 Bank Reconciliation Statement (BRS)

1. **Main Menu → [7] Accessories → [3] Bank Reco. → [1] Create.**
2. Select the bank, press **Esc**.
3. Select the month (e.g. "April 2024"), press **Enter**.
4. All bank payment/receipt transactions for that bank display in a window;
   navigate with **arrow keys, Home, End, PageUp, PageDown**.
5. Compare against the bank statement/passbook; press **Space bar** to tick
   each matched entry — a tick appears under "Cleared on" showing the
   clearing month.
6. After ticking everything for the month, press **Esc**.
7. Prompt `Any more unticked items?` — **Y** if there are missing entries
   (prior-year items clearing this year, or bank charges/interest not yet
   entered — go enter them as a voucher first, then return here to tick
   them); otherwise **N**.
8. **[2] Generate** — view/print the BRS; it should tally with the bank
   statement.
9. **[3] Untick B.R.S.** — reverses all ticks for a chosen month if a mistake
   was made.

#### 3.12 Setting Rebate / Interest

- **Enable Rebates:** Setup → [7] Advance Settings → enable the Rebate
  option (otherwise Rebate Options shows "Option for Rebates not set, in
  Advance Settings").
- **Create a "Rebate Allowed" ledger account** (Master Maint. → Create
  Account) and note its code for the **Rebate Code** field.
- **Bills/Vouchers → [6] Rebate Options** — set **Rebate Rate**, **Rebate
  Code**, **F/C/P** (Fixed amount / %age / Paise), **A/B** (based on Area or
  on Bill Amount — Bill Amount covers fields 1–15 only), **Print a footnote
  in Bill?**, **Note Style (A/B/C)**, **Auto Generate Rebate Table**, **Pass
  Rebate JV Automatically**, **Month**. Press **Ctrl+H** for the in-screen
  rebate help, which lists this exact 6-step procedure (enable in Advance
  Settings → create ledger → enter rebate amount at receipt time → set
  Rebate Options → Pass Rebates JV Automatically → Generate Bills).
- **No interest for one member:** Master Maint. → Member Details, enter
  **N** in the **Cat** column for that member (NoInterest workflow).
- **No interest for everyone:** Setup → Society Bill Setup → set the
  interest rate field to **0**.
- **No interest on one bill item for everyone** (e.g. Major Repair Charges):
  Setup → [7] Advance Settings → "Option for Interest Free Item?" → **Y** →
  type the item's name; then Master Maint. → Member Details → say **N** to
  all Bill Options except when prompted **Non Interest Chargeable Amount**,
  where the exempt amount per member is entered (set back to Nil once paid).

#### 3.13 Backup and Restore

1. **Main Menu → [7] Accessories → [5] Back/Res Data → Backup.**
2. **Enter a drive** — `A` for floppy, `C`/`D` for hard disk, or a
   CD-burning drive if third-party burning software (e.g. INCD) is
   installed.
3. **Enter a meaningful file name**, replacing the default `XFILE` (e.g.
   `DATA2025`). Re-using a name overwrites the previous backup of that name;
   never use the same name for two different societies.
4. The package compresses all data for the currently open society into
   `<drive>:\<filename>.arj` using the bundled `CAPITAL\ARJ.EXE` (FAQ Q2:
   `ARJ.EXE` must be copied onto the DOS `PATH` for backup to work, e.g. into
   `C:\WINDOWS`, or use the installation CD's "Copy Required System Files").
5. Only back up when the data looks correct — never back up over good data
   with a session you suspect is corrupted.
6. **Restore:** Back/Res Data → Restore → enter the source drive and the
   same file name (the last-used name is shown by default) → confirm. Restore
   only when the current data is corrupted/unwanted, since it fully replaces
   the active society's data. The entire `PACE\` folder (all societies) can
   also be copied/burned directly as a manual full-system backup.

#### 3.14 Year-End Rollover

Two supported methods (FAQ Q14):

- **Method A — new society per year:**
  1. At the end of March (the last month of the accounting period), run
     §3.1 "Creating a New Society" again, using a similar name with the new
     year appended.
  2. At `Copy Previous Years Master Files ?` answer **Y**; a society list
     appears — select the previous year's module, press **Enter**. All
     master files (ledgers, members, groups, bill structure) copy into the
     new society.
  3. Continue entering transactions in the new year; use **Switch To** to
     move between the two years' modules as needed.
  4. Once the previous year is fully finalised (journal entries for
     Depreciation, Excess of Income/Expenditure transfer — FAQ Q13 shows the
     exact JV pairs), go to the new year's module: **Setup → Advance
     Options → Refresh Open. Bal.**, select the previous year's module from
     the list, press **Enter** — all closing balances are copied in as the
     new year's opening balances. If any ledger name/group was changed
     between the two years, that account is **not** refreshed automatically
     and must be corrected manually via Edit Account; the system reports
     which accounts were skipped. (v5.97+ note: Refresh Opening Balance
     excludes Members' Opening Balance.)
- **Method B — single continuous module:** keep working in the same society
  and simply extend the **Accounting Period Last Date** (Installation
  screen, §3.2) each year; take care never to post entries with dates from
  the wrong year; use **Exclude Opening Balances** on reports to see a given
  period in isolation.

#### 3.15 Other Documented Workflows

- **Transferring a flat / new member (transfer.rtf):** create the new
  member via Create Account → group `Member's Dues`; enter the new member's
  unit no.; sort by flat no. so old/new rows sit together; enter the new
  member's rates; mark the **old** member's **Cat** column with **X** so no
  further bills are generated for them. This creates two separate ledgers
  (old and new). A faster but untraceable alternative is simply overwriting
  the old member's name in place (not recommended — loses the transfer
  trail).
- **Shuffling a ledger account (Account2.rtf):** Setup → Convert Account →
  **F1** to pick the ledger to move → prompt `Enter Code to Change` → **F1**
  again to find the destination group's code range (e.g. Repairs Fund =
  `120003`) → type the next free code (`120004`) in **Enter New Code** →
  confirm `Interchange Code?` **Yes**. Member accounts cannot be shuffled
  this way — delete and re-enter instead.
- **Merging two ledgers (Setup → [5] Merge Accounts):** enter the **merge
  from (source) code** — press **F1** to pick the account to be absorbed
  (e.g. "Staff Bonus Account") — then the **merge to (target) code** — press
  **F1** to pick the surviving account (e.g. "Staff Salary Account").
- **Receiving Transfer Fees / non-billed income (Account1.rtf):** either (A)
  credit the "Transfer Fee" ledger directly and note the flat no. in the
  narration, selecting the **Non-billing** option when printing the receipt;
  or (B) credit the member as usual, then pass a Journal Voucher: Member
  Account **Dr.** / Transfer Fees **Cr.**

---

### 4. Complete Keyboard Shortcut / Function Key Reference

| Key | Context | Effect |
|---|---|---|
| **Enter** | Everywhere | Confirm/select the highlighted item or accept a field's default value |
| **Esc** | Everywhere | Cancel / back out of a screen; in tick-lists (Ledger report), **Esc selects all accounts**; in the Printer/Screen/File chooser, Esc = Quit |
| **Arrow keys (↑↓←→)** | Menus, grids, BRS window | Move the highlight bar / navigate cells |
| **Home / End / PageUp / PageDown** | Bank Reconciliation window, HELP.AID viewer | Scroll the transaction list / help text |
| **Space bar** | Bill print-select lists, Ledger report tick-list, BRS tick-list | Tick/un-tick the item under the cursor |
| **F1** | Create Account (Group pick) | — |
| **F1** | Print Bills list | De-select all bills |
| **F1** | Ledger report tick-list | Select the whole Group the cursor is in |
| **F1** | Voucher Entry (ledger lookup) | Alphabetical list of all ledger accounts |
| **F1** | Setup → Convert Account / Merge Accounts | Pick the ledger account to change / merge |
| **F1** | Member Details rate grid | Repeat field-1 rate down the column |
| **F1** | Rates/List screens generally | "Preview/Edit" or search, depending on screen |
| **F2** | Print Bills list | Select all bills |
| **F2** | Ledger report tick-list | Select all accounts (tick all) |
| **F2** | Voucher Entry (ledger lookup) | Account-wise list of ledger accounts |
| **F2** | Member Details rate grid | Repeat field-2 rate down the column |
| **F3** | Print Bills list | Select all bills for the single member at the cursor |
| **F3** | Ledger report tick-list | De-select the Group the cursor is in |
| **F3** | Member Details rate grid | Repeat field-3 rate down the column |
| **F4** | Print Bills list | Select a whole month's bills |
| **F4** | Ledger report tick-list | Select all Debit-balance ledger accounts |
| **F4** | Voucher Entry (Bank/Cash Receipt) | Pick the member/ledger from a list |
| **F4** | Narration line (bank name) | Pick a bank name from the bank list |
| **F4** | Member Details rate grid | Repeat field-4 rate down the column |
| **F5** | Print Bills list | Select the next 25 bills |
| **F5** | Ledger report tick-list | Select all Credit-balance ledger accounts |
| **F5** | Bill Tracking screen | Toggle Y/N for "Track" |
| **F5**…**F12** | Member Details rate grid | Repeat field-5 … field-12 rate down the column |
| **F6** | Print Bills list | Select the next 50 bills |
| **F6** | Bill Tracking screen | Toggle Y/N for "Track" |
| **F8** | Ledger Account Creator, STD/ISD entry, Product entry | Open pop-up Calculator |
| **F9** | Ledger Account Creator, STD/ISD entry | Open pop-up Calendar |
| **F10** | Purchase/Sales entry screens (commercial build) | Edit |
| **F11** | Any screen, globally | Open context-sensitive Online Help |
| **F12** | Ledger Account Creator | Preview Accounts |
| **F12** | Editing Receipts/Payments/Journal | Switch to search-by-date/amount-range mode when the Doc No. is unknown |
| **F12** | List/browse screens (Narrations, Items, Products) | Delete the highlighted entry |
| **Ctrl+A** | Member Details (rate grid) | "Rate x Area Calculation" — multiplies Area × Rate into the chosen field, optionally Wingwise/Buildingwise |
| **Ctrl+A** | Create Account (Group prompt) | Display all Groups |
| **Ctrl+B** | Member Details (identity grid) | Copy the **Bldg** value down to all remaining rows |
| **Ctrl+C** | Member Details grid | Bound to `procC` **(exact effect not documented in sources)** |
| **Ctrl+D** | Member Details (rate grid) | "Column Amt / Rate Calculation" — divides the chosen field by an entered factor |
| **Ctrl+F** | Receipt/voucher entry | Find a member's name |
| **Ctrl+F1**–**Ctrl+F4** | Member Details rate grid | Additional rate copy slots (proc13–16) |
| **Ctrl+H** | Member Details grid; Rebate Options screen | Open the in-screen contextual Help popup |
| **Ctrl+M** | Member Details (rate grid) | "Rate x Column Amount Calculation" — multiplies the chosen field by an entered factor |
| **Ctrl+N** | Member Details grid | Bound to `procN` **(exact effect not documented in sources)** |
| **Ctrl+R** | Member Details (identity grid) | Copy the **Area** value down to all remaining rows |
| **Ctrl+S** | Member Details / receipt entry | Search on Unit No. |
| **Ctrl+T** | Member Details (identity grid) | Copy the **Title** (Mr./Mrs./Dr./Capt./M/s) down to all remaining rows (replaces the older Ctrl+A for this purpose) |
| **Ctrl+W** | Member Details (identity grid) | Copy the **Wing** value down to all remaining rows |
| **Ctrl+W** | Note Pad (Accessories) | Save the note |
| **Ctrl+X** | Member Details (Cat/X column) | Toggle the **X** (omit-from-billing) marker for the member at the cursor |
| **Ctrl+Z** | Member Details grid | Bound to `procZ` **(exact effect not documented in sources)** |
| **Alt+X** | Member Details (X column) | Copy the X-column value down to all remaining rows |
| **Backspace** | Various grids | Shift+Tab equivalent — move to the previous field |

Notes:
- These bindings are drawn directly from the `.lan`/menu-action strings inside
  `PACE.EXE` (`ctrl+a do procArea`, `ctrl+m do procMulti`, `ctrl+d do
  procDivide`, `ctrl+t do procT`, `ctrl+w do procW`, `ctrl+h do procH`,
  `ctrl+b do procB`, `ctrl+r do procR`, `ctrl+x do procX`, `alt+x do procXX`,
  `ctrl+n do procN`, `ctrl+z do procZ`, `ctrl+c do procC`) and from the
  step1–step7 / HELP.AID walkthroughs, so the key names are exact, but a few
  rarely-used ones (`Ctrl+C`, `Ctrl+N`, `Ctrl+Z`) have no described effect in
  any source text — their generic internal action names are given as found.
- Any key not listed above (e.g. a persistent bottom-of-screen F-key legend
  bar analogous to "F1-Help F10-Save" seen in many DOS/FoxPro apps) is
  **(not documented in sources)** — none of the eMANUAL RTFs, SUMMARY.md, or
  extracted strings describe a universal legend bar distinct from the
  per-screen hints already listed above.

---

### 5. Category Codes, Group Numbers & Other Coded Fields

#### 5.1 Member "Cat" (Category) column — Member Details grid

| Code | Meaning |
|---|---|
| **S** | Shop |
| **G** | Garage (No.) |
| **L** | Gala |
| **O** | Office (#) |
| **P** | Parking (#) |
| **U** | Unit (No.) |
| **F** | Flat (No.) |
| **R** | Room No. |
| **D** | Godown |
| **C** | Cottage |
| **T** | Plot |
| **H** | House (#) |
| **A** | Basement |
| **B** | Bungalow |
| **N** | No Interest — interest is not charged to this member even if arrears exist |
| **X** | Omit from billing — no bills are generated for this member (also used to retire/freeze the old member's ledger after a unit transfer); toggled with **Ctrl+X**, copied down with **Alt+X** |

> If the majority of units are plain Flats or Galas, the category column can
> be left blank and the unit type instead set once, globally, in Setup (per
> the in-screen Ctrl+H help text).

#### 5.2 Ledger Group Numbers (Group Master Entry / Convert Account / Convert Group)

Four broad Groups exist by default — **Liabilities, Assets, Income,
Expenditure** — each allowing up to 10 sub-groups:

| Group-number range | Belongs to |
|---|---|
| **11–19** | Liabilities |
| **21–29** | Assets |
| **31–39** | Income |
| **41–49** | Expenditure |
| **x9** (19, 29, 39, 49) | Reserved — "Excess of Income" / "Excess of Expenditure over Income"; **not** to be reused for any other purpose |

Full account **codes** (used in Convert Account / Convert Group "Enter New
Code" prompts) are longer numbers whose **leading digit** signals the same
four groups:

| Leading digit of the ledger code | Statement section |
|---|---|
| **1…** | Liabilities |
| **2…** | Assets |
| **3…** | Income |
| **4…** | Expenditure |

(Worked example from Account2.rtf: Repairs Fund = code `120003`; the next
free code in that group is `120004`.)

Groups can be renamed (keeping their basic Liability/Asset/Income/Expense
nature intact), and each Group can be individually set, in **Group Master
Entry**, to print:
- in the **Inner** or **Outer** column of the Balance Sheet / Income &
  Expenditure Account (`I`/`O` field), and
- directly in the statement or under a numbered/lettered **Schedule**
  (`Enter Schedule No.` — may be numeric `1,2,3…` or alphabetic `A,B,C…`).

#### 5.3 Other coded / parameter fields

- **Dr./Cr. indicator** (Create/Edit Account, Opening Balance entry): **D**
  = Debit balance, **C** = Credit balance.
- **Rebate basis code [F/C/P]** (Rebate Options → "Fixed Amount/%age/Paise"):
  **F** = Fixed amount, **C** = %age (Percent — note the field label uses
  C for the percentage choice), **P** = Paise.
- **Rebate calculation basis [A/B]** (Rebate Options): **A** = Area-based,
  **B** = Bill-amount-based (fields 1–15 only).
- **Rebate Note Style [A/B/C]** (Rebate Options footnote wording) — three
  preset styles, exact wording of each **(not documented in sources)**.
- **Tax type [C/S]** (commercial/tax module, Tax Master Setup): **C** =
  Central Tax, **S** = State-level Tax.
- **Stock valuation basis [C/S]** (commercial Product module): **C** = Cost
  Price, **S** = Selling Price.
- **Sort basis [D/R/U]** (Receipts Register / Receipts List): **D** =
  Date-wise, **R** = Receipt-No-wise, **U** = Unit-wise.
- **Business-type picker** (Installation screen, non-society/commercial
  build): `COMPANY ; NON COMMERCIAL/INDIVIDUAL ; SOCIETY ; COMMISION AGENT ;
  CLEARING AGENT ; COMMUNICATION CENTRE` — the confirmed running app is the
  **SOCIETY** build (company 01 = "Pink Marble Co-op Housing Soc Ltd").
- **Password length limit:** both the User Password and the Superuser
  Password are capped at **5 characters**; leaving the "Enter New Password"
  field blank clears/removes the password.
- **Installation codeword:** `JAMES` or `HELLO` (case-insensitive) — entered
  once at `Enter  Code :` on first installation of a society.
- **Backup file default name:** `XFILE` (always override with a meaningful,
  per-society-unique name, e.g. `DATA2025`); backup output is always
  `<drive>:\<filename>.arj`, created via the bundled `CAPITAL\ARJ.EXE`.
