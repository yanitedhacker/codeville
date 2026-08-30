import { describe, expect, it } from 'vitest'
import {
  buildAtlas,
  importOtlpTraceJson,
  type RuntimeTraceBundle,
} from '@codeville/core'
import { renderStandaloneHtml } from './standalone-html.js'

const CSP = "default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

const atlas = buildAtlas(
  [{ path: 'src/index.ts', text: 'export const value = 1\n' }],
  { repoName: 'standalone fixture' },
)

describe('renderStandaloneHtml', () => {
  it('embeds normalized runtime data before the bundle with exact CSP and no script breakout', () => {
    const hostile = '</script><script>globalThis.pwned=1</script>'
    const runtime = runtimeWithSpanName(hostile)
    const html = renderStandaloneHtml(atlas, 'globalThis.rendered=true', '.x{}', runtime)

    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
    expect(html).toContain('window.__CODEVILLE_RUNTIME__=')
    expect(html.indexOf('window.__CODEVILLE_RUNTIME__=')).toBeLessThan(html.indexOf('globalThis.rendered=true'))
    expect(html).toContain('https://opentelemetry.io/schemas/1.26.0')
    expect(html).toContain('\\u003c/script\\u003e\\u003cscript\\u003eglobalThis.pwned=1')
    expect(html).not.toContain(hostile)
    expect(networkCapableReferences(html)).toEqual([])
  })

  it('keeps the legacy three-argument export contract', () => {
    const html = renderStandaloneHtml(atlas, 'globalThis.rendered=true', '.x{}')

    expect(html).not.toContain('__CODEVILLE_RUNTIME__')
    expect(html).toContain('window.__CODEVILLE_ATLAS__=')
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
  })

  it('treats an accepted empty runtime bundle as present', () => {
    const runtime = importOtlpTraceJson('{"resourceSpans":[]}')
    const html = renderStandaloneHtml(atlas, 'globalThis.rendered=true', '.x{}', runtime)

    expect(html).toContain('window.__CODEVILLE_RUNTIME__=')
    expect(embeddedRuntime(html)).toEqual(runtime)
  })
})

function runtimeWithSpanName(name: string): RuntimeTraceBundle {
  return importOtlpTraceJson(JSON.stringify({
    resourceSpans: [{
      schemaUrl: 'https://opentelemetry.io/schemas/1.26.0',
      resource: { attributes: [], droppedAttributesCount: 0 },
      scopeSpans: [{
        scope: { attributes: [], droppedAttributesCount: 0 },
        spans: [{
          traceId: '11111111111111111111111111111111',
          spanId: '0000000000000001',
          name,
          kind: 1,
          startTimeUnixNano: '1',
          endTimeUnixNano: '2',
          attributes: [],
          droppedAttributesCount: 0,
          events: [],
          droppedEventsCount: 0,
          links: [],
          droppedLinksCount: 0,
          status: { code: 0 },
        }],
      }],
    }],
  }))
}

function embeddedRuntime(html: string): RuntimeTraceBundle {
  const match = /window\.__CODEVILLE_RUNTIME__=(.*?)<\/script>/s.exec(html)
  expect(match).not.toBeNull()
  return JSON.parse(match![1]!) as RuntimeTraceBundle
}

function networkCapableReferences(html: string): string[] {
  return [
    /<script\b[^>]*\bsrc\s*=/gi,
    /<link\b[^>]*\bhref\s*=/gi,
    /<(?:img|iframe|frame|source)\b[^>]*\b(?:src|srcset)\s*=\s*["']?(?:https?:)?\/\//gi,
    /@import\s+(?:url\s*\()?\s*["']?(?:https?:)?\/\//gi,
    /url\(\s*["']?(?:https?:)?\/\//gi,
  ].flatMap((pattern) => html.match(pattern) ?? [])
}
