import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'
import { UNIT, arc, bezier, halfWidth, hitLink, hitNode, project, shade, slabFaces, sortByDepth, type Point } from './iso.js'

export interface ViewState {
  selected: string[]
  selectedLink: AtlasLink | null
  hovered: string | null
  activeArea: string | null
  filter: string
  flowing: boolean
}

export interface RendererCallbacks {
  onHover(id: string | null, screen: { x: number; y: number } | null): void
  /** Plain click. `null` clears the set. Inspect list clicks use this too. */
  onSelect(id: string | null): void
  /** Shift or Meta click on a block. */
  onToggleSelect(id: string): void
  onSelectLink(link: AtlasLink | null): void
}

const PALETTE = {
  canvas: '#E4E1BE',
  grid: 'rgba(122,122,98,0.20)',
  gridMajor: 'rgba(122,122,98,0.34)',
  dim: '#7C7C6A',
  ink: '#1A1C11',
  containment: 'rgba(132,132,108,0.34)',
  importLine: 'rgba(64,100,76,0.34)',
  externalLine: 'rgba(40,60,48,0.26)',
}

const IMPORT_HOT = '#25412F'
const EXTERNAL_HOT = '#14200E'
const PACKET = '#2C4C38'

interface Packet {
  link: AtlasLink
  p0: Point
  c: Point
  p1: Point
  t: number
  speed: number
}

export class AtlasRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly bg = document.createElement('canvas')
  private readonly fg = document.createElement('canvas')
  private readonly cb: RendererCallbacks

  private atlas: Atlas
  private view: ViewState = { selected: [], selectedLink: null, hovered: null, activeArea: null, filter: '', flowing: true }

  private nodeById = new Map<string, AtlasNode>()
  private ordered: AtlasNode[] = []
  private packets: Packet[] = []
  private labelled = new Set<string>()

  private camX = 0
  private camY = 0
  private zoom = 1
  private home = { x: 0, y: 0, zoom: 1 }

  private width = 0
  private height = 0
  private dpr = 1

  private layersDirty = true
  private frame = 0
  private lastTs = 0
  private dragging = false
  private dragMoved = false
  private lastPointer = { x: 0, y: 0 }
  private disposed = false

  constructor(canvas: HTMLCanvasElement, atlas: Atlas, cb: RendererCallbacks) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('codeville: 2d canvas context unavailable')
    this.canvas = canvas
    this.ctx = ctx
    this.atlas = atlas
    this.cb = cb
    this.ingest(atlas)
    this.bindEvents()
    ;(canvas as HTMLCanvasElement & { __codeville?: AtlasRenderer }).__codeville = this
    this.frame = requestAnimationFrame(this.tick)
  }

  // --- public API ---------------------------------------------------------

  setAtlas(atlas: Atlas): void {
    this.atlas = atlas
    this.ingest(atlas)
    this.resetView()
  }

  setView(next: Partial<ViewState>): void {
    const before = this.view
    this.view = { ...before, ...next }
    if (viewChanged(before, this.view)) {
      this.layersDirty = true
      this.draw()
    }
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height
    for (const c of [this.canvas, this.bg, this.fg]) {
      c.width = Math.max(1, Math.round(width * this.dpr))
      c.height = Math.max(1, Math.round(height * this.dpr))
    }
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.fit()
    // Paint now rather than waiting for RAF: in a background tab RAF never fires,
    // which would leave the page blank and hit-testing dead until it is focused.
    this.draw()
  }

  resetView(): void {
    this.fit()
    this.draw()
  }

  /** Advance every packet one hop and stop, so a single exchange can be read. */
  traceOneStep(): void {
    for (const p of this.packets) p.t = (p.t + 0.125) % 1
    this.view.flowing = false
    this.draw()
  }

  focusNode(id: string): void {
    const node = this.nodeById.get(id)
    if (!node) return
    const p = project(node.x, node.y, node.h)
    this.camX = -p.sx * this.zoom
    this.camY = -p.sy * this.zoom
    this.layersDirty = true
  }

  /** Debug affordance: reachable as `document.querySelector('canvas').__codeville`. */
  probe(clientX: number, clientY: number): unknown {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return {
      x, y,
      hit: this.nodeAt(clientX, clientY)?.path ?? null,
      nodes: this.ordered.length,
      zoom: this.zoom,
      cam: [this.camX, this.camY],
      dpr: this.dpr,
      flowing: this.view.flowing,
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.unbindEvents()
  }

  // --- setup --------------------------------------------------------------

  private ingest(atlas: Atlas): void {
    this.nodeById = new Map(atlas.nodes.map((n) => [n.id, n]))
    this.ordered = sortByDepth(atlas.nodes)

    this.packets = []
    for (let i = 0; i < atlas.links.length; i++) {
      const link = atlas.links[i]!
      if (link.type === 'containment') continue
      const a = this.nodeById.get(link.from)
      const b = this.nodeById.get(link.to)
      if (!a || !b) continue
      const { p0, c, p1 } = arc(a, b)
      // Phase spread by index keeps the flow from pulsing in lockstep.
      this.packets.push({ link, p0, c, p1, t: (i * 0.6180339887) % 1, speed: 0.055 + ((i % 7) * 0.006) })
    }

    // Label the structural slabs and the busiest files; everything else on demand.
    const busy = [...atlas.nodes]
      .filter((n) => n.kind === 'file')
      .sort((a, b) => b.in + b.out - (a.in + a.out))
      .slice(0, 18)
    this.labelled = new Set([
      ...atlas.nodes.filter((n) => n.kind === 'dir').map((n) => n.id),
      ...busy.map((n) => n.id),
    ])
    this.layersDirty = true
  }

  private fit(): void {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of this.atlas.nodes) {
      const s = halfWidth(n)
      for (const [dx, dy, dz] of [[-s, -s, n.h], [s, -s, n.h], [s, s, 0], [-s, s, 0]] as const) {
        const p = project(n.x + dx, n.y + dy, dz)
        if (p.sx < minX) minX = p.sx
        if (p.sx > maxX) maxX = p.sx
        if (p.sy < minY) minY = p.sy
        if (p.sy > maxY) maxY = p.sy
      }
    }
    if (!Number.isFinite(minX)) { minX = maxX = minY = maxY = 0 }

    const pad = 52
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    this.zoom = Math.min((this.width - pad * 2) / spanX, (this.height - pad * 2) / spanY, 2.4)
    if (!Number.isFinite(this.zoom) || this.zoom <= 0) this.zoom = 1
    this.camX = -((minX + maxX) / 2) * this.zoom
    this.camY = -((minY + maxY) / 2) * this.zoom
    this.home = { x: this.camX, y: this.camY, zoom: this.zoom }
    this.layersDirty = true
  }

  // --- frame loop ---------------------------------------------------------

  private tick = (ts: number): void => {
    if (this.disposed) return
    const dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, 0.05) : 0
    this.lastTs = ts

    if (this.view.flowing && dt > 0) {
      for (const p of this.packets) {
        p.t += p.speed * dt
        if (p.t >= 1) p.t -= 1
      }
      this.draw()
    } else if (this.layersDirty) {
      this.draw()
    }
    this.frame = requestAnimationFrame(this.tick)
  }

  private draw(): void {
    if (this.width === 0) return
    if (this.layersDirty) {
      this.renderStaticLayers()
      this.layersDirty = false
    }
    const { ctx } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.bg, 0, 0)
    this.drawPackets()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.fg, 0, 0)
  }

  /** Screen transform: DPR, then centre, then camera pan and zoom. */
  private applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.translate(this.width / 2 + this.camX, this.height / 2 + this.camY)
    ctx.scale(this.zoom, this.zoom)
  }

  private renderStaticLayers(): void {
    this.renderBackground()
    this.renderForeground()
  }

  private renderBackground(): void {
    const ctx = this.bg.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.bg.width, this.bg.height)
    this.applyTransform(ctx)
    ctx.lineJoin = 'round'

    this.drawGrid(ctx)

    const selectedSet = new Set(this.view.selected)
    const hotLinks: AtlasLink[] = []

    for (const link of this.atlas.links) {
      const a = this.nodeById.get(link.from)
      const b = this.nodeById.get(link.to)
      if (!a || !b) continue
      if (this.isLinkHot(link, selectedSet)) { hotLinks.push(link); continue }
      this.strokeLink(ctx, a, b, link.type, false)
    }
    for (const link of hotLinks) {
      const a = this.nodeById.get(link.from)!
      const b = this.nodeById.get(link.to)!
      this.strokeLink(ctx, a, b, link.type, true)
    }
  }

  private strokeLink(
    ctx: CanvasRenderingContext2D,
    a: AtlasNode,
    b: AtlasNode,
    type: AtlasLink['type'],
    hot: boolean,
  ): void {
    const inv = 1 / this.zoom
    if (type === 'containment') {
      ctx.setLineDash([3 * inv, 5 * inv])
      ctx.strokeStyle = PALETTE.containment
      ctx.lineWidth = 0.7 * inv
    } else if (type === 'external') {
      ctx.setLineDash(hot ? [] : [1.5 * inv, 4 * inv])
      ctx.strokeStyle = hot ? EXTERNAL_HOT : PALETTE.externalLine
      ctx.lineWidth = (hot ? 1.7 : 0.75) * inv
    } else {
      ctx.setLineDash([])
      ctx.strokeStyle = hot ? IMPORT_HOT : PALETTE.importLine
      ctx.lineWidth = (hot ? 1.7 : 0.8) * inv
    }

    if (type === 'containment') {
      const p0 = project(a.x, a.y, a.h)
      const p1 = project(b.x, b.y, b.h)
      ctx.beginPath()
      ctx.moveTo(p0.sx, p0.sy)
      ctx.lineTo(p1.sx, p1.sy)
      ctx.stroke()
      ctx.setLineDash([])
      return
    }

    const { p0, c, p1 } = arc(a, b)
    ctx.beginPath()
    ctx.moveTo(p0.sx, p0.sy)
    ctx.quadraticCurveTo(c.sx, c.sy, p1.sx, p1.sy)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    let min = 0
    let max = 0
    for (const n of this.atlas.nodes) {
      min = Math.min(min, n.x, n.y)
      max = Math.max(max, n.x, n.y)
    }
    const lo = Math.floor(min) - 3
    const hi = Math.ceil(max) + 3
    const inv = 1 / this.zoom
    // Keep the lattice at a readable density whatever the repo's span.
    const step = Math.max(1, Math.round((hi - lo) / 34))
    ctx.setLineDash([])

    for (let i = lo; i <= hi; i += step) {
      const major = Math.round(i / step) % 5 === 0
      ctx.strokeStyle = major ? PALETTE.gridMajor : PALETTE.grid
      ctx.lineWidth = (major ? 0.7 : 0.5) * inv

      const a = project(i, lo, 0)
      const b = project(i, hi, 0)
      ctx.beginPath()
      ctx.moveTo(a.sx, a.sy)
      ctx.lineTo(b.sx, b.sy)
      ctx.stroke()

      const c = project(lo, i, 0)
      const d = project(hi, i, 0)
      ctx.beginPath()
      ctx.moveTo(c.sx, c.sy)
      ctx.lineTo(d.sx, d.sy)
      ctx.stroke()
    }
  }

  private renderForeground(): void {
    const ctx = this.fg.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.fg.width, this.fg.height)
    this.applyTransform(ctx)
    ctx.lineJoin = 'round'

    const areaColor = new Map(this.atlas.areas.map((a) => [a.id, a.color]))
    const filter = this.view.filter.trim().toLowerCase()

    for (const node of this.ordered) {
      const inFocus = this.isInFocus(node, filter)
      const base = inFocus ? areaColor.get(node.area) ?? '#3E6B4E' : PALETTE.dim
      this.drawSlab(ctx, node, base, inFocus)
    }

    for (const node of this.ordered) {
      const inFocus = this.isInFocus(node, filter)
      // Below ~0.55 zoom a block is smaller than its own caption, so labels
      // stop being information and start being noise.
      const shouldLabel =
        this.isSelectedId(node.id) ||
        node.id === this.view.hovered ||
        (this.zoom > 0.55 && this.labelled.has(node.id)) ||
        this.zoom > 1.6
      if (shouldLabel) this.drawLabel(ctx, node, inFocus)
    }
  }

  private isInFocus(node: AtlasNode, filter: string): boolean {
    if (filter) return node.path.toLowerCase().includes(filter) || node.role.toLowerCase().includes(filter)
    if (this.view.activeArea) return node.area === this.view.activeArea
    return false
  }

  private drawSlab(ctx: CanvasRenderingContext2D, node: AtlasNode, base: string, inFocus: boolean): void {
    const faces = slabFaces(node)
    const selected = this.isSelectedId(node.id)
    const hovered = node.id === this.view.hovered
    const inv = 1 / this.zoom

    fill(ctx, faces.right, shade(base, 0.62))
    fill(ctx, faces.left, shade(base, 0.8))
    fill(ctx, faces.top, selected || hovered ? shade(base, 1.22) : base)

    // Hatching marks a slab as a group rather than a single file.
    if (node.kind === 'dir') this.hatchTop(ctx, faces.top, inFocus)

    ctx.setLineDash([])
    ctx.lineWidth = (selected ? 1.6 : 0.6) * inv
    ctx.strokeStyle = selected || hovered ? PALETTE.ink : shade(base, 0.5)
    ctx.beginPath()
    trace(ctx, faces.top)
    ctx.stroke()
  }

  private hatchTop(ctx: CanvasRenderingContext2D, top: Point[], inFocus: boolean): void {
    const [back, right, front, left] = top as [Point, Point, Point, Point]
    ctx.save()
    ctx.beginPath()
    trace(ctx, top)
    ctx.clip()
    ctx.strokeStyle = inFocus ? 'rgba(228,225,190,0.30)' : 'rgba(228,225,190,0.22)'
    ctx.lineWidth = 0.55 / this.zoom
    const steps = 9
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      ctx.beginPath()
      ctx.moveTo(back.sx + (left.sx - back.sx) * t, back.sy + (left.sy - back.sy) * t)
      ctx.lineTo(right.sx + (front.sx - right.sx) * t, right.sy + (front.sy - right.sy) * t)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawLabel(ctx: CanvasRenderingContext2D, node: AtlasNode, inFocus: boolean): void {
    const { anchor } = slabFaces(node)
    const inv = 1 / this.zoom
    ctx.save()
    ctx.translate(anchor.sx, anchor.sy)
    ctx.scale(inv, inv)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const strong = this.isSelectedId(node.id) || node.id === this.view.hovered
    ctx.font = `${strong ? 600 : 500} 9px "JetBrains Mono", ui-monospace, monospace`
    ctx.fillStyle = strong ? PALETTE.ink : inFocus ? 'rgba(26,28,17,0.86)' : 'rgba(26,28,17,0.52)'
    ctx.fillText(node.label, 0, -1)

    ctx.font = '400 7.5px "JetBrains Mono", ui-monospace, monospace'
    ctx.fillStyle = strong ? 'rgba(26,28,17,0.72)' : 'rgba(26,28,17,0.42)'
    ctx.fillText(subLabel(node), 0, 9)
    ctx.restore()
  }

  private drawPackets(): void {
    const { ctx } = this
    this.applyTransform(ctx)
    const selectedSet = new Set(this.view.selected)
    const r = 1.9 / this.zoom

    for (const p of this.packets) {
      const isHot = this.isLinkHot(p.link, selectedSet)
      const { sx, sy } = bezier(p.p0, p.c, p.p1, p.t)
      ctx.beginPath()
      ctx.arc(sx, sy, isHot ? r * 1.7 : r, 0, Math.PI * 2)
      ctx.fillStyle = isHot ? PALETTE.ink : PACKET
      ctx.globalAlpha = isHot ? 1 : 0.62
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private layoutPoint(clientX: number, clientY: number): Point | null {
    if (this.layersDirty) this.draw()
    const rect = this.canvas.getBoundingClientRect()
    const cssX = clientX - rect.left
    const cssY = clientY - rect.top
    if (cssX < 0 || cssY < 0 || cssX > this.width || cssY > this.height) return null
    const zoom = this.zoom || 1
    // Inverse of applyTransform: DPR cancels between CSS pixels and the dpr scale.
    return {
      sx: (cssX - this.width / 2 - this.camX) / zoom,
      sy: (cssY - this.height / 2 - this.camY) / zoom,
    }
  }

  private nodeAt(clientX: number, clientY: number): AtlasNode | null {
    const p = this.layoutPoint(clientX, clientY)
    return p ? hitNode(this.ordered, p) : null
  }

  private linkAt(clientX: number, clientY: number): AtlasLink | null {
    const p = this.layoutPoint(clientX, clientY)
    return p ? hitLink(this.atlas.links, this.nodeById, p, this.zoom || 1) : null
  }

  private isSelectedId(id: string): boolean {
    if (this.view.selected.includes(id)) return true
    const link = this.view.selectedLink
    return link != null && (link.from === id || link.to === id)
  }

  private isLinkHot(link: AtlasLink, selectedSet: Set<string>): boolean {
    const { hovered, selectedLink } = this.view
    if (
      selectedLink &&
      selectedLink.from === link.from &&
      selectedLink.to === link.to &&
      selectedLink.type === link.type
    ) {
      return true
    }
    if (hovered && (link.from === hovered || link.to === hovered)) return true
    if (selectedSet.size === 1) {
      const id = this.view.selected[0]!
      return link.from === id || link.to === id
    }
    if (selectedSet.size >= 2 && link.type !== 'containment') {
      return selectedSet.has(link.from) && selectedSet.has(link.to)
    }
    return false
  }

  // --- interaction --------------------------------------------------------

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Shift/Meta click toggles; do not start a pan. Unmodified clicks still
    // use the dragMoved threshold below.
    this.dragging = !(e.shiftKey || e.metaKey)
    this.dragMoved = false
    this.lastPointer = { x: e.clientX, y: e.clientY }
    this.canvas.setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x
      const dy = e.clientY - this.lastPointer.y
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true
      this.camX += dx
      this.camY += dy
      this.lastPointer = { x: e.clientX, y: e.clientY }
      this.layersDirty = true
      return
    }
    const node = this.nodeAt(e.clientX, e.clientY)
    const id = node?.id ?? null
    if (id !== this.view.hovered) {
      this.setView({ hovered: id })
      const rect = this.canvas.getBoundingClientRect()
      this.cb.onHover(id, id ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
    } else if (id) {
      const rect = this.canvas.getBoundingClientRect()
      this.cb.onHover(id, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    const click = !this.dragMoved
    this.dragging = false
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    if (!click) return

    const node = this.nodeAt(e.clientX, e.clientY)
    if (node) {
      if (e.shiftKey || e.metaKey) this.cb.onToggleSelect(node.id)
      else this.cb.onSelect(node.id)
      return
    }
    const found = this.linkAt(e.clientX, e.clientY)
    if (found) this.cb.onSelectLink(found)
    else {
      this.cb.onSelect(null)
      this.cb.onSelectLink(null)
    }
  }

  private onPointerLeave = (): void => {
    this.dragging = false
    if (this.view.hovered) {
      this.setView({ hovered: null })
      this.cb.onHover(null, null)
    }
  }

  /** Cursor-anchored zoom: the layout point under the pointer stays put. */
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const px = e.clientX - rect.left - this.width / 2
    const py = e.clientY - rect.top - this.height / 2
    const worldX = (px - this.camX) / this.zoom
    const worldY = (py - this.camY) / this.zoom

    const factor = Math.exp(-e.deltaY * 0.0016)
    const next = Math.max(0.18, Math.min(this.zoom * factor, 8))
    if (next === this.zoom) return
    this.zoom = next
    this.camX = px - worldX * this.zoom
    this.camY = py - worldY * this.zoom
    this.layersDirty = true
  }
}

function trace(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  const [first, ...rest] = pts
  if (!first) return
  ctx.moveTo(first.sx, first.sy)
  for (const p of rest) ctx.lineTo(p.sx, p.sy)
  ctx.closePath()
}

function fill(ctx: CanvasRenderingContext2D, pts: Point[], style: string): void {
  ctx.beginPath()
  trace(ctx, pts)
  ctx.fillStyle = style
  ctx.fill()
}

function viewChanged(before: ViewState, next: ViewState): boolean {
  return (
    before.selected.join('\0') !== next.selected.join('\0') ||
    linkKey(before.selectedLink) !== linkKey(next.selectedLink) ||
    before.hovered !== next.hovered ||
    before.activeArea !== next.activeArea ||
    before.filter !== next.filter
  )
}

function linkKey(link: AtlasLink | null): string {
  return link ? `${link.type}\0${link.from}\0${link.to}` : ''
}

export function subLabel(node: AtlasNode): string {
  if (node.kind === 'external') return 'package'
  if (node.kind === 'dir') return `${node.items ?? 0} items`
  return `${node.lines} lines`
}

export { UNIT }
