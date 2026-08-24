import { describe, expect, it, vi } from 'vitest'
import type { AtlasFocus } from './focus.js'
import { syncRendererProjection } from './Atlas.js'
import type { AtlasRenderer } from './renderer.js'

function renderer() {
  return {
    setView: vi.fn(),
    focusNodes: vi.fn(),
  } as unknown as Pick<AtlasRenderer, 'setView' | 'focusNodes'>
}

describe('Atlas renderer focus synchronization', () => {
  it('replays an unchanged surviving manual focus onto a replacement renderer', () => {
    const focus: AtlasFocus = {
      id: 'cone:dependencies:root',
      title: 'Dependencies from root.ts',
      note: '2 nodes in the visible slice.',
      nodeIds: ['root', 'child'],
      linkKeys: ['import\0root\0child'],
    }

    const first = renderer()
    syncRendererProjection(first, focus)

    const replacement = renderer()
    syncRendererProjection(replacement, focus)

    expect(replacement.setView).toHaveBeenCalledWith({
      focus: { nodeIds: ['child', 'root'], linkKeys: ['import\0root\0child'] },
    })
    expect(replacement.focusNodes).toHaveBeenCalledWith(['child', 'root'])
  })
})
