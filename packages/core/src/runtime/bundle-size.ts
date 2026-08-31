import {
  RuntimeImportError,
  type RuntimeTraceBundle,
} from './types.js'

interface RuntimeBundleSizeOptions {
  readonly escapeForScript?: boolean
}

type PendingValue =
  | { readonly kind: 'value'; readonly value: unknown; readonly arrayItem: boolean }
  | {
    readonly kind: 'array'
    readonly value: unknown[]
    readonly index: number
    readonly length: number
  }
  | {
    readonly kind: 'object'
    readonly value: Record<string, unknown>
    readonly keys: string[]
    readonly index: number
    readonly emitted: boolean
  }
  | { readonly kind: 'leave'; readonly value: object }

const encoder = new TextEncoder()

function tokenBytes(value: string, escapeForScript: boolean): number {
  const escaped = escapeForScript
    ? value
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
    : value
  return encoder.encode(escaped).byteLength
}

function primitiveToken(value: unknown, arrayItem: boolean): string | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return JSON.stringify(value)
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return arrayItem ? 'null' : undefined
  }
  if (typeof value === 'bigint') {
    throw new RuntimeImportError('schema', 'Runtime trace bundle is not serializable.')
  }
  return undefined
}

function omittedObjectValue(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol'
}

function measureRuntimeBundleSerializedBytes(
  bundle: RuntimeTraceBundle,
  options: RuntimeBundleSizeOptions,
  maximum?: number,
): number {
  const escapeForScript = options.escapeForScript === true
  const active = new Set<object>()
  const pending: PendingValue[] = [{ kind: 'value', value: bundle, arrayItem: false }]
  let total = 0

  const addBytes = (bytes: number): void => {
    total += bytes
    if (!Number.isSafeInteger(total)) {
      throw new RuntimeImportError('limit', 'Runtime trace serialized bundle size is not measurable.')
    }
    if (maximum !== undefined && total > maximum) {
      throw RuntimeImportError.limit('maxSerializedBundleBytes', total)
    }
  }
  const addToken = (token: string): void => {
    addBytes(tokenBytes(token, escapeForScript))
  }

  while (pending.length > 0) {
    const current = pending.pop()!
    if (current.kind === 'leave') {
      active.delete(current.value)
      continue
    }
    if (current.kind === 'array') {
      if (current.index >= current.length) {
        addBytes(1)
        continue
      }
      if (current.index > 0) addBytes(1)
      pending.push({ ...current, index: current.index + 1 })
      pending.push({
        kind: 'value',
        value: current.value[current.index],
        arrayItem: true,
      })
      continue
    }
    if (current.kind === 'object') {
      let index = current.index
      let emittedValue = false
      while (index < current.keys.length) {
        const key = current.keys[index]!
        const value = current.value[key]
        index += 1
        if (omittedObjectValue(value)) continue
        if (current.emitted) addBytes(1)
        addToken(JSON.stringify(key))
        addBytes(1)
        pending.push({ ...current, index, emitted: true })
        pending.push({ kind: 'value', value, arrayItem: false })
        emittedValue = true
        break
      }
      if (!emittedValue) addBytes(1)
      continue
    }

    const primitive = primitiveToken(current.value, current.arrayItem)
    if (primitive !== undefined) {
      addToken(primitive)
      continue
    }
    if (typeof current.value !== 'object' || current.value === null) continue

    if (active.has(current.value)) {
      throw new RuntimeImportError('schema', 'Runtime trace bundle is not serializable.')
    }
    active.add(current.value)
    pending.push({ kind: 'leave', value: current.value })

    if (Array.isArray(current.value)) {
      addBytes(1)
      pending.push({
        kind: 'array',
        value: current.value,
        index: 0,
        length: current.value.length,
      })
      continue
    }

    const prototype = Object.getPrototypeOf(current.value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RuntimeImportError('schema', 'Runtime trace bundle is not serializable.')
    }
    addBytes(1)
    pending.push({
      kind: 'object',
      value: current.value as Record<string, unknown>,
      keys: Object.keys(current.value),
      index: 0,
      emitted: false,
    })
  }

  return total
}

/**
 * Measures the exact UTF-8 bytes emitted by JSON.stringify without first
 * allocating the complete JSON string. Runtime bundles are plain JSON data;
 * cycles and non-plain objects are rejected with a safe error.
 */
export function runtimeBundleSerializedBytes(
  bundle: RuntimeTraceBundle,
  options: RuntimeBundleSizeOptions = {},
): number {
  return measureRuntimeBundleSerializedBytes(bundle, options)
}

export function assertRuntimeBundleSerializedBytes(
  bundle: RuntimeTraceBundle,
  maximum: number,
  options: RuntimeBundleSizeOptions = {},
): number {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new RuntimeImportError('schema', 'Runtime normalization limits are invalid.')
  }
  return measureRuntimeBundleSerializedBytes(bundle, options, maximum)
}
