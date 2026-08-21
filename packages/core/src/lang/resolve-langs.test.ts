import { describe, expect, it } from 'vitest'
import { buildAtlas, type VirtualFile } from '@codeville/core'

type Case = { name: string; files: VirtualFile[]; expect: [string, string][]; externals: string[] }

const cases: Case[] = [
  {
    name: 'Python package',
    files: [
      { path: 'app/__init__.py', text: '' },
      { path: 'app/main.py', text: 'from .models import User\nfrom app.db import get_conn\nimport os, sys\nfrom . import helpers\n' },
      { path: 'app/models.py', text: 'from .db import Base\n' },
      { path: 'app/db.py', text: 'import sqlalchemy\n' },
      { path: 'app/helpers.py', text: '' },
    ],
    expect: [
      ['app/main.py', 'app/models.py'],
      ['app/main.py', 'app/db.py'],
      ['app/main.py', 'app/helpers.py'],
      ['app/models.py', 'app/db.py'],
    ],
    externals: ['os', 'sqlalchemy', 'sys'],
  },
  {
    name: 'Go module',
    files: [
      { path: 'go.mod', text: 'module example.com/svc\n\ngo 1.22\n' },
      { path: 'main.go', text: 'package main\n\nimport (\n\t"fmt"\n\t"example.com/svc/internal/store"\n)\n' },
      { path: 'internal/store/store.go', text: 'package store\n\nimport "example.com/svc/internal/model"\n' },
      { path: 'internal/model/model.go', text: 'package model\n' },
    ],
    expect: [
      ['main.go', 'internal/store/store.go'],
      ['internal/store/store.go', 'internal/model/model.go'],
    ],
    externals: ['fmt'],
  },
  {
    name: 'Rust crate',
    files: [
      { path: 'src/lib.rs', text: 'mod graph;\npub mod layout;\nuse crate::graph::Node;\n' },
      { path: 'src/graph.rs', text: 'use crate::types::Node;\nuse std::collections::HashMap;\n' },
      { path: 'src/types.rs', text: 'pub struct Node;\n' },
      { path: 'src/layout.rs', text: 'use super::graph;\n' },
    ],
    expect: [
      ['src/lib.rs', 'src/graph.rs'],
      ['src/lib.rs', 'src/layout.rs'],
      ['src/graph.rs', 'src/types.rs'],
      ['src/layout.rs', 'src/graph.rs'],
    ],
    externals: ['std'],
  },
]

describe('language resolution fixtures', () => {
  for (const c of cases) {
    it(`resolves ${c.name} internals and names the right externals`, () => {
      const atlas = buildAtlas(c.files, { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' })
      const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
      for (const [a, b] of c.expect) expect(got.has(a + ' -> ' + b), `${a} -> ${b}`).toBe(true)
      expect(
        atlas.nodes
          .filter((n) => n.kind === 'external')
          .map((n) => n.label)
          .sort(),
      ).toEqual(c.externals)
    })
  }
})
