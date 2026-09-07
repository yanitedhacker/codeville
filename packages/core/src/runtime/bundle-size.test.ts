import { describe, expect, it } from 'vitest'
import {
  assertRuntimeBundleSerializedBytes,
} from './bundle-size.js'
import {
  type DerivedRuntimeSpan,
  type RuntimeTraceBundle,
} from './types.js'

describe('assertRuntimeBundleSerializedBytes', () => {
  it('stops reading array items at the first serialized-byte limit failure', () => {
    const repeatedSpan = 'xxxxxxxxxxxxxxxx' as unknown as DerivedRuntimeSpan
    const repeatedSpans = Array.from({ length: 10_000 }, () => repeatedSpan)
    let arrayItemReads = 0
    const spans = new Proxy(repeatedSpans, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) arrayItemReads += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const bundle: RuntimeTraceBundle = {
      version: 1,
      format: 'otlp-json',
      traces: [],
      spans,
      report: {
        documents: 0,
        resourceScopeGroups: 0,
        traces: 0,
        inputSpans: 0,
        spans: 0,
        duplicateSpans: 0,
        sampledSpans: 0,
        unsampledSpans: 0,
        redactedAttributes: 0,
        droppedAttributesCount: '0',
        droppedEventsCount: '0',
        droppedLinksCount: '0',
        unknownFieldCount: 0,
        unknownFields: [],
      },
    }

    expect(() => assertRuntimeBundleSerializedBytes(bundle, 72)).toThrowError(
      expect.objectContaining({
        code: 'limit',
        limit: 'maxSerializedBundleBytes',
        actual: 73,
      }),
    )
    expect(arrayItemReads).toBe(1)
  })
})
