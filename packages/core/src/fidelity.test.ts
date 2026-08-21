import { describe, expect, it } from 'vitest'
import { buildAtlas, extId, type VirtualFile } from '@codeville/core'

const NOW = () => '2026-08-22T00:00:00.000Z'

/** Every resolver failure mode Task 1–2 fixed, in one in-memory workspace. */
const FIXTURE: VirtualFile[] = [
  { path: 'packages/app/package.json', text: '{"name":"@acme/app","main":"./src/main.ts"}' },
  { path: 'packages/lib/package.json', text: '{"name":"@acme/lib","main":"./src/index.ts"}' },
  {
    path: 'packages/app/src/main.ts',
    text: [
      'import { sib } from "./sibling.js"',
      'import { Comp } from "./Component.js"',
      'import { feat } from "./feature/index.js"',
      'import { util } from "@acme/lib"',
      'import React from "react"',
      'export const main = 1',
      '',
    ].join('\n'),
  },
  { path: 'packages/app/src/sibling.ts', text: 'export const sib = 1\n' },
  { path: 'packages/app/src/Component.tsx', text: 'export const Comp = 1\n' },
  { path: 'packages/app/src/feature/index.ts', text: 'export const feat = 1\n' },
  { path: 'packages/lib/src/index.ts', text: 'export const util = 1\n' },
]

describe('resolution fidelity', () => {
  const atlas = buildAtlas(FIXTURE, { now: NOW, rollupDepth: 8 })
  const imports = atlas.links.filter((l) => l.type === 'import')

  it('draws an import arc for each internal specifier, including TypeScript ESM rewrites', () => {
    expect(imports).toContainEqual(
      expect.objectContaining({ from: 'packages/app/src/main.ts', to: 'packages/app/src/sibling.ts', type: 'import' }),
    )
    expect(imports).toContainEqual(
      expect.objectContaining({ from: 'packages/app/src/main.ts', to: 'packages/app/src/Component.tsx', type: 'import' }),
    )
    expect(imports).toContainEqual(
      expect.objectContaining({
        from: 'packages/app/src/main.ts',
        to: 'packages/app/src/feature/index.ts',
        type: 'import',
      }),
    )
  })

  it('draws a cross-package workspace import as a file-to-file edge', () => {
    expect(imports).toContainEqual(
      expect.objectContaining({ from: 'packages/app/src/main.ts', to: 'packages/lib/src/index.ts', type: 'import' }),
    )
  })

  it('still parks a genuine npm import in the externals ring', () => {
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label)).toEqual(['react'])
    expect(atlas.links).toContainEqual(
      expect.objectContaining({ from: 'packages/app/src/main.ts', to: extId('react'), type: 'external' }),
    )
  })

  it('counts those five edges and no extras', () => {
    expect(imports).toHaveLength(4)
    expect(atlas.stats.links).toBe(5)
  })

  it('is deterministic: same fixture, byte-identical atlas', () => {
    const a = JSON.stringify(buildAtlas(FIXTURE, { now: NOW, rollupDepth: 8 }))
    const b = JSON.stringify(buildAtlas(FIXTURE, { now: NOW, rollupDepth: 8 }))
    expect(a).toBe(b)
  })
})
