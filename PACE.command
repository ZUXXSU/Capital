#!/bin/sh
# Double-click fallback for macOS. Finder opens this in Terminal, so it runs
# with Terminal's own disk permissions - use it if PACE.app is denied access
# ("Operation not permitted") and you do not want to grant the app itself
# access in System Settings > Privacy & Security.
exec "$(cd -- "$(dirname -- "$0")" && pwd)/PACE.sh" "$@"
