import { describe, expect, it } from 'vitest'
import type { Atlas } from '@codeville/core'
import { SystemMap } from './SystemMap.js'

describe('SystemMap', () => {
  it('renders older atlas payloads that omit coverage', () => {
    const legacyAtlas = {
      repo: { name: 'legacy', generatedAt: '2026-08-22T00:00:00.000Z', note: 'Older atlas JSON.' },
      stats: { nodes: 0, sourceFiles: 0, lines: 0, links: 0, packages: 0 },
      areas: [],
      nodes: [],
      links: [],
    } as unknown as Atlas

    const view = SystemMap({
      atlas: legacyAtlas,
      activeArea: null,
      filter: '',
      onArea: () => {},
      onFilter: () => {},
      onSelect: () => {},
    })

    expect(view.type).toBe('aside')
  })
})
