#!/usr/bin/env bash
set -euo pipefail

resolve_bun_bin() {
  local explicit_bun_bin="${1:-${BUN_BIN:-}}"
  local candidate=""

  if [[ -n "$explicit_bun_bin" && -x "$explicit_bun_bin" ]]; then
    printf '%s\n' "$explicit_bun_bin"
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  if command -v getent >/dev/null 2>&1; then
    candidate="$(getent passwd "$(id -u)" | cut -d: -f6 || true)"
    if [[ -n "$candidate" && -x "$candidate/.bun/bin/bun" ]]; then
      printf '%s\n' "$candidate/.bun/bin/bun"
      return 0
    fi
  fi

  candidate="${HOME:-}/.bun/bin/bun"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

suite="${1:-}"
if [[ -z "$suite" ]]; then
  echo "usage: run_bun_suite.sh <package-test-script> [args...]" >&2
  exit 64
fi
shift

case "$suite" in
  test|test:*)
    ;;
  *)
    echo "expected a package test script name, got: $suite" >&2
    exit 64
    ;;
esac

repo_root="${BUCK_PROJECT_ROOT:-$PWD}"
if [[ ! -f "$repo_root/code/package.json" ]]; then
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

code_dir="$repo_root/code"
if [[ ! -f "$code_dir/package.json" ]]; then
  echo "expected code/package.json under repo root: $repo_root" >&2
  exit 1
fi

bun_bin="$(resolve_bun_bin "${BUN_BIN:-}" || true)"
if [[ -z "$bun_bin" ]]; then
  echo "bun executable not found via BUN_BIN, PATH, login home, or HOME" >&2
  exit 127
fi

cd "$code_dir"
exec "$bun_bin" run "$suite" "$@"
