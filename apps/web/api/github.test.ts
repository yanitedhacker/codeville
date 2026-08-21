import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { HttpError, gunzipArchive, parseRepoInput, codeloadUrl } from './github.js'

describe('parseRepoInput', () => {
  it('rejects a path that walks out of the owner/name pair', () => {
    expect(parseRepoInput('../../evil/repo')).toBeNull()
  })

  it('rejects a tree ref that contains .. segments', () => {
    expect(parseRepoInput('owner/name/tree/../../../vercel/next.js')).toBeNull()
  })

  it('accepts owner/name and a simple tree ref', () => {
    expect(parseRepoInput('honojs/hono')).toEqual({ owner: 'honojs', name: 'hono' })
    expect(parseRepoInput('honojs/hono/tree/v4.0.0')).toEqual({
      owner: 'honojs',
      name: 'hono',
      ref: 'v4.0.0',
    })
  })
})

describe('codeloadUrl', () => {
  it('keeps the pathname under /owner/name/tar.gz/', () => {
    const url = codeloadUrl('owner', 'name', 'main')
    expect(url.hostname).toBe('codeload.github.com')
    expect(url.pathname.startsWith('/owner/name/tar.gz/')).toBe(true)
  })

  it('rejects a .. ref that would escape the prefix', () => {
    expect(() => codeloadUrl('owner', 'name', '../../../vercel/next.js')).toThrow(HttpError)
    try {
      codeloadUrl('owner', 'name', '../../../vercel/next.js')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(400)
    }
    const escaped = new URL('https://codeload.github.com/owner/name/tar.gz/../../../vercel/next.js')
    expect(escaped.pathname.startsWith('/owner/name/tar.gz/')).toBe(false)
  })
})

describe('gunzipArchive', () => {
  it('maps an oversize expansion to 413 rather than inflating a zip bomb', () => {
    const gz = gzipSync(Buffer.alloc(20 * 1024 * 1024))
    expect(() => gunzipArchive(gz)).toThrow(HttpError)
    try {
      gunzipArchive(gz)
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(413)
    }
  })
})
