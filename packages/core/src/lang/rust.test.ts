import { describe, expect, it } from 'vitest'
import { buildAtlas, createResolver, extractImports, scan } from '@codeville/core'
import type { VirtualFile } from '@codeville/core'

const specs = (text: string): string[] => extractImports('src/lib.rs', text).map((i) => i.spec)

const resolveFrom = (files: VirtualFile[], spec: string, fromFile: string): string | null => {
  const records = scan(files)
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
  return createResolver(records).resolve(spec, dir, fromFile)
}

describe('rust imports', () => {
  it('keeps the whole path rather than truncating at ::', () => {
    expect(specs('use crate::graph::Node;\nuse std::collections::HashMap;\n')).toEqual([
      'crate::graph::Node',
      'std::collections::HashMap',
    ])
  })

  it('expands brace imports, including nested and multi-line', () => {
    expect(specs('use crate::{graph, layout};\n')).toEqual(['crate::graph', 'crate::layout'])
    expect(specs('use crate::{config::ConfiguredHIR, error::Error};\n')).toEqual([
      'crate::config::ConfiguredHIR',
      'crate::error::Error',
    ])
    expect(specs('use crate::{a::{b, c}, d};\n')).toEqual(['crate::a::b', 'crate::a::c', 'crate::d'])
    expect(specs('use crate::{self, x};\n')).toEqual(['crate', 'crate::x'])
    expect(specs('use crate::{Foo as Bar, *};\n')).toEqual(['crate::Foo'])
    expect(specs('pub use crate::{\n    graph,\n    layout,\n};\n')).toEqual(['crate::graph', 'crate::layout'])
    expect(specs('use std::io::Read; // leftover {\n')).toEqual(['std::io::Read'])
  })

  it('emits mod declarations as self::name', () => {
    expect(specs('mod graph;\npub mod layout;\n')).toEqual(['self::graph', 'self::layout'])
  })

  it('skips prose that only happens to start with use', () => {
    expect(specs('  use and/or performance).\nuse std::io;\n')).toEqual(['std::io'])
  })
})

describe('rust crate resolution', () => {
  it('resolves the four fixture edges and only std as an external', () => {
    const atlas = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod graph;\npub mod layout;\nuse crate::graph::Node;\n' },
        { path: 'src/graph.rs', text: 'use crate::types::Node;\nuse std::collections::HashMap;\n' },
        { path: 'src/types.rs', text: 'pub struct Node;\n' },
        { path: 'src/layout.rs', text: 'use super::graph;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('src/lib.rs -> src/graph.rs')).toBe(true)
    expect(got.has('src/lib.rs -> src/layout.rs')).toBe(true)
    expect(got.has('src/graph.rs -> src/types.rs')).toBe(true)
    expect(got.has('src/layout.rs -> src/graph.rs')).toBe(true)
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label).sort()).toEqual(['std'])
    expect(atlas.nodes.some((n) => n.kind === 'external' && n.label === 'crate')).toBe(false)
  })

  it('searches beside a mod.rs and under a file-stem directory', () => {
    const beside = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod util;\n' },
        { path: 'src/util/mod.rs', text: 'mod config;\n' },
        { path: 'src/util/config.rs', text: 'pub struct C;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z', rollupDepth: 8 },
    )
    const under = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'mod util;\n' },
        { path: 'src/util.rs', text: 'mod config;\n' },
        { path: 'src/util/config.rs', text: 'pub struct C;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z', rollupDepth: 8 },
    )
    expect(beside.links.some((l) => l.from === 'src/util/mod.rs' && l.to === 'src/util/config.rs')).toBe(true)
    expect(under.links.some((l) => l.from === 'src/util.rs' && l.to === 'src/util/config.rs')).toBe(true)
  })

  it('treats integration-test, bench, and bin files as crate roots', () => {
    const tests = [
      { path: 'tests/tests.rs', text: 'mod util;\n' },
      { path: 'tests/util.rs', text: 'pub fn f() {}\n' },
    ]
    const benches = [
      { path: 'benches/bench.rs', text: 'mod helper;\n' },
      { path: 'benches/helper.rs', text: 'pub fn f() {}\n' },
    ]
    const bin = [
      { path: 'src/bin/tool.rs', text: 'mod opts;\n' },
      { path: 'src/bin/opts.rs', text: 'pub struct Opts;\n' },
    ]
    expect(resolveFrom(tests, extractImports(tests[0]!.path, tests[0]!.text)[0]!.spec, tests[0]!.path)).toBe(
      'tests/util.rs',
    )
    expect(resolveFrom(benches, extractImports(benches[0]!.path, benches[0]!.text)[0]!.spec, benches[0]!.path)).toBe(
      'benches/helper.rs',
    )
    expect(resolveFrom(bin, extractImports(bin[0]!.path, bin[0]!.text)[0]!.spec, bin[0]!.path)).toBe('src/bin/opts.rs')
  })

  it('resolves crate:: from a tests/ file against that directory', () => {
    expect(
      resolveFrom(
        [
          { path: 'tests/regression.rs', text: 'use crate::hay::SHERLOCK;\n' },
          { path: 'tests/hay.rs', text: 'pub const SHERLOCK: &str = "";\n' },
        ],
        'crate::hay::SHERLOCK',
        'tests/regression.rs',
      ),
    ).toBe('tests/hay.rs')
  })

  it('does not treat src/tests as a cargo integration-test crate', () => {
    expect(
      resolveFrom(
        [
          { path: 'src/lib.rs', text: 'mod tests;\n' },
          { path: 'src/hay.rs', text: 'pub const S: &str = "";\n' },
          { path: 'src/tests/mod.rs', text: '' },
          { path: 'src/tests/regress.rs', text: 'use crate::hay::S;\n' },
          { path: 'src/tests/hay.rs', text: 'pub const S: &str = "wrong";\n' },
        ],
        'crate::hay::S',
        'src/tests/regress.rs',
      ),
    ).toBe('src/hay.rs')
  })

  it('resolves a Cargo workspace member and does not draw it as an external', () => {
    const atlas = buildAtlas(
      [
        {
          path: 'crates/cli/Cargo.toml',
          text: '[package]\nname = "cli"\n\n[dependencies]\ngrep-matcher = { path = "../matcher" }\n',
        },
        { path: 'crates/cli/src/lib.rs', text: 'use grep_matcher::Matcher;\n' },
        { path: 'crates/matcher/Cargo.toml', text: '[package]\nname = "grep-matcher"\n' },
        { path: 'crates/matcher/src/lib.rs', text: 'pub trait Matcher {}\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z', rollupDepth: 8 },
    )
    expect(atlas.links.some((l) => l.from === 'crates/cli/src/lib.rs' && l.to === 'crates/matcher/src/lib.rs')).toBe(true)
    expect(atlas.nodes.some((n) => n.kind === 'external')).toBe(false)
  })

  it('keeps a declared cargo dependency as an external', () => {
    const atlas = buildAtlas(
      [
        { path: 'Cargo.toml', text: '[package]\nname = "app"\n\n[dependencies]\nserde = "1"\n' },
        { path: 'src/lib.rs', text: 'use serde::Deserialize;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label)).toEqual(['serde'])
  })

  it('drops a bare identifier that is not a declared dependency', () => {
    const atlas = buildAtlas(
      [
        { path: 'Cargo.toml', text: '[package]\nname = "app"\n' },
        { path: 'src/lib.rs', text: 'use A;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    expect(atlas.nodes.some((n) => n.kind === 'external')).toBe(false)
  })

  it('resolves a local module re-export rather than inventing an external crate', () => {
    const atlas = buildAtlas(
      [
        { path: 'src/lib.rs', text: 'pub use index::{Index, IndexBuilder};\nmod index;\n' },
        { path: 'src/index.rs', text: 'pub struct Index;\npub struct IndexBuilder;\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    expect(atlas.links.some((l) => l.from === 'src/lib.rs' && l.to === 'src/index.rs')).toBe(true)
    expect(atlas.nodes.some((n) => n.kind === 'external' && n.label === 'index')).toBe(false)
  })
})
