# markdown-renderer-napi

This crate provides a Rust N-API module that eventually replaces the large TS `Ansi` render path for fenced code blocks.

## Contract

- Exposes `render_fenced_code(code: string, options?: object) -> string[] | null`.
- `options` may include `language` and `terminalWidth` keys; they are currently ignored.
- Returns `null` until a full native renderer is implemented, which keeps the existing JS fallback path active.

## Build

```bash
cd code/native/markdown-renderer-napi
npm run build
```

The build compiles the Rust cdylib and copies `libmarkdown_renderer_napi.so` into `dist/markdown-renderer-napi.node` for consumption by `renderNativeFencedCode`.

## Integration Notes

- `code/src/utils/markdown/nativeFencedCodeRenderer.ts` will attempt to require this package via `markdown-renderer-napi`.
- When the native module returns `null`, the JS `Markdown` path falls back to the current `<Ansi>` rendering (including `dimColor` support).
- This scaffold keeps behavior stable and only activates when the native renderer explicitly returns strings.
