#!/bin/sh
# PACE / CAPITAL launcher for macOS and Linux. POSIX sh, no Python, no install.
#
# PACE.EXE is a 16-bit MS-DOS binary (FoxPro 2.5 DOS runtime). It cannot run
# natively on any modern OS, so this mounts the folder it lives in as the DOS
# C: drive inside DOSBox-X and starts the app.
#
# Every path compiled into PACE.EXE is drive-less and root-anchored
# (\capital\..., \pace\...), so the folder holding CAPITAL/ and PACE/ has to be
# the root of the DOS drive. That is what "mount c" below does.
#
#   ./PACE.sh            launch
#   ./PACE.sh --check    verify setup, run nothing
#   ./PACE.sh --shell    mount and stop at the DOS prompt
#   ./PACE.sh --conf     print the generated DOSBox-X config

set -u

ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
PROGRAM_DIR=CAPITAL
DATA_DIR=PACE
MAIN_EXE=PACE.EXE
TOOLS_DIR=FOX25

MODE=run
case "${1:-}" in
    --check) MODE=check ;;
    --shell) MODE=shell ;;
    --conf)  MODE=conf ;;
    "")      ;;
    *) printf 'usage: %s [--check|--shell|--conf]\n' "$0" >&2; exit 2 ;;
esac

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf 'warning: %s\n' "$1" >&2; }

# ---------------------------------------------------------------- locate emulator

EMU=""
EMU_LABEL=""

mac_bundled() {
    # Prefer the build matching the CPU; Rosetta runs the x86_64 one on Apple
    # silicon if that is all we shipped.
    case "$(uname -m)" in
        arm64) order="mac-arm64 mac-x86_64" ;;
        *)     order="mac-x86_64 mac-arm64" ;;
    esac
    for dir in $order; do
        bin="$ROOT/emu/$dir/dosbox-x.app/Contents/MacOS/dosbox-x"
        [ -x "$bin" ] && { EMU=$bin; EMU_LABEL="bundled $dir"; return 0; }
        bin="$ROOT/emu/$dir/dosbox-x"
        [ -x "$bin" ] && { EMU=$bin; EMU_LABEL="bundled $dir"; return 0; }
    done
    return 1
}

linux_bundled() {
    for bin in "$ROOT/emu/linux/dosbox-x" "$ROOT"/emu/linux/*.AppImage; do
        [ -x "$bin" ] && { EMU=$bin; EMU_LABEL="bundled linux"; return 0; }
    done
    return 1
}

find_emulator() {
    case "$(uname -s)" in
        Darwin) mac_bundled && return 0 ;;
        *)      linux_bundled && return 0 ;;
    esac

    for name in dosbox-x dosbox-X; do
        found=$(command -v "$name" 2>/dev/null) && [ -n "$found" ] && {
            EMU=$found; EMU_LABEL="$found"; return 0
        }
    done

    for bin in \
        /opt/homebrew/bin/dosbox-x \
        /usr/local/bin/dosbox-x \
        /usr/bin/dosbox-x \
        /Applications/dosbox-x.app/Contents/MacOS/dosbox-x \
        /Applications/DOSBox-X.app/Contents/MacOS/dosbox-x
    do
        [ -x "$bin" ] && { EMU=$bin; EMU_LABEL="$bin"; return 0; }
    done

    if command -v flatpak >/dev/null 2>&1 &&
       flatpak info com.dosbox_x.DOSBox-X >/dev/null 2>&1
    then
        EMU="flatpak"; EMU_LABEL="flatpak com.dosbox_x.DOSBox-X"; return 0
    fi

    # Plain DOSBox runs the app but ignores the UTF-8 filename option, so
    # high-byte society folder names such as 01» can come through mangled.
    found=$(command -v dosbox 2>/dev/null) && [ -n "$found" ] && {
        EMU=$found; EMU_LABEL="$found (plain DOSBox - degraded)"; return 0
    }

    return 1
}

# macOS quarantines anything unzipped from a download, and Gatekeeper then
# refuses to launch it. Clear the flag once for the bundled copy.
clear_quarantine() {
    [ "$(uname -s)" = Darwin ] || return 0
    case "$EMU_LABEL" in bundled*) ;; *) return 0 ;; esac
    app=${EMU%/Contents/MacOS/dosbox-x}
    [ -e "$app/.pace-cleared" ] && return 0

    # Recent macOS ships an xattr without -r, so walk the bundle instead of
    # relying on a recursive flag that may not exist.
    if ! xattr -dr com.apple.quarantine "$app" >/dev/null 2>&1; then
        find "$app" -exec xattr -d com.apple.quarantine {} + >/dev/null 2>&1
    fi
    # Re-sign after stripping, or the modified bundle fails its own signature.
    codesign --force --deep --sign - "$app" >/dev/null 2>&1

    : > "$app/.pace-cleared" 2>/dev/null
    return 0
}

# ------------------------------------------------------------------ verify tree

[ -d "$ROOT/$PROGRAM_DIR" ] || die "missing $PROGRAM_DIR/ next to this launcher"
[ -d "$ROOT/$DATA_DIR" ]    || die "missing $DATA_DIR/ next to this launcher"
[ -f "$ROOT/$PROGRAM_DIR/$MAIN_EXE" ] || die "missing $PROGRAM_DIR/$MAIN_EXE"

for f in CONTROL.PRO BLACK.BOX CO.DBF LAB.LBX HELP.AID INFO.AID FOXUSER.DBF; do
    [ -f "$ROOT/$PROGRAM_DIR/$f" ] || note "missing $PROGRAM_DIR/$f"
done

SOCIETIES=""
for d in "$ROOT/$DATA_DIR"/*/; do
    [ -d "$d" ] || continue
    SOCIETIES="$SOCIETIES $(basename -- "$d")"
done
[ -n "$SOCIETIES" ] || note "no society folder in $DATA_DIR/ - use CREATE SOCIETY in the app"

# Optional: a FoxPro 2.5 install for the archived developer tools in attic/.
# The app itself never needs it, so this is silent unless the folder is present
# but unusable.
if [ -d "$ROOT/$TOOLS_DIR" ] && [ ! -f "$ROOT/$TOOLS_DIR/FOXPROX.EXE" ]; then
    note "$TOOLS_DIR/ exists but has no FOXPROX.EXE"
fi

# ----------------------------------------------------------------- build config

CONF=$(mktemp "${TMPDIR:-/tmp}/pace.conf.XXXXXX") || die "cannot create a temp file"
trap 'rm -f "$CONF"' EXIT INT TERM

if [ "$MODE" = shell ]; then
    TAIL=$(printf 'cd \\%s\necho.\necho C: is %s\necho Type:  pace -t     to start the app\necho.\n' \
        "$PROGRAM_DIR" "$ROOT")
else
    TAIL=$(printf 'cd \\%s\ndel *.tmp\npace -t\nexit\n' "$PROGRAM_DIR")
fi

FOXPATH=""
[ -d "$ROOT/$TOOLS_DIR" ] && FOXPATH="set PATH=%PATH%;C:\\$TOOLS_DIR"

cat > "$CONF" <<CONFEOF
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
# The FoxPro 2.5 DOS extender needs XMS; the binary references XMS/VCPI/VDS.
xms = true
ems = true
# Keeps high-byte (CP437) folder names such as 01» readable when the host
# filesystem stores them as UTF-8. DOSBox-X only; plain DOSBox ignores it.
# The UTF-8 mapping needs a defined code page; without this DOSBox-X boots at
# "code page 0" (no translation) and the 0xBB in 01» can round-trip wrong.
# The autoexec runs CHCP 437 to pin it.
file access tries UTF-8 = true

[ipx]
ipx = false

[autoexec]
chcp 437
mount c "$ROOT"
c:
set PATH=%PATH%;C:\\$PROGRAM_DIR
$FOXPATH
$TAIL
CONFEOF

if [ "$MODE" = conf ]; then
    cat "$CONF"
    exit 0
fi

# ----------------------------------------------------------------------- report

printf 'root      : %s\n' "$ROOT"
printf 'societies :%s\n' "${SOCIETIES:- (none)}"

if find_emulator; then
    printf 'emulator  : %s\n' "$EMU_LABEL"
    clear_quarantine
else
    case "$(uname -s)" in
        Darwin) hint="put the DOSBox-X app in emu/mac-arm64/ or run: brew install dosbox-x" ;;
        *)      hint="sudo apt install dosbox-x   (or: flatpak install flathub com.dosbox_x.DOSBox-X)" ;;
    esac
    die "DOSBox-X not found - $hint"
fi

if [ "$MODE" = check ]; then
    printf 'ok        : ready to run\n'
    exit 0
fi

if [ "$EMU" = flatpak ]; then
    exec flatpak run com.dosbox_x.DOSBox-X -conf "$CONF"
fi
exec "$EMU" -conf "$CONF"
