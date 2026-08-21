import { describe, expect, it } from 'vitest'
import { buildAtlas, extractImports } from '@codeville/core'

describe('go imports', () => {
  it('extracts a block import', () => {
    const text = 'package main\n\nimport (\n\t"fmt"\n\t"example.com/svc/internal/store"\n)\n'
    expect(extractImports('main.go', text).map((i) => i.spec)).toEqual(['fmt', 'example.com/svc/internal/store'])
  })
})

describe('go module resolution', () => {
  it('resolves both fixture edges and leaves fmt as the only external', () => {
    const atlas = buildAtlas(
      [
        { path: 'go.mod', text: 'module example.com/svc\n\ngo 1.22\n' },
        { path: 'main.go', text: 'package main\n\nimport (\n\t"fmt"\n\t"example.com/svc/internal/store"\n)\n' },
        { path: 'internal/store/store.go', text: 'package store\n\nimport "example.com/svc/internal/model"\n' },
        { path: 'internal/model/model.go', text: 'package model\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('main.go -> internal/store/store.go')).toBe(true)
    expect(got.has('internal/store/store.go -> internal/model/model.go')).toBe(true)
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label).sort()).toEqual(['fmt'])
  })

  it('lets a nested go.mod take precedence for paths under it', () => {
    const atlas = buildAtlas(
      [
        { path: 'go.mod', text: 'module example.com/svc\n' },
        { path: 'vendor-local/go.mod', text: 'module example.com/svc/api\n' },
        { path: 'main.go', text: 'package main\nimport "example.com/svc/api"\n' },
        { path: 'vendor-local/server.go', text: 'package api\n' },
        { path: 'api/wrong.go', text: 'package api\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('main.go -> vendor-local/server.go')).toBe(true)
    expect(got.has('main.go -> api/wrong.go')).toBe(false)
  })

  it('resolves a directory that only contains _test.go files', () => {
    const atlas = buildAtlas(
      [
        { path: 'go.mod', text: 'module example.com/svc\n' },
        { path: 'main.go', text: 'package main\nimport "example.com/svc/onlytest"\n' },
        { path: 'onlytest/foo_test.go', text: 'package onlytest\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    const got = new Set(atlas.links.filter((l) => l.type === 'import').map((l) => l.from + ' -> ' + l.to))
    expect(got.has('main.go -> onlytest/foo_test.go')).toBe(true)
  })

  it('names a third-party module rather than inventing a file', () => {
    const atlas = buildAtlas(
      [
        { path: 'go.mod', text: 'module example.com/svc\n' },
        { path: 'main.go', text: 'package main\nimport "github.com/gin-gonic/gin"\n' },
      ],
      { maxNodes: 500, now: () => '2026-08-22T00:00:00.000Z' },
    )
    expect(atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.label)).toEqual(['github.com/gin-gonic/gin'])
  })
})
