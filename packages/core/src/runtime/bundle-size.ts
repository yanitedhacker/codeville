import {
  RuntimeImportError,
  type RuntimeTraceBundle,
} from './types.js'

interface RuntimeBundleSizeOptions {
  readonly escapeForScript?: boolean
}

type PendingValue =
  | { readonly kind: 'value'; readonly value: unknown; readonly arrayItem: boolean }
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

/**
 * Measures the exact UTF-8 bytes emitted by JSON.stringify without first
 * allocating the complete JSON string. Runtime bundles are plain JSON data;
 * cycles and non-plain objects are rejected with a safe error.
 */
export function runtimeBundleSerializedBytes(
  bundle: RuntimeTraceBundle,
  options: RuntimeBundleSizeOptions = {},
): number {
  const escapeForScript = options.escapeForScript === true
  const active = new Set<object>()
  const pending: PendingValue[] = [{ kind: 'value', value: bundle, arrayItem: false }]
  let total = 0

  const addToken = (token: string): void => {
    total += tokenBytes(token, escapeForScript)
    if (!Number.isSafeInteger(total)) {
      throw new RuntimeImportError('limit', 'Runtime trace serialized bundle size is not measurable.')
    }
  }

  while (pending.length > 0) {
    const current = pending.pop()!
    if (current.kind === 'leave') {
      active.delete(current.value)
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
      total += 2 + Math.max(0, current.value.length - 1)
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ kind: 'value', value: current.value[index], arrayItem: true })
      }
      continue
    }

    const prototype = Object.getPrototypeOf(current.value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RuntimeImportError('schema', 'Runtime trace bundle is not serializable.')
    }
    const entries = Object.entries(current.value).filter(([, value]) =>
      value !== undefined && typeof value !== 'function' && typeof value !== 'symbol')
    total += 2 + Math.max(0, entries.length - 1) + entries.length
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]!
      addToken(JSON.stringify(key))
      pending.push({ kind: 'value', value, arrayItem: false })
    }
  }

  return total
}

export function assertRuntimeBundleSerializedBytes(
  bundle: RuntimeTraceBundle,
  maximum: number,
  options: RuntimeBundleSizeOptions = {},
): number {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new RuntimeImportError('schema', 'Runtime normalization limits are invalid.')
  }
  const actual = runtimeBundleSerializedBytes(bundle, options)
  if (actual > maximum) {
    throw RuntimeImportError.limit('maxSerializedBundleBytes', actual)
  }
  return actual
}
