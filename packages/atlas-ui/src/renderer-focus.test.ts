import { describe, expect, it } from 'vitest'
import type { AtlasLink } from '@codeville/core'
import { linkIsFocused, nodeIsFocused, focusChanged, type ViewState } from './renderer.js'

const link = (from: string, to: string, type: AtlasLink['type'] = 'import'): AtlasLink => ({
  from,
  to,
  type,
  samples: [],
})

const focus = (nodeIds: string[], linkKeys: string[]): ViewState['focus'] => ({ nodeIds, linkKeys })

describe('renderer focus projection helpers', () => {
  it('treats null focus as focused for every node and link', () => {
    expect(nodeIsFocused('missing', null)).toBe(true)
    expect(linkIsFocused(link('missing', 'also-missing'), null)).toBe(true)
  })

  it('matches only listed node IDs and canonical link keys', () => {
    const active = focus(['a'], ['import\0a\0b'])
    expect(nodeIsFocused('a', active)).toBe(true)
    expect(nodeIsFocused('b', active)).toBe(false)
    expect(linkIsFocused(link('a', 'b'), active)).toBe(true)
    expect(linkIsFocused(link('b', 'a'), active)).toBe(false)
    expect(nodeIsFocused('missing', active)).toBe(false)
    expect(linkIsFocused(link('missing', 'also-missing'), active)).toBe(false)
  })

  it('ignores ordering when detecting equivalent focus', () => {
    expect(focusChanged(focus(['a', 'b'], ['import\0a\0b', 'external\0b\0c']), focus(['b', 'a'], ['external\0b\0c', 'import\0a\0b']))).toBe(false)
    expect(focusChanged(focus(['a'], ['import\0a\0b']), focus(['a', 'b'], ['import\0a\0b']))).toBe(true)
    expect(focusChanged(null, null)).toBe(false)
    expect(focusChanged(null, focus([], []))).toBe(true)
  })
})
