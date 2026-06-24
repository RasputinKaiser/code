#!/usr/bin/env bash
set -euo pipefail

repo_root="${NCODE_APP_SERVER_BYOK_REPO_ROOT:-${BUCK_PROJECT_ROOT:-$PWD}}"
if [[ "${1:-}" == "--repo-root" ]]; then
  repo_root="$2"
  shift 2
fi
if [[ ! -f "$repo_root/code/package.json" ]]; then
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

code_dir="$repo_root/code"
if [[ ! -f "$code_dir/package.json" ]]; then
  echo "expected code/package.json under repo root: $repo_root" >&2
  exit 1
fi

resolve_bun_bin() {
  if [[ -n "${BUN_BIN:-}" && -x "${BUN_BIN}" ]]; then
    printf '%s\n' "$BUN_BIN"
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi
  local real_home
  real_home="$(getent passwd "$(id -u)" | cut -d: -f6 || true)"
  if [[ -n "$real_home" && -x "$real_home/.bun/bin/bun" ]]; then
    printf '%s\n' "$real_home/.bun/bin/bun"
    return 0
  fi
  if [[ -x "${HOME:-}/.bun/bin/bun" ]]; then
    printf '%s\n' "$HOME/.bun/bin/bun"
    return 0
  fi
  return 1
}

bun_bin="$(resolve_bun_bin || true)"
if [[ -z "$bun_bin" ]]; then
  echo "bun executable not found via BUN_BIN, PATH, real home, or HOME" >&2
  exit 127
fi

cd "$code_dir"
if [[ "$#" -eq 0 ]]; then
  set -- \
    src/remote/appServer/client.test.ts \
    src/remote/appServer/remoteAppServerSession.test.ts \
    src/remote/appServer/remoteAppServerBYOKSession.test.ts \
    src/remote/runtimeMatrix.test.ts
fi
exec "$bun_bin" test "$@"
