import { describe, expect, it } from 'vitest'
import { canvasCommand, startsFlowing } from './keyboard.js'

describe('canvas keyboard controls', () => {
  it('maps navigation keys to explicit commands', () => {
    expect(canvasCommand('ArrowLeft')).toEqual({ kind: 'pan', x: 48, y: 0 })
    expect(canvasCommand('ArrowUp')).toEqual({ kind: 'pan', x: 0, y: 48 })
    expect(canvasCommand('+')).toEqual({ kind: 'zoom', factor: 1.2 })
    expect(canvasCommand('-')).toEqual({ kind: 'zoom', factor: 1 / 1.2 })
    expect(canvasCommand('0')).toEqual({ kind: 'reset' })
    expect(canvasCommand('x')).toBeNull()
  })

  it('pauses flow for reduced-motion users', () => {
    expect(startsFlowing(true)).toBe(false)
    expect(startsFlowing(false)).toBe(true)
  })
})
