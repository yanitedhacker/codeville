# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

- Ingest still caps `package.json` and `Cargo.toml` at 200 each, but the atlas note now reports how many cargo crates that cap dropped, not only npm workspace packages. `go.mod` is still not capped.

## [0.1.0] — 2026-08-21

First public cut. Point it at a repository; it writes one HTML file you can pan.

- Folder, zip, and GitHub ingest share one analyzer (`buildAtlas`).
- CLI writes a standalone atlas (`file://`, no network).
- Optional explainers add a summary sentence. Derived fields stay derived.
- GitHub route caps archive size, gunzip output, and rejects a `ref` with `..`.
