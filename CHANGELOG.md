# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-22

First stable release.

### Added

- Shift/Cmd-click blocks and click import arcs to read induced edges from graph data, without a model.
- `codeville ask` answers a named function in city context from the terminal.
- A pinned file block copies `--node` and `--fn` for pasting into a terminal.

### Fixed

- Honor repo-relative paths: tsconfig `extends`, refuse relative imports that leave the tree. GitHub extract rejects files that would exceed 12MB.
- Rewrite TypeScript ESM `.js` specifiers to source files. Resolve workspace packages by their manifest name.
- Resolve Python, Go, and Rust imports to source files. Join parenthesised Python imports. `joinBalanced` ignores line comments.
- Treat Rust `tests`/`benches`/`examples`/`bin` as crate roots; `src/tests` no longer hijacks `crate::`. Cargo.toml members are arcs instead of externals. Expand brace imports.
- Ingest still caps `package.json` and `Cargo.toml` at 200 each. The atlas note now reports how many npm packages and cargo crates that cap dropped. `go.mod` is still not capped.

## [0.1.0] - 2026-08-21

First public cut. Point it at a repository; it writes one HTML file you can pan.

- Folder, zip, and GitHub ingest share one analyzer (`buildAtlas`).
- CLI writes a standalone atlas (`file://`, no network).
- Optional explainers add a summary sentence. Derived fields stay derived.
- GitHub route caps archive size, gunzip output, and rejects a `ref` with `..`.
