import { describe, expect, it } from 'vitest'
import { buildAtlas } from '../atlas.js'
import type { Atlas } from '../types.js'
import { correlateRuntimeSources } from './correlate.js'
import { otlpAttribute, otlpDocument } from './fixtures.js'
import { importOtlpTraceJson, runtimeBundleSerializedBytes } from './index.js'
import type { RuntimeAttribute, RuntimeTraceBundle } from './types.js'

function atlasWithFiles(paths: string[]): Atlas {
  return buildAtlas(paths.map((path) => ({ path, text: 'export {}\n' })), {
    now: () => '2026-08-31T00:00:00.000Z',
  })
}

function fileId(atlas: Atlas, path: string): string {
  return atlas.nodes.find((node) => node.kind === 'file' && node.path === path)!.id
}

function bundleWithAttributes(attributes: ReturnType<typeof otlpAttribute>[]): RuntimeTraceBundle {
  return importOtlpTraceJson(JSON.stringify(otlpDocument({ attributes })))
}

function sourcePath(path: string): ReturnType<typeof otlpAttribute> {
  return otlpAttribute('code.file.path', { stringValue: path })
}

function sourceAttributes(bundle: RuntimeTraceBundle): RuntimeAttribute[] {
  return bundle.spans[0]!.attributes
}

describe('correlateRuntimeSources', () => {
  it('rejects source-match amplification above the final serialized bundle limit', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const bundle = bundleWithAttributes([sourcePath('src/api.ts')])
    const maximum = runtimeBundleSerializedBytes(bundle)
    const expanded = correlateRuntimeSources(bundle, atlas)
    const expandedBytes = runtimeBundleSerializedBytes(expanded)
    const options = { limits: { maxSerializedBundleBytes: maximum } }

    let failure: unknown
    try {
      correlateRuntimeSources(bundle, atlas, options)
    } catch (error) {
      failure = error
    }

    expect(expandedBytes).toBeGreaterThan(maximum)
    expect(failure).toMatchObject({
      code: 'limit',
      limit: 'maxSerializedBundleBytes',
      actual: expect.any(Number),
    })
    const measuredBytes = (failure as { actual: number }).actual
    expect(measuredBytes).toBeGreaterThan(maximum)
    expect(measuredBytes).toBeLessThanOrEqual(expandedBytes)
    expect(bundle.spans[0]!.source).toBeUndefined()
  })

  it('matches only an exact normalized POSIX path under the explicit source root', () => {
    const atlas = atlasWithFiles(['src/api.ts', 'other/api.ts'])
    const matched = correlateRuntimeSources(bundleWithAttributes([sourcePath('/work//app/./src/api.ts')]), atlas, {
      sourceRoot: '/work/app',
    })
    const unmatched = correlateRuntimeSources(bundleWithAttributes([sourcePath('/else/api.ts')]), atlas, {
      sourceRoot: '/work/app',
    })

    expect(matched.spans[0]!.source).toMatchObject({
      nodeId: fileId(atlas, 'src/api.ts'),
      path: 'src/api.ts',
      recordedPath: '/work//app/./src/api.ts',
      kind: 'exact-file',
    })
    expect(unmatched.spans[0]!.source).toBeUndefined()
    expect(unmatched.report.unmatchedSourceSpans).toBe(1)
  })

  it('matches an exact Windows path under an explicit Windows source root', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const correlated = correlateRuntimeSources(
      bundleWithAttributes([sourcePath('C:\\work\\app\\src\\api.ts')]),
      atlas,
      { sourceRoot: 'C:\\work\\app' },
    )

    expect(correlated.spans[0]!.source).toMatchObject({
      nodeId: fileId(atlas, 'src/api.ts'),
      path: 'src/api.ts',
      recordedPath: 'C:\\work\\app\\src\\api.ts',
    })
  })

  it('rejects ambiguous Windows rooted forms and contains UNC paths by authority and share', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const driveRelative = correlateRuntimeSources(bundleWithAttributes([sourcePath('C:src\\api.ts')]), atlas, {
      sourceRoot: 'C:\\work\\app',
    })
    const driveLessRooted = correlateRuntimeSources(bundleWithAttributes([sourcePath('\\src\\api.ts')]), atlas, {
      sourceRoot: 'C:\\work\\app',
    })
    const unc = correlateRuntimeSources(bundleWithAttributes([sourcePath('\\\\server\\share\\src\\api.ts')]), atlas, {
      sourceRoot: '\\\\server\\share',
    })
    const differentShare = correlateRuntimeSources(bundleWithAttributes([sourcePath('\\\\server\\share\\src\\api.ts')]), atlas, {
      sourceRoot: '\\\\server\\other',
    })
    const caseChangedAuthority = correlateRuntimeSources(bundleWithAttributes([sourcePath('\\\\Server\\share\\src\\api.ts')]), atlas, {
      sourceRoot: '\\\\server\\share',
    })
    const posixRoot = correlateRuntimeSources(bundleWithAttributes([sourcePath('\\\\server\\share\\src\\api.ts')]), atlas, {
      sourceRoot: '/server/share',
    })

    expect(driveRelative.spans[0]!.source).toBeUndefined()
    expect(driveLessRooted.spans[0]!.source).toBeUndefined()
    expect(unc.spans[0]!.source).toMatchObject({ nodeId: fileId(atlas, 'src/api.ts') })
    expect(differentShare.spans[0]!.source).toBeUndefined()
    expect(caseChangedAuthority.spans[0]!.source).toBeUndefined()
    expect(posixRoot.spans[0]!.source).toBeUndefined()
  })

  it('uses deprecated attributes only when their stable counterparts are absent', () => {
    const atlas = atlasWithFiles(['src/legacy.ts'])
    const deprecated = correlateRuntimeSources(bundleWithAttributes([
      otlpAttribute('code.filepath', { stringValue: 'src/legacy.ts' }),
      otlpAttribute('code.function', { stringValue: 'legacyFn' }),
      otlpAttribute('code.lineno', { intValue: 42 }),
    ]), atlas)
    const stableWins = correlateRuntimeSources(bundleWithAttributes([
      sourcePath('src/missing.ts'),
      otlpAttribute('code.filepath', { stringValue: 'src/legacy.ts' }),
    ]), atlasWithFiles(['src/legacy.ts']))
    const stableDetails = correlateRuntimeSources(bundleWithAttributes([
      sourcePath('src/legacy.ts'),
      otlpAttribute('code.filepath', { stringValue: 'src/missing.ts' }),
      otlpAttribute('code.function.name', { stringValue: 'stableFn' }),
      otlpAttribute('code.function', { stringValue: 'legacyFn' }),
      otlpAttribute('code.line.number', { intValue: 7 }),
      otlpAttribute('code.lineno', { intValue: 42 }),
    ]), atlas)

    expect(deprecated.spans[0]!.source).toMatchObject({
      nodeId: fileId(atlas, 'src/legacy.ts'),
      functionName: 'legacyFn',
      lineNumber: '42',
    })
    expect(deprecated.report.compatibilityWarnings).toEqual([
      { code: 'deprecated-runtime-source-attribute', attribute: 'code.filepath' },
      { code: 'deprecated-runtime-source-attribute', attribute: 'code.function' },
      { code: 'deprecated-runtime-source-attribute', attribute: 'code.lineno' },
    ])
    expect(stableWins.spans[0]!.source).toBeUndefined()
    expect(stableWins.report.compatibilityWarnings).toEqual([])
    expect(stableDetails.spans[0]!.source).toMatchObject({
      functionName: 'stableFn',
      lineNumber: '7',
    })
    expect(stableDetails.report.compatibilityWarnings).toEqual([])
  })

  it('uses only valid tagged values and lets invalid stable keys block deprecated fallbacks', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const wrongStablePath = correlateRuntimeSources(bundleWithAttributes([
      otlpAttribute('code.file.path', { intValue: 1 }),
      otlpAttribute('code.filepath', { stringValue: 'src/api.ts' }),
    ]), atlas)
    const wrongStableDetails = correlateRuntimeSources(bundleWithAttributes([
      sourcePath('src/api.ts'),
      otlpAttribute('code.function.name', { intValue: 1 }),
      otlpAttribute('code.function', { stringValue: 'legacyFn' }),
      otlpAttribute('code.line.number', { stringValue: '7' }),
      otlpAttribute('code.lineno', { intValue: 7 }),
    ]), atlas)
    const wrongDeprecatedValues = correlateRuntimeSources(bundleWithAttributes([
      otlpAttribute('code.filepath', { intValue: 1 }),
      otlpAttribute('code.function', { intValue: 1 }),
      otlpAttribute('code.lineno', { stringValue: '7' }),
    ]), atlas)

    expect(wrongStablePath.spans[0]!.source).toBeUndefined()
    expect(wrongStablePath.report.unmatchedSourceSpans).toBe(0)
    expect(wrongStablePath.report.compatibilityWarnings).toEqual([])
    expect(wrongStableDetails.spans[0]!.source).toMatchObject({ nodeId: fileId(atlas, 'src/api.ts') })
    expect(wrongStableDetails.spans[0]!.source).not.toHaveProperty('functionName')
    expect(wrongStableDetails.spans[0]!.source).not.toHaveProperty('lineNumber')
    expect(wrongStableDetails.report.compatibilityWarnings).toEqual([])
    expect(wrongDeprecatedValues.spans[0]!.source).toBeUndefined()
    expect(wrongDeprecatedValues.report.unmatchedSourceSpans).toBe(0)
    expect(wrongDeprecatedValues.report.compatibilityWarnings).toEqual([])
  })

  it('accepts only positive safe integer source line numbers', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const valid = correlateRuntimeSources(bundleWithAttributes([
      sourcePath('src/api.ts'),
      otlpAttribute('code.line.number', { intValue: '9007199254740991' }),
    ]), atlas)

    expect(valid.spans[0]!.source).toMatchObject({ lineNumber: '9007199254740991' })
    for (const value of ['0', '-1', '9007199254740992']) {
      const invalid = correlateRuntimeSources(bundleWithAttributes([
        sourcePath('src/api.ts'),
        otlpAttribute('code.line.number', { intValue: value }),
      ]), atlas)
      expect(invalid.spans[0]!.source).not.toHaveProperty('lineNumber')
    }
  })

  it('rejects path traversal above the source root', () => {
    const absolute = correlateRuntimeSources(bundleWithAttributes([sourcePath('/work/app/../../src/api.ts')]), atlasWithFiles(['src/api.ts']), {
      sourceRoot: '/work/app',
    })
    const leavesAndReenters = correlateRuntimeSources(bundleWithAttributes([sourcePath('/work/app/../app/src/api.ts')]), atlasWithFiles(['src/api.ts']), {
      sourceRoot: '/work/app',
    })
    const relative = correlateRuntimeSources(bundleWithAttributes([sourcePath('../src/api.ts')]), atlasWithFiles(['src/api.ts']))

    expect(absolute.spans[0]!.source).toBeUndefined()
    expect(leavesAndReenters.spans[0]!.source).toBeUndefined()
    expect(relative.spans[0]!.source).toBeUndefined()
    expect(absolute.report.unmatchedSourceSpans).toBe(1)
    expect(leavesAndReenters.report.unmatchedSourceSpans).toBe(1)
    expect(relative.report.unmatchedSourceSpans).toBe(1)
  })

  it('matches only visible file nodes', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const file = atlas.nodes.find((node) => node.path === 'src/api.ts')!
    const directoryOnly = {
      ...atlas,
      nodes: [{ ...file, kind: 'dir' as const }],
    }

    const correlated = correlateRuntimeSources(bundleWithAttributes([sourcePath('src/api.ts')]), directoryOnly)

    expect(correlated.spans[0]!.source).toBeUndefined()
    expect(correlated.report.unmatchedSourceSpans).toBe(1)
  })

  it('rejects duplicate visible file paths as ambiguous', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const file = atlas.nodes.find((node) => node.kind === 'file' && node.path === 'src/api.ts')!
    const duplicate = {
      ...atlas,
      nodes: [...atlas.nodes, { ...file, id: 'duplicate:src/api.ts' }],
    }

    const correlated = correlateRuntimeSources(bundleWithAttributes([sourcePath('src/api.ts')]), duplicate)

    expect(correlated.spans[0]!.source).toBeUndefined()
    expect(correlated.report.unmatchedSourceSpans).toBe(1)
  })

  it('does not use an absolute path without a root or a unique suffix as an exact source match', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const noRoot = correlateRuntimeSources(bundleWithAttributes([sourcePath('/tmp/src/api.ts')]), atlas)
    const suffix = correlateRuntimeSources(bundleWithAttributes([sourcePath('/tmp/src/api.ts')]), atlas, {
      sourceRoot: '/work/app',
    })

    expect(noRoot.spans[0]!.source).toBeUndefined()
    expect(suffix.spans[0]!.source).toBeUndefined()
    expect(noRoot.report.unmatchedSourceSpans).toBe(1)
    expect(suffix.report.unmatchedSourceSpans).toBe(1)
  })

  it('returns a new bundle without changing earlier evidence or graph data', () => {
    const atlas = atlasWithFiles(['src/api.ts'])
    const bundle = bundleWithAttributes([sourcePath('src/api.ts')])
    const snapshot = JSON.stringify(bundle)
    Object.freeze(bundle)
    Object.freeze(bundle.spans)
    Object.freeze(bundle.spans[0]!)
    Object.freeze(sourceAttributes(bundle))

    const correlated = correlateRuntimeSources(bundle, atlas)

    expect(correlated).not.toBe(bundle)
    expect(correlated.spans).not.toBe(bundle.spans)
    expect(correlated.traces).toBe(bundle.traces)
    expect(correlated.report).not.toBe(bundle.report)
    expect(JSON.stringify(bundle)).toBe(snapshot)
    expect(correlated.report.unmatchedSourceSpans).toBe(0)
    expect(correlated.report.compatibilityWarnings).toEqual([])
    expect(correlated.spans[0]!.source).toMatchObject({ nodeId: fileId(atlas, 'src/api.ts') })
  })

  it('does not guess a source for spans without source attributes', () => {
    const correlated = correlateRuntimeSources(bundleWithAttributes([]), atlasWithFiles(['src/api.ts']))

    expect(correlated.spans[0]!.source).toBeUndefined()
    expect(correlated.report.unmatchedSourceSpans).toBe(0)
  })
})
