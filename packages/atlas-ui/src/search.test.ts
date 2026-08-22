import { describe, expect, it } from 'vitest'
import { searchMatchCount, searchNodes } from './search.js'

const make = (id: string, role: string, symbols: string[] = []) => ({
  id,
  label: id.split('/').pop()!,
  path: id,
  kind: 'file' as const,
  area: 'src',
  role,
  contributes: [],
  lines: 1,
  bytes: 1,
  excerpt: [],
  in: 0,
  out: 0,
  x: 0,
  y: 0,
  h: 0.1,
  positions: { city: { x: 0, y: 0 }, dependency: { x: 0, y: 0 } },
  symbols,
})

describe('searchNodes', () => {
  const nodes = [
    make('src/auth/session.ts', 'service logic', ['getSession']),
    make('app/api/login/route.ts', 'api endpoint', ['POST']),
    make('src/components/Login.tsx', 'ui component', ['Login']),
  ]

  it('ranks path and label matches before role and symbol matches', () => {
    expect(searchNodes(nodes, 'login').map((node) => node.path)).toEqual([
      'app/api/login/route.ts',
      'src/components/Login.tsx',
    ])
  })

  it('matches roles and symbols and caps output', () => {
    expect(searchNodes(nodes, 'session', 1)).toHaveLength(1)
    expect(searchNodes(nodes, 'api').map((node) => node.path)).toEqual(['app/api/login/route.ts'])
  })

  it('reports the true match count while capping returned nodes', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      make(`src/file-${String(i).padStart(2, '0')}.ts`, 'service logic'),
    )
    expect(searchMatchCount(many, 'src')).toBe(60)
    expect(searchNodes(many, 'src')).toHaveLength(50)
  })
})
