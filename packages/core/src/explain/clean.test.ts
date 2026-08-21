import { describe, expect, it } from 'vitest'
import { clean } from './adapters.js'

describe('clean', () => {
  it('flattens whitespace and strips a code fence', () => {
    expect(clean('```\nIt does   a\nthing.\n```')).toBe('It does a thing.')
  })

  it('leaves a short summary alone', () => {
    expect(clean('It gates every request.')).toBe('It gates every request.')
  })

  it('cuts at a sentence boundary rather than mid-word', () => {
    const first = `${'a'.repeat(400)}. `
    const out = clean(first + 'b'.repeat(600))
    expect(out).toBe(first.trim())
    expect(out.endsWith('.')).toBe(true)
  })

  it('falls back to a word boundary with an ellipsis when there is no sentence break', () => {
    const input = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')
    const out = clean(input)
    expect(out.length).toBeLessThanOrEqual(701)
    expect(out.endsWith('…')).toBe(true)
    // The kept text must be a whole-word prefix: the input continues with a space.
    const kept = out.slice(0, -1)
    expect(input.startsWith(kept)).toBe(true)
    expect(input.charAt(kept.length)).toBe(' ')
  })
})
