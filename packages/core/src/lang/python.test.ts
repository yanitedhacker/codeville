import { describe, expect, it } from 'vitest'
import { buildAtlas, extractImports } from '@codeville/core'

const specs = (text: string): string[] => extractImports('app.py', text).map((i) => i.spec)

describe('python imports', () => {
  it('emits the base and each imported name for a from-import', () => {
    expect(specs('from a.b import c as d\n')).toEqual(['a.b', 'a.b.c'])
  })

  it('splits a multi-name import line', () => {
    expect(specs('import os, sys\n')).toEqual(['os', 'sys'])
  })

  it('skips star imports without throwing', () => {
    expect(() => specs('from x import *\n')).not.toThrow()
    expect(specs('from x import *\n')).toEqual(['x'])
  })

  it('skips a commented-out import', () => {
    expect(specs('# import os\nimport sys\n')).toEqual(['sys'])
  })
})

describe('python package resolution', () => {
  it('resolves the four internal edges and names stdlib/third-party externals', () => {
    const atlas = buildAtlas(
      [
        { path: 'app/__init__.py', text: '' },
        { path: 'app/main.py', text: 'from .models import User\nfrom app.db import get_conn\nimport os, sys\nfrom . import helpers\n' },
        { path: 'app/models.py', text: 'from .db import Base\n' },
        { path: 'app/db.py', text: 'import sqlalchemy\n' },
        { path: 'app/helpers.py', text: '' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('app/main.py -> app/models.py')).toBe(true)
    expect(got.has('app/main.py -> app/db.py')).toBe(true)
    expect(got.has('app/main.py -> app/helpers.py')).toBe(true)
    expect(got.has('app/models.py -> app/db.py')).toBe(true)
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label).sort()).toEqual([
      'os',
      'sqlalchemy',
      'sys',
    ])
  })
})
