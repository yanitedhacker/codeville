import { describe, expect, it } from 'vitest'
import { DEFAULT_RUNTIME_IMPORT_LIMITS, RuntimeImportError } from './types.js'
import { parseOtlpDocuments } from './otlp-json.js'
import { otlpDocument } from './fixtures.js'

const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength

describe('parseOtlpDocuments', () => {
  it('accepts one JSON document and JSON Lines', () => {
    const one = JSON.stringify(otlpDocument())

    expect(parseOtlpDocuments(one)).toHaveLength(1)
    expect(parseOtlpDocuments(`${one}\n${one}\n`)).toHaveLength(2)
  })

  it('rejects the input-byte limit before JSON decoding', () => {
    try {
      parseOtlpDocuments(' '.repeat(33), {
        limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: 32 },
      })
      throw new Error('expected a limit failure')
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeImportError)
      expect(error).toMatchObject({ code: 'limit', limit: 'maxInputBytes', actual: 33 })
    }
  })

  it('accepts exactly the input-byte limit and rejects one byte above it', () => {
    const document = JSON.stringify(otlpDocument())
    const exactLimit = byteLength(document)

    expect(parseOtlpDocuments(document, {
      limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: exactLimit },
    })).toHaveLength(1)
    try {
      parseOtlpDocuments(`${document} `, {
        limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: exactLimit },
      })
      throw new Error('expected a limit failure')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'limit',
        limit: 'maxInputBytes',
        actual: exactLimit + 1,
      })
    }
  })

  it('rejects a top-level object without resourceSpans', () => {
    expect(() => parseOtlpDocuments('{"resourceMetrics":[]}')).toThrow(/OTLP trace object/)
  })

  it.each(['resourceMetrics', 'resourceLogs', 'resourceProfiles'])('rejects a mixed %s signal', (signal) => {
    expect(() => parseOtlpDocuments(JSON.stringify({ resourceSpans: [], [signal]: [] }))).toThrow(/mixed telemetry/)
  })

  it('accepts an empty trace export', () => {
    expect(parseOtlpDocuments('{"resourceSpans":[]}')).toHaveLength(1)
  })

  it('enforces the trace-count limit for JSON Lines before returning documents', () => {
    const line = JSON.stringify(otlpDocument())
    const accepted = `${line}\n${line}`
    const rejected = `${accepted}\n${line}`

    expect(parseOtlpDocuments(accepted, {
      limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: byteLength(accepted), maxTraces: 2 },
    })).toHaveLength(2)

    try {
      parseOtlpDocuments(rejected, {
        limits: { ...DEFAULT_RUNTIME_IMPORT_LIMITS, maxInputBytes: byteLength(rejected), maxTraces: 2 },
      })
      throw new Error('expected a limit failure')
    } catch (error) {
      expect(error).toMatchObject({ code: 'limit', limit: 'maxTraces', actual: 3 })
    }
  })

  it('accepts JSON Lines exactly at the per-line byte limit and returns no partial list above it', () => {
    const line = JSON.stringify(otlpDocument())
    const exactLimit = byteLength(line)
    const input = `${line}\n${line}\n`

    expect(parseOtlpDocuments(input, {
      limits: {
        ...DEFAULT_RUNTIME_IMPORT_LIMITS,
        maxInputBytes: byteLength(input),
        maxJsonLineBytes: exactLimit,
      },
    })).toHaveLength(2)

    let documents: unknown
    try {
      parseOtlpDocuments(`${line}\n${line} `, {
        limits: {
          ...DEFAULT_RUNTIME_IMPORT_LIMITS,
          maxInputBytes: byteLength(`${line}\n${line} `),
          maxJsonLineBytes: exactLimit,
        },
      })
    } catch (error) {
      expect(error).toMatchObject({
        code: 'limit',
        limit: 'maxJsonLineBytes',
        actual: exactLimit + 1,
      })
    }
    expect(documents).toBeUndefined()
  })
})
