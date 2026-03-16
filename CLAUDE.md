# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is manip

A CLI tool for manipulating [Marp](https://marp.app/) markdown slides by slide number. Commands: `list`, `get`, `edit`, `append`, `delete`, `move`, `swap`, `extract`, `count`, `images` (with `--orphan` / `--missing`). Supports `--json` output and `--dry-run` for destructive operations.

## Commands

```bash
npm run build          # TypeScript compile (tsc) → dist/
npm run clean          # Remove dist/
npm run dev            # Watch mode (tsc --watch)
npm test               # Build + run all tests (node:test runner)
node dist/src/index.js # Run CLI locally after build
```

To run a single test file:
```bash
tsc && node --test dist/test/parser.test.js
```

## Architecture

- **`src/parser.ts`** — Core Marp document model. Parses markdown into `MarpDocument { frontmatter, slides[] }` by splitting on `\n---\n` separators. `parse()` / `serialize()` must round-trip losslessly. Normalizes CRLF to LF on read. Exports `ManipError` for structured error handling and `parseSlideRange()` for range syntax (`3`, `1-5`, `1,3,5`).
- **`src/images.ts`** — Image reference utilities. Extracts image paths from markdown/HTML `src` attributes, finds orphan images (on disk but unreferenced) and missing images (referenced but not on disk). Recursively scans subdirectories for `.md` files.
- **`src/index.ts`** — CLI entry point using Commander. Wires subcommands to parser/images functions. Slide numbers are 1-based in the CLI. All errors go through `ManipError` → `handleError()` for consistent error output.
- **`test/`** — Uses Node.js built-in test runner (`node:test`) and `assert/strict`. `parser.test.ts` tests parse/serialize/range parsing, `cli.test.ts` tests the CLI end-to-end via `execFileSync`, `images.test.ts` tests image utilities.

## Key Conventions

- TypeScript compiled to `dist/` — tests import from compiled JS (`../src/parser.js`)
- No external test framework; uses `node:test` + `node:assert/strict`
- Slide separator regex allows trailing whitespace: `/\n---[^\S\n]*\n/`
- `MarpDocument.frontmatter` stores the full `---\n...\n---` block (or empty string if none)
- Errors use `ManipError` class (not `process.exit()` directly) for testability
- CRLF input is normalized to LF during parsing
