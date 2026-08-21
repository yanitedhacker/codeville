import { describe, expect, it } from 'vitest'
import { outline, sourceDigest } from './outline.js'

describe('outline', () => {
  it('reads TypeScript declarations', () => {
    const text = [
      'import { x } from "y"',
      'export async function getSession() {}',
      'export const pool = new Pool()',
      'export class LogInterceptor {}',
      'export interface Session {}',
      'function privateHelper() {}',
    ].join('\n')
    expect(outline(text)).toEqual(['getSession', 'pool', 'LogInterceptor', 'Session'])
  })

  it('takes the exported name from a re-export list', () => {
    expect(outline('export { query, withTransaction as tx }')).toEqual(['query', 'tx'])
    expect(outline('export { default }')).toEqual([])
  })

  it('reads python, go and rust', () => {
    expect(outline('def handle():\n  pass\nclass Thing:\n  pass')).toEqual(['handle', 'Thing'])
    expect(outline('func Serve() {}\nfunc unexported() {}')).toEqual(['Serve'])
    expect(outline('pub fn run() {}\npub struct Config {}')).toEqual(['run', 'Config'])
  })

  it('reads sql object names', () => {
    expect(outline('create table if not exists orders (id int);')).toEqual(['orders'])
  })

  it('dedupes and honours the cap', () => {
    const text = Array.from({ length: 40 }, (_, i) => `export const v${i} = ${i}`).join('\n')
    expect(outline(text, 5)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4'])
    expect(outline('export const a = 1\nexport const a = 2')).toEqual(['a'])
  })
})

describe('sourceDigest', () => {
  it('passes small files through untouched', () => {
    const text = 'export const a = 1\n'
    expect(sourceDigest(text, 100)).toBe(text)
  })

  it('truncates a large file but keeps the names it declares further down', () => {
    const filler = '// '.repeat(60) + '\n'
    const text = filler.repeat(20) + 'export function deepDown() {}\n'
    const digest = sourceDigest(text, 200)
    expect(digest.length).toBeLessThan(text.length)
    expect(digest).toContain('truncated')
    expect(digest).toContain('deepDown')
  })
})
