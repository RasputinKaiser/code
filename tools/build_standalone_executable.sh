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

usage() {
  cat >&2 <<'EOF'
usage: build_standalone_executable.sh --root-dir DIR --out PATH [--build-mode MODE] [--target TARGET]
EOF
}

root_dir=""
out_path=""
build_mode="noumena"
target=""
bun_bin="${BUN_BIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      shift
      [[ $# -gt 0 ]] || { usage; exit 2; }
      root_dir="$1"
      ;;
    --out)
      shift
      [[ $# -gt 0 ]] || { usage; exit 2; }
      out_path="$1"
      ;;
    --build-mode)
      shift
      [[ $# -gt 0 ]] || { usage; exit 2; }
      build_mode="$1"
      ;;
    --target)
      shift
      [[ $# -gt 0 ]] || { usage; exit 2; }
      target="$1"
      ;;
    --bun-bin)
      shift
      [[ $# -gt 0 ]] || { usage; exit 2; }
      bun_bin="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
  shift || true
done

[[ -n "$root_dir" && -n "$out_path" ]] || {
  usage
  exit 2
}

if ! bun_bin="$(resolve_bun_bin "$bun_bin")"; then
  echo "bun executable not found; set BUN_BIN=/absolute/path/to/bun" >&2
  exit 127
fi

mkdir -p "$(dirname "$out_path")"

"$bun_bin" -e '
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");

  async function main() {
    const rootDir = path.resolve(process.argv[1]);
    const outPath = path.resolve(process.argv[2]);
    const buildMode = process.argv[3];
    const target = process.argv[4];
    const buildModule = await import(
      pathToFileURL(path.join(rootDir, "build", "build.mjs")).href
    );
    const options = {
      outfile: outPath,
      buildMode,
    };
    if (target) {
      options.target = target;
    }
    await buildModule.buildStandaloneExecutable(options);
  }

  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
' "$root_dir" "$out_path" "$build_mode" "$target"
