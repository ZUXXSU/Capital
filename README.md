# PACE / CAPITAL

Society, company and personal accounting software by **SAKET Consultant**, built
with FoxPro 2.5 for DOS. `PACE.EXE` is a 16-bit MS-DOS binary dated 2007 and it
cannot run natively on any current operating system — 64-bit Windows dropped
NTVDM, and macOS and Linux never ran DOS binaries at all.

This folder is the whole application, packaged to run on a modern machine. Copy
the folder, double-click a launcher, use the app.

---

## Getting it from this repository

To keep the repo lean, two large pieces are **not** in Git and ship as
[**Release**](../../releases) assets instead:

- **The emulator** (`emu/`, ~110 MB DOSBox-X). Without it, the launchers fall
  back to a DOSBox-X already installed on your machine (`brew install dosbox-x`
  / `winget install joncampbell123.DOSBox-X` / `sudo apt install dosbox-x`). For
  a fully self-contained copy, download the release bundle and unzip its `emu/`
  folder next to the launchers.
- **The user manual** (`eMANUAL/`, ~51 MB of RTF + viewer) — also a release
  asset.

**No sample data is included.** The repo ships only the blank master templates
in `PACE/`; on first run, use **CREATE SOCIETY** in the app to start your own
set of books. (The original install's real client data is intentionally
excluded.)

The fastest way to a working copy is to download the **release bundle zip**,
which contains everything — launchers, program, emulator, manual — ready to
double-click.

---

## Run it

| Platform | Double-click | Notes |
|---|---|---|
| macOS (Apple silicon) | `PACE.app` | Emulator included. Allow disk access on first run. |
| macOS (fallback) | `PACE.command` | Opens in Terminal. Use if `PACE.app` is denied access. |
| Windows | `PACE.cmd` | Needs an emulator — see [Other platforms](#other-platforms). |
| Linux | `PACE.sh` or `PACE.desktop` | Needs an emulator — see [Other platforms](#other-platforms). |

From a shell, any platform:

```sh
./PACE.sh            # launch
./PACE.sh --check    # verify the setup, run nothing
./PACE.sh --shell    # mount the drive, stop at the DOS prompt
./PACE.sh --conf     # print the generated emulator config
```

`PACE.cmd` takes the same four forms on Windows.

A healthy `--check` looks like this:

```
root      : /Volumes/KRYPTIX/test2/CAPITAL/new
societies : 01»
emulator  : bundled mac-arm64
ok        : ready to run
```

### First run on macOS

The app and its data normally live on an external or USB disk, and macOS guards
those. On first launch you get a prompt asking for access to the volume — click
**Allow**. If no prompt appears and you get `Operation not permitted`, either:

- use `PACE.command` instead, which runs under Terminal's existing permissions, or
- grant it manually: **System Settings → Privacy & Security → Files and Folders**.

`PACE.app` is ad-hoc signed so that the grant sticks between launches. The
launcher also clears the macOS quarantine flag from the bundled emulator the
first time it runs, which is what otherwise breaks a copy that arrived by USB
stick or AirDrop.

---

## Deploy it

The folder *is* the deployment. There is no installer and no system-wide state.

1. Copy this entire folder to the target machine, a USB stick, or a network share.
2. Keep the structure intact — every launcher resolves paths relative to itself,
   and the app's own paths are relative to this folder.
3. Double-click the launcher for that platform.

Rename the folder to whatever you like; nothing depends on its name. On Windows
and Linux, see [Other platforms](#other-platforms) to add the matching emulator
so the copy stays self-contained.

### Multi-user / shared data

The original DOS install ran from a network share (`\\SAKET2\D`) with the data
on the server. That still works: put this folder on the share and point each
workstation's launcher at it. The data files are shared dBase/FoxPro tables with
their own record locking, so concurrent use behaves as it always did — including
its original limits. Keep backups; see [Backups](#backups).

---

## What is in here

```
.
├── PACE.app           macOS launcher (double-click)
├── PACE.command       macOS launcher via Terminal (permission fallback)
├── PACE.cmd           Windows launcher
├── PACE.sh            macOS/Linux launcher — the actual implementation
├── PACE.desktop       Linux desktop entry
│
├── CAPITAL/           the program
│   ├── PACE.EXE       main binary (FoxPro 2.5 DOS runtime)
│   ├── CONTROL.PRO    licence and expiry record
│   ├── BLACK.BOX      program data
│   ├── CO.DBF/.CDX    company table
│   ├── LAB.LBX/.LBT   label definitions
│   ├── HELP.AID       help text (HELP.BAK is the app's own backup)
│   ├── INFO.AID       info screens
│   ├── AID.TBK        help index
│   ├── FOXUSER.DBF/.FPT  FoxPro resource file (window sizes, settings)
│   ├── ARJ.EXE        archiver, used by the app's backup feature
│   ├── browse.com     file browser utility
│   └── DELTREE.EXE    directory removal utility
│
├── PACE/              the data
│   ├── *.LAN *.DBF *.CDX   master tables (81 files)
│   └── 01»/                society 01's books (126 files)
│
├── emu/               the emulator
│   └── mac-arm64/     DOSBox-X 2026.10.01, native Apple silicon
│
├── eMANUAL/           user manual, RTF + eMANUAL.exe viewer (51 MB)
│
└── attic/             archived, not used at runtime — see below
```

### `attic/`

Nothing here is needed to run the app. It is kept rather than deleted because it
is part of the original distribution.

- **`dos-installers/`** — `SETTINGS.BAT`, `setit.bat`, `setup.bat`, `cap.bat`,
  `CAPITAL.BAT`, `mo.bat`. These did the 1990s install: copy launchers to the
  drive root, copy `ARJ.EXE` and `browse.com` into `C:\WINDOWS`, clear read-only
  flags, set `PATH` to `C:\FOX25`. The launchers do all of this in the emulator
  config now, so running these would only scatter files around.
- **`licence-tooling/`** — `crack.bat`, `CRACK.PRG`, `CRACK.FXP`. This blanks the
  `sec` and `ret` fields in `INSTA.LAN`, which is the registration record that
  pairs with `EXPIRY` / `REGD` in `CONTROL.PRO`. It is a licence bypass, it is
  not wired up, and it needs a FoxPro 2.5 install that is not included. If your
  licence has lapsed, renew it with SAKET Consultant.
- **`SocietyPlus3.06.exe`** — Windows installer for the vendor's later product.
  Unrelated to this DOS build; kept as the upgrade path.

---

## How it works

`PACE.EXE` has its paths compiled in **drive-less and root-anchored** —
`\capital\control.pro`, `\pace\bills.lan`, `\pace\*.cdx` and so on. It has no
notion of living in a subfolder.

So the launchers mount **this folder** as the DOS `C:` drive:

```
[autoexec]
mount c "<this folder>"
c:
set PATH=%PATH%;C:\CAPITAL
cd \CAPITAL
del *.tmp
pace -t
exit
```

`\capital\…` and `\pace\…` then resolve exactly as the binary expects. The mount
is a live host folder, not a disk image, so the app reads and writes
`CAPITAL/`, `PACE/` and `PACE/01»/` directly — your data is plain files you can
back up, copy and inspect with normal tools.

The generated config also sets:

- `xms = true`, `ems = true`, `memsize = 16` — the FoxPro DOS extender needs XMS;
  the binary references XMS, VCPI and VDS.
- `core = dynamic`, `cycles = max` — the app is from 1995; run it flat out.
- `machine = svga_s3` — its text and graphics modes.
- `file access tries UTF-8 = true` — keeps the society folder name `01»` intact.
  That `»` is byte `0xBB` in DOS code page 437 but UTF-8 `C2 BB` on disk. This is
  a DOSBox-X option; plain DOSBox ignores it.

Nothing is written outside this folder except a throwaway config in the system
temp directory, regenerated on every launch.

### Societies

Each set of books is a subfolder of `PACE/`, discovered by listing `\PACE\*.*`
at startup — the names are data, not compiled in, so you can add more. Use
**CREATE SOCIETY** in the app rather than making folders by hand, so its master
tables stay consistent. Switch between them with **SWITCH TO**.

### Backups

`ARJ.EXE` ships in `CAPITAL/` and is on the DOS `PATH`, so the app's own backup
feature works. For a full backup, copy `CAPITAL/` and `PACE/` — that is the
entire state of the system. `emu/` and `eMANUAL/` are replaceable.

---

## Other platforms

`emu/` holds only the Apple silicon build. To make a Windows, Intel Mac or Linux
copy self-contained, drop the matching
[DOSBox-X](https://github.com/joncampbell123/dosbox-x/releases) build in beside
it, keeping these exact paths:

| Platform | Path the launcher looks for | Release asset |
|---|---|---|
| Windows 64-bit | `emu/win64/dosbox-x.exe` | `dosbox-x-mingw64-*-portable.zip` |
| Windows 32-bit | `emu/win32/dosbox-x.exe` | `dosbox-x-vsbuild-win32-*-portable.zip` |
| macOS Intel | `emu/mac-x86_64/dosbox-x.app` | `dosbox-x-macosx-x86_64-*.zip` |
| macOS Apple silicon | `emu/mac-arm64/dosbox-x.app` | `dosbox-x-macosx-arm64-*.zip` |
| Linux | `emu/linux/dosbox-x` or `emu/linux/*.AppImage` | no portable build published |

Without a bundled copy, each launcher falls back to a DOSBox-X already on the
machine, then to plain `dosbox` with a degraded-mode warning, and otherwise
prints the right install command:

```sh
winget install joncampbell123.DOSBox-X     # Windows
brew install dosbox-x                      # macOS
sudo apt install dosbox-x                  # Linux
flatpak install flathub com.dosbox_x.DOSBox-X
```

Plain DOSBox runs the app but ignores `file access tries UTF-8`, so society
folder names containing high-byte characters such as `01»` can come through
mangled. Use DOSBox-X.

---

## Troubleshooting

**`Operation not permitted` on macOS** — Gatekeeper and disk-access permissions.
See [First run on macOS](#first-run-on-macos).

**`DOSBox-X not found`** — see [Other platforms](#other-platforms).

**`missing CAPITAL/` or `missing PACE/`** — a launcher was moved away from the
folder it belongs to. All of them must sit directly beside `CAPITAL/` and
`PACE/`.

**`no society folder in PACE/`** — the data folder is empty. Restore from backup,
or use **CREATE SOCIETY** to start a new set of books.

**Window too small, too large, or wrong aspect** — edit `windowresolution` and
`aspect` in the launcher's config block, or resize with the emulator's own
controls (`Ctrl-F10` releases the mouse).

**The app runs too fast or too slow** — change `cycles = max` in the launcher's
config block to a fixed figure such as `cycles = 20000`.

**Expired or unregistered** — `CONTROL.PRO` holds the `EXPIRY` and `REGD`
record. Contact SAKET Consultant for a renewal.

---

## Licence

The application, its data formats and `eMANUAL/` are the property of **SAKET
Consultant** and are not covered by any licence granted here. DOSBox-X in `emu/`
is GPL-2.0-or-later; its `COPYING.txt` and sources are at
<https://dosbox-x.com>. The launchers in this folder are configuration glue —
use them however you need.
