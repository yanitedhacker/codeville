export interface TarEntry {
  name: string
  size: number
  data: Buffer
}

const BLOCK = 512

/**
 * Minimal tar reader. Handles ustar, GNU long names, and pax `path=` records,
 * which is everything GitHub's codeload tarballs actually emit.
 */
export function untar(buf: Buffer, onEntry: (entry: TarEntry) => void): void {
  let offset = 0
  let pendingName: string | null = null

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK)
    if (isZeroBlock(header)) break

    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > buf.length) break
    const data = buf.subarray(dataStart, dataEnd)

    if (type === 'L') {
      pendingName = trimNul(data.toString('utf8'))
    } else if (type === 'x' || type === 'g') {
      pendingName = readPaxPath(data.toString('utf8')) ?? pendingName
    } else if (type === '0' || type === '\0') {
      const name = pendingName ?? joinName(header)
      pendingName = null
      onEntry({ name, size, data: Buffer.from(data) })
    } else {
      pendingName = null
    }

    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK
  }
}

function joinName(header: Buffer): string {
  const name = trimNul(header.subarray(0, 100).toString('utf8'))
  const prefix = trimNul(header.subarray(345, 500).toString('utf8'))
  return prefix ? `${prefix}/${name}` : name
}

/** pax records are `"<len> key=value\n"`, length-prefixed including its own digits. */
function readPaxPath(text: string): string | null {
  let i = 0
  while (i < text.length) {
    const space = text.indexOf(' ', i)
    if (space < 0) break
    const len = Number(text.slice(i, space))
    if (!Number.isFinite(len) || len <= 0) break
    const record = text.slice(space + 1, i + len).replace(/\n$/, '')
    const eq = record.indexOf('=')
    if (eq > 0 && record.slice(0, eq) === 'path') return record.slice(eq + 1)
    i += len
  }
  return null
}

function readOctal(buf: Buffer, start: number, length: number): number {
  const text = trimNul(buf.subarray(start, start + length).toString('ascii')).trim()
  const value = parseInt(text, 8)
  return Number.isFinite(value) ? value : 0
}

function trimNul(text: string): string {
  const end = text.indexOf('\0')
  return end < 0 ? text : text.slice(0, end)
}

function isZeroBlock(block: Buffer): boolean {
  for (let i = 0; i < block.length; i++) if (block[i] !== 0) return false
  return true
}
