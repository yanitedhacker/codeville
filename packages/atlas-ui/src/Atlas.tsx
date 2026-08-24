import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Atlas as AtlasData, AtlasLink, AtlasNode, LayoutMode } from '@codeville/core'
import { canvasCommand, startsFlowing } from './keyboard.js'
import { AtlasRenderer, subLabel } from './renderer.js'
import { Header } from './panels/Header.js'
import { GuidedTour } from './panels/GuidedTour.js'
import { SystemMap } from './panels/SystemMap.js'
import { Inspect, type InspectTarget, type Tab } from './panels/Inspect.js'
import { buildTour, type TourChapter } from './tour.js'
import type { AtlasFocus } from './focus.js'
import './theme.css'

export interface AtlasProps {
  atlas: AtlasData
  /** Rendered into the footer's left slot; defaults to the reference caption. */
  caption?: string
  /** Extra controls dropped next to the footer caption, e.g. an export button. */
  footerExtra?: React.ReactNode
}

interface Tip {
  node: AtlasNode
  x: number
  y: number
}

export function Atlas({ atlas, caption = 'Local source atlas / read-only projection', footerExtra }: AtlasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<AtlasRenderer | null>(null)

  const [selected, setSelected] = useState<string[]>([])
  const [selectedLink, setSelectedLink] = useState<AtlasLink | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [activeArea, setActiveArea] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('city')
  const [flowing, setFlowing] = useState(() =>
    startsFlowing(
      typeof window === 'undefined'
        ? false
        : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    ),
  )
  const [tab, setTab] = useState<Tab>('does')
  const [tip, setTip] = useState<Tip | null>(null)
  const [tourIndex, setTourIndex] = useState<number | null>(null)
  const [manualFocus, setManualFocus] = useState<AtlasFocus | null>(null)
  const [focusMessage, setFocusMessage] = useState<string | null>(null)

  const byId = useMemo(() => new Map(atlas.nodes.map((n) => [n.id, n])), [atlas])
  const chapters = useMemo<TourChapter[]>(() => buildTour(atlas), [atlas])
  const boundedTourIndex = tourIndex == null || chapters.length === 0
    ? null
    : Math.min(Math.max(tourIndex, 0), chapters.length - 1)
  const activeFocus = boundedTourIndex == null ? manualFocus : chapters[boundedTourIndex] ?? null
  const layoutModeRef = useRef(layoutMode)
  layoutModeRef.current = layoutMode

  useEffect(() => {
    if (tourIndex != null) {
      const bounded = chapters.length === 0 ? null : Math.min(Math.max(tourIndex, 0), chapters.length - 1)
      if (bounded !== tourIndex) setTourIndex(bounded)
    }
    const nodeIds = new Set(atlas.nodes.map((node) => node.id))
    if (manualFocus && !manualFocus.nodeIds.some((id) => nodeIds.has(id))) {
      setManualFocus(null)
      setFocusMessage(null)
    }
  }, [atlas, chapters, tourIndex, manualFocus])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    const renderer = new AtlasRenderer(canvas, atlas, {
      onHover: (id, screen) => {
        setHovered(id)
        const node = id ? byId.get(id) : null
        setTip(node && screen ? { node, x: screen.x, y: screen.y } : null)
      },
      onSelect: (id) => {
        setSelectedLink(null)
        setSelected(id ? [id] : [])
      },
      onToggleSelect: (id) => {
        setSelectedLink(null)
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
      },
      onSelectLink: (link) => {
        setSelectedLink(link)
        setSelected(link ? [link.from, link.to] : [])
      },
    })
    renderer.setLayout(layoutModeRef.current)
    rendererRef.current = renderer

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box) renderer.resize(box.width, box.height)
    })
    observer.observe(stage)
    renderer.resize(stage.clientWidth, stage.clientHeight)

    return () => {
      observer.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [atlas, byId])

  useEffect(() => {
    const focus = activeFocus
      ? { nodeIds: [...activeFocus.nodeIds].sort(), linkKeys: [...activeFocus.linkKeys].sort() }
      : null
    rendererRef.current?.setView({
      selected,
      selectedLink,
      hovered,
      activeArea,
      filter,
      flowing,
      focus,
    })
  }, [selected, selectedLink, hovered, activeArea, filter, flowing, activeFocus, atlas])

  useEffect(() => {
    const renderer = rendererRef.current
    if (renderer && activeFocus) renderer.focusNodes([...activeFocus.nodeIds].sort())
  }, [activeFocus, layoutMode, atlas])

  // Selecting from a list should also bring the block into view. Replaces the set.
  const selectFromList = useCallback((id: string) => {
    setSelectedLink(null)
    setSelected([id])
    rendererRef.current?.focusNode(id)
  }, [])

  const onLayout = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode)
    rendererRef.current?.setLayout(mode)
  }, [])

  const onCanvasKeyDown = useCallback((e: KeyboardEvent<HTMLCanvasElement>) => {
    const command = canvasCommand(e.key)
    if (!command) return
    e.preventDefault()
    const renderer = rendererRef.current
    if (!renderer) return
    if (command.kind === 'pan') renderer.panBy(command.x, command.y)
    else if (command.kind === 'zoom') renderer.zoomBy(command.factor)
    else renderer.resetView()
  }, [])

  const startTour = useCallback(() => {
    setTourIndex(chapters.length > 0 ? 0 : null)
    setManualFocus(null)
    setFocusMessage(null)
    setFilter('')
    setActiveArea(null)
    setSelectedLink(null)
  }, [chapters.length])

  const moveTour = useCallback((index: number) => {
    if (chapters.length === 0) return
    setTourIndex(Math.min(Math.max(index, 0), chapters.length - 1))
    setSelected([])
    setSelectedLink(null)
    setFocusMessage(null)
  }, [chapters.length])

  const exitTour = useCallback(() => {
    setTourIndex(null)
    setManualFocus(null)
    setFocusMessage(null)
    rendererRef.current?.resetView()
  }, [])

  const applyFocus = useCallback((focus: AtlasFocus) => {
    setTourIndex(null)
    setManualFocus(focus)
    setFocusMessage(null)
    setFilter('')
    setActiveArea(null)
    setSelectedLink(null)
  }, [])

  const clearFocus = useCallback(() => {
    setTourIndex(null)
    setManualFocus(null)
    setFocusMessage(null)
    rendererRef.current?.resetView()
  }, [])

  const resetAll = useCallback(() => {
    setTourIndex(null)
    setManualFocus(null)
    setFocusMessage(null)
    setActiveArea(null)
    setFilter('')
    setSelected([])
    setSelectedLink(null)
    rendererRef.current?.resetView()
  }, [])

  const target = useMemo((): InspectTarget => {
    if (hovered) {
      const node = byId.get(hovered)
      if (node) return { type: 'hover', node }
    }
    if (selectedLink) return { type: 'link', link: selectedLink }
    const nodes = selected.map((id) => byId.get(id)).filter((n): n is AtlasNode => n != null)
    if (nodes.length > 1) return { type: 'set', nodes }
    if (nodes.length === 1) return { type: 'node', node: nodes[0]! }
    return { type: 'empty' }
  }, [hovered, selected, selectedLink, byId])

  return (
    <div className="cv-root">
      <Header
        atlas={atlas}
        layoutMode={layoutMode}
        onLayout={onLayout}
        flowing={flowing}
        onToggleFlow={() => setFlowing((v) => !v)}
        onTrace={() => {
          setFlowing(false)
          rendererRef.current?.traceOneStep()
        }}
        onReset={resetAll}
      />

      <SystemMap
        atlas={atlas}
        activeArea={activeArea}
        filter={filter}
        onArea={setActiveArea}
        onFilter={setFilter}
        onSelect={selectFromList}
        tour={<GuidedTour chapters={chapters} index={boundedTourIndex} onStart={startTour} onMove={moveTour} onExit={exitTour} />}
      />

      <div className="cv-stage" ref={stageRef}>
        <canvas
          className="cv-canvas"
          ref={canvasRef}
          role="img"
          tabIndex={0}
          aria-label="Interactive codebase map. Use arrow keys to pan, plus and minus to zoom, and zero to reset. Use the system map search for an accessible file list."
          aria-describedby="cv-canvas-help"
          onKeyDown={onCanvasKeyDown}
        />

        <div className="cv-stage-overlay">
          <div className="cv-stage-top">
            <div className="cv-stage-title">
              <span className="cv-label">The codebase</span>
              <span className="cv-label">{layoutMode === 'city' ? 'Filesystem projection' : 'Dependency projection'}</span>
              <span className="cv-label" id="cv-canvas-help">
                Drag or arrow keys to pan / scroll or + - to zoom / 0 to reset / Shift-click to add
              </span>
            </div>
            <span className="cv-label">{flowing ? 'Flow active' : 'Flow paused'}</span>
          </div>

          <div className="cv-legend">
            <LegendItem kind="import" text="import packet" />
            <LegendItem kind="containment" text="containment" />
            <LegendItem kind="external" text="external link" />
          </div>
        </div>

        {tip && <Tooltip tip={tip} stage={stageRef.current} />}
      </div>

      <Inspect
        atlas={atlas}
        target={target}
        tab={tab}
        onTab={setTab}
        onSelect={selectFromList}
        focus={activeFocus}
        focusMessage={focusMessage}
        onFocus={applyFocus}
        onFocusMessage={setFocusMessage}
        onClearFocus={clearFocus}
      />

      <footer className="cv-footer">
        <span className="cv-label">{caption}</span>
        <span className="cv-label">
          {footerExtra}
          {footerCaption(target, byId)}
        </span>
      </footer>
    </div>
  )
}

function footerCaption(target: InspectTarget, byId: Map<string, AtlasNode>): string {
  switch (target.type) {
    case 'empty':
      return 'awaiting selection'
    case 'hover':
    case 'node':
      return target.node.path
    case 'set':
      return `${target.nodes.length.toLocaleString('en-US')} selected`
    case 'link': {
      const from = byId.get(target.link.from)?.path ?? target.link.from
      const to = byId.get(target.link.to)?.path ?? target.link.to
      return `${from} → ${to}`
    }
  }
}

function LegendItem({ kind, text }: { kind: string; text: string }) {
  return (
    <span className="cv-legend-item">
      <span className="cv-legend-line" data-kind={kind} />
      <span className="cv-label">{text}</span>
    </span>
  )
}

function Tooltip({ tip, stage }: { tip: Tip; stage: HTMLDivElement | null }) {
  const width = stage?.clientWidth ?? 0
  const height = stage?.clientHeight ?? 0
  // Flip the tooltip toward the inside of the stage when it would clip.
  const flipX = width > 0 && tip.x > width - 260
  const flipY = height > 0 && tip.y > height - 80

  return (
    <div
      className="cv-tooltip"
      style={{
        left: flipX ? undefined : tip.x + 14,
        right: flipX ? width - tip.x + 14 : undefined,
        top: flipY ? undefined : tip.y + 14,
        bottom: flipY ? height - tip.y + 14 : undefined,
      }}
    >
      <div className="cv-tooltip-name">{tip.node.label}</div>
      <div className="cv-tooltip-meta">
        {tip.node.role} / {subLabel(tip.node)}
      </div>
    </div>
  )
}
