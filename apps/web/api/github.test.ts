import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { HttpError, extract, gunzipArchive, parseRepoInput, codeloadUrl } from './github.js'

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

describe('extract', () => {
  it('does not accept a last file that would push the batch over 12MB', () => {
    // 25 × 500_000 = 12_500_000 < 12MiB; one more file of 500_000 overshoots.
    const size = 500_000
    const fit = 25
    const entries = Array.from({ length: fit + 1 }, (_, i) => ({
      name: `owner-name/${i}.ts`,
      body: Buffer.alloc(size, 0x61),
    }))
    const result = extract(gzipSync(packUstar(entries)), 'owner/name', 'main')
    expect(result.files).toHaveLength(fit)
    expect(result.truncated).toBe(true)
    expect(result.files.reduce((n, f) => n + f.text.length, 0)).toBeLessThanOrEqual(12 * 1024 * 1024)
  })
})

function packUstar(entries: { name: string; body: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const header = Buffer.alloc(512)
    Buffer.from(entry.name).copy(header, 0, 0, Math.min(entry.name.length, 99))
    header.write(`${entry.body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
    header.write('0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    header.fill(0x20, 148, 156)
    let sum = 0
    for (let i = 0; i < 512; i++) sum += header[i] ?? 0
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
    chunks.push(header, entry.body)
    const pad = (512 - (entry.body.length % 512)) % 512
    if (pad) chunks.push(Buffer.alloc(pad))
  }
  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}
