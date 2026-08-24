import { useEffect, useRef, useState } from 'react'
import type { Atlas, AtlasLink, AtlasNode } from '@codeville/core'
import { describeLink, describeSet } from '../../../core/src/explain/heuristic.js'
import { askFlagFragment, chosenAskFn } from './ask-flags.js'
import { dependencyCone, shortestDependencyPath, type AtlasFocus, type FocusDirection } from '../focus.js'

export type Tab = 'does' | 'built'

export type InspectTarget =
  | { type: 'empty' }
  | { type: 'hover'; node: AtlasNode }
  | { type: 'node'; node: AtlasNode }
  | { type: 'set'; nodes: AtlasNode[] }
  | { type: 'link'; link: AtlasLink }

interface Props {
  atlas: Atlas
  target: InspectTarget
  tab: Tab
  onTab(tab: Tab): void
  /** Single id. Replaces a multi-select set. */
  onSelect(id: string): void
  focus: AtlasFocus | null
  focusMessage: string | null
  onFocus(focus: AtlasFocus): void
  onFocusMessage(message: string | null): void
  onClearFocus(): void
}

export function Inspect({ atlas, target, tab, onTab, onSelect, focus, focusMessage, onFocus, onFocusMessage, onClearFocus }: Props) {
  return (
    <aside className="cv-inspect">
      <div className="cv-inspect-head">
        <strong>Inspect</strong>
        <span className="cv-label">{statusLabel(target)}</span>
      </div>

      <div className="cv-tabs">
        <button className="cv-tab" data-on={tab === 'does'} onClick={() => onTab('does')}>What it does</button>
        <button className="cv-tab" data-on={tab === 'built'} onClick={() => onTab('built')}>How it&apos;s built</button>
      </div>

      <div className="cv-inspect-body">
        {focus && (
          <section className="cv-focus-summary">
            <span className="cv-label">Active focus</span>
            <h2 className="cv-node-name">{focus.title}</h2>
            <p className="cv-summary">{focus.note}</p>
            <button type="button" className="cv-btn" onClick={onClearFocus}>Clear focus</button>
          </section>
        )}
        {focusMessage && <p className="cv-summary" role="status">{focusMessage}</p>}
        {target.type === 'empty' ? (
          <p className="cv-empty">
            Choose a block in the map. The moving packets represent real import relationships, not decorative activity.
          </p>
        ) : target.type === 'set' ? (
          tab === 'does' ? (
            <SetDoes atlas={atlas} nodes={target.nodes} onSelect={onSelect} />
          ) : (
            <SetBuilt atlas={atlas} nodes={target.nodes} onSelect={onSelect} onFocus={onFocus} onFocusMessage={onFocusMessage} />
          )
        ) : target.type === 'link' ? (
          tab === 'does' ? (
            <LinkDoes atlas={atlas} link={target.link} onSelect={onSelect} />
          ) : (
            <LinkBuilt atlas={atlas} link={target.link} onSelect={onSelect} />
          )
        ) : tab === 'does' ? (
          <WhatItDoes node={target.node} />
        ) : (
          <HowItsBuilt atlas={atlas} node={target.node} onSelect={onSelect} onFocus={onFocus} onFocusMessage={onFocusMessage} />
        )}
      </div>
    </aside>
  )
}

function statusLabel(target: InspectTarget): string {
  switch (target.type) {
    case 'empty':
      return 'Hover / click'
    case 'hover':
      return 'Hovering'
    case 'node':
      return 'Selected block'
    case 'set':
      return 'Selected blocks'
    case 'link':
      return 'Selected arc'
  }
}

function Identity({ node }: { node: AtlasNode }) {
  return (
    <>
      <h2 className="cv-node-name">{node.label}</h2>
      <div className="cv-node-path">{node.path}</div>
      <span className="cv-chip">{node.role}</span>
      <div className="cv-grid">
        <Field label="Kind" value={node.kind} />
        <Field label="Area" value={node.area} />
      </div>
      <div className="cv-grid">
        <Field label="Incoming" value={String(node.in)} />
        <Field label="Outgoing" value={String(node.out)} />
      </div>
    </>
  )
}

function WhatItDoes({ node }: { node: AtlasNode }) {
  return (
    <>
      <Identity node={node} />

      {node.summary && (
        <section className="cv-section">
          <span className="cv-label">Summary</span>
          <p className="cv-summary">{node.summary}</p>
        </section>
      )}

      <section className="cv-section">
        <span className="cv-label">
          {node.kind === 'file' ? 'Source excerpt / line 1' : 'Contents'}
        </span>
        <pre className="cv-code">{node.excerpt.join('\n') || '(empty)'}</pre>
      </section>

      {node.kind === 'file' && <AskFlags key={node.id} node={node} />}

      <section className="cv-section">
        <span className="cv-label">What it contributes</span>
        <ul className="cv-list">
          {node.contributes.map((c) => (
            <li key={c}>
              <span className="cv-bullet" />
              <span>
                {c}
                <br />
                <span className="cv-list-sub">{contribution(node)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function AskFlags({ node }: { node: AtlasNode }) {
  const symbols = node.symbols ?? []
  const [typed, setTyped] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)
  const chosen = chosenAskFn(symbols, typed)
  const needsFn = typed.length > 0 && chosen === undefined

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  function markCopied() {
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="cv-section">
      <span className="cv-label">{symbols.length > 0 ? 'Symbols / codeville ask --fn' : 'codeville ask --node'}</span>
      {symbols.length > 0 && (
        <>
          <input
            className="cv-fn"
            list={`cv-sym-${node.id.replace(/[^\w]+/g, '-')}`}
            spellCheck={false}
            placeholder="pick a name from the list"
            aria-label="Symbols for codeville ask --fn"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              setCopied(false)
            }}
          />
          <datalist id={`cv-sym-${node.id.replace(/[^\w]+/g, '-')}`}>
            {symbols.map((s) => (
              <option value={s} key={s} />
            ))}
          </datalist>
        </>
      )}
      <button
        type="button"
        className="cv-btn"
        disabled={needsFn}
        title={needsFn ? 'Pick a --fn from the list' : undefined}
        aria-label={needsFn ? 'Pick a --fn from the list' : 'Copy flags'}
        onClick={() => {
          const text = askFlagFragment(node.path, chosen)
          // execCommand must run in this click turn. writeText is async and
          // drops user activation on file://, where the Clipboard API still exists.
          if (copyViaExecCommand(text)) {
            markCopied()
            return
          }
          if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
          void navigator.clipboard.writeText(text).then(markCopied, () => {})
        }}
      >
        {copied ? 'Copied' : 'Copy flags'}
      </button>
      <p className="cv-summary">The question is typed in the terminal; this page does not run ask.</p>
    </section>
  )
}

function copyViaExecCommand(text: string): boolean {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.left = '0'
  el.style.top = '0'
  el.style.opacity = '0'
  document.body.appendChild(el)
  try {
    el.focus()
    el.select()
    el.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    el.remove()
  }
}

function HowItsBuilt({ atlas, node, onSelect, onFocus, onFocusMessage }: { atlas: Atlas; node: AtlasNode; onSelect(id: string): void; onFocus(focus: AtlasFocus): void; onFocusMessage(message: string | null): void }) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  const flows = atlas.links.filter((l) => l.type !== 'containment')
  const outgoing = flows.filter((l) => l.from === node.id)
  const incoming = flows.filter((l) => l.to === node.id)
  const packet = [...outgoing, ...incoming].flatMap((l) => l.samples)[0]

  return (
    <>
      <Identity node={node} />

      <section className="cv-section">
        <span className="cv-label">Dependency focus</span>
        <FocusButton direction="dependencies" atlas={atlas} node={node} onFocus={onFocus} onFocusMessage={onFocusMessage} />
        <FocusButton direction="dependents" atlas={atlas} node={node} onFocus={onFocus} onFocusMessage={onFocusMessage} />
      </section>

      <section className="cv-section">
        <span className="cv-label">Relationships</span>
        {outgoing.length === 0 ? (
          <ul className="cv-list">
            <li>
              <span className="cv-bullet" />
              <span>No outgoing links in the visible slice.</span>
            </li>
          </ul>
        ) : (
          <NodeList ids={outgoing.map((l) => l.to)} byId={byId} onSelect={onSelect} />
        )}
      </section>

      <section className="cv-section">
        <span className="cv-label">Referenced by</span>
        {incoming.length === 0 ? (
          <ul className="cv-list">
            <li>
              <span className="cv-bullet" />
              <span>Nothing in the visible slice imports this.</span>
            </li>
          </ul>
        ) : (
          <NodeList ids={incoming.map((l) => l.from)} byId={byId} onSelect={onSelect} />
        )}
      </section>

      {packet && (
        <section className="cv-section">
          <span className="cv-label">Packet sample</span>
          <pre className="cv-code">{packet}</pre>
        </section>
      )}
    </>
  )
}

function FocusButton({ direction, atlas, node, onFocus, onFocusMessage }: { direction: FocusDirection; atlas: Atlas; node: AtlasNode; onFocus(focus: AtlasFocus): void; onFocusMessage(message: string | null): void }) {
  return (
    <button type="button" className="cv-btn" onClick={() => {
      onFocusMessage(null)
      onFocus(dependencyCone(atlas, node.id, direction))
    }}>
      {direction === 'dependencies' ? 'Focus dependencies' : 'Focus dependents'}
    </button>
  )
}

function SetDoes({ atlas, nodes, onSelect }: { atlas: Atlas; nodes: AtlasNode[]; onSelect(id: string): void }) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  return (
    <>
      <h2 className="cv-node-name">{nodes.length.toLocaleString('en-US')} blocks</h2>
      <p className="cv-summary">{describeSet(nodes, atlas.links)}</p>
      <section className="cv-section">
        <span className="cv-label">Selected paths</span>
        <NodeList ids={nodes.map((n) => n.id)} byId={byId} onSelect={onSelect} />
      </section>
    </>
  )
}

function SetBuilt({ atlas, nodes, onSelect, onFocus, onFocusMessage }: { atlas: Atlas; nodes: AtlasNode[]; onSelect(id: string): void; onFocus(focus: AtlasFocus): void; onFocusMessage(message: string | null): void }) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = atlas.links.filter((l) => l.type !== 'containment' && ids.has(l.from) && ids.has(l.to))

  return (
    <>
      <h2 className="cv-node-name">{nodes.length.toLocaleString('en-US')} blocks</h2>
      {nodes.length === 2 && (
        <section className="cv-section">
          <span className="cv-label">Directed dependency path</span>
          <button
            type="button"
            className="cv-btn"
            onClick={() => {
              const result = shortestDependencyPath(atlas, nodes[0]!.id, nodes[1]!.id)
              if (!result) {
                onFocusMessage('No directed dependency path in the visible slice.')
                return
              }
              onFocusMessage(null)
              onFocus(result)
            }}
          >
            Find directed path
          </button>
        </section>
      )}
      <section className="cv-section">
        <span className="cv-label">Selected paths</span>
        <NodeList ids={nodes.map((n) => n.id)} byId={byId} onSelect={onSelect} />
      </section>
      <section className="cv-section">
        <span className="cv-label">Induced arcs</span>
        {edges.length === 0 ? (
          <p className="cv-summary">They share no import or external arc in this slice.</p>
        ) : (
          <EdgeList edges={edges} byId={byId} />
        )}
      </section>
    </>
  )
}

function LinkDoes({ atlas, link, onSelect }: { atlas: Atlas; link: AtlasLink; onSelect(id: string): void }) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  const from = byId.get(link.from)
  const to = byId.get(link.to)
  return (
    <>
      <LinkIdentity atlas={atlas} link={link} onSelect={onSelect} />
      {from && to && (
        <section className="cv-section">
          <span className="cv-label">Summary</span>
          <p className="cv-summary">{describeLink(link, from, to)}</p>
        </section>
      )}
      <SampleBlock link={link} />
    </>
  )
}

function LinkBuilt({ atlas, link, onSelect }: { atlas: Atlas; link: AtlasLink; onSelect(id: string): void }) {
  return (
    <>
      <LinkIdentity atlas={atlas} link={link} onSelect={onSelect} />
      <SampleBlock link={link} />
    </>
  )
}

function LinkIdentity({
  atlas,
  link,
  onSelect,
}: {
  atlas: Atlas
  link: AtlasLink
  onSelect(id: string): void
}) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  const from = byId.get(link.from)
  const to = byId.get(link.to)
  const fromPath = from?.path ?? link.from
  const toPath = to?.path ?? link.to
  return (
    <>
      <h2 className="cv-node-name">
        {fromPath} → {toPath}
      </h2>
      <span className="cv-chip">{link.type}</span>
      <LinkEvidence link={link} />
      <p className="cv-summary">Click an endpoint to inspect that block. That replaces the current selection.</p>
      <section className="cv-section">
        <span className="cv-label">Endpoints</span>
        <NodeList ids={[link.from, link.to]} byId={byId} onSelect={onSelect} />
      </section>
    </>
  )
}

function LinkEvidence({ link }: { link: AtlasLink }) {
  if (link.type === 'containment') {
    return <p className="cv-summary">Structural projection; no source import evidence.</p>
  }
  const evidence = link.evidence ?? []
  const observations = link.observations ?? 0
  const chip = link.confidence === 'heuristic' ? 'Heuristic' : link.confidence === 'exact' ? 'Exact' : 'Unknown'
  return (
    <>
      <span className="cv-chip">{chip}</span>
      <p className="cv-summary">
        {observations.toLocaleString('en-US')} {observations === 1 ? 'observation' : 'observations'}
      </p>
      {evidence.length > 0 && (
        <ul className="cv-evidence">
          {evidence.map((ev) => (
            <li key={`${ev.path}:${ev.startLine}-${ev.endLine}:${ev.specifier}:${ev.extractor}`}>
              <div className="cv-evidence-loc">{`${ev.path}:${ev.startLine}-${ev.endLine}`}</div>
              <div className="cv-list-sub">{ev.extractor}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function SampleBlock({ link }: { link: AtlasLink }) {
  if (link.type === 'containment') {
    return (
      <section className="cv-section">
        <p className="cv-summary">Structural projection; no source import evidence.</p>
      </section>
    )
  }
  const evidence = link.evidence ?? []
  const statements = evidence.length > 0 ? evidence.map((ev) => ev.statement) : link.samples
  if (statements.length === 0) return null
  return (
    <section className="cv-section">
      <span className="cv-label">{statements.length === 1 ? 'Sample' : 'Samples'}</span>
      {statements.map((s) => (
        <pre className="cv-code" key={s}>
          {s}
        </pre>
      ))}
    </section>
  )
}

function EdgeList({ edges, byId }: { edges: AtlasLink[]; byId: Map<string, AtlasNode> }) {
  const shown = edges.slice(0, 24)
  const rest = edges.length - shown.length
  return (
    <ul className="cv-list">
      {shown.map((edge) => {
        const from = byId.get(edge.from)
        const to = byId.get(edge.to)
        return (
          <li key={`${edge.type}:${edge.from}:${edge.to}`}>
            <span className="cv-bullet" />
            <span>
              {from?.path ?? edge.from} → {to?.path ?? edge.to}
              <br />
              <span className="cv-list-sub">{edge.type}</span>
              {edge.samples.map((s) => (
                <pre className="cv-code" key={s}>
                  {s}
                </pre>
              ))}
            </span>
          </li>
        )
      })}
      {rest > 0 && (
        <li>
          <span className="cv-bullet" />
          <span className="cv-list-sub">and {rest.toLocaleString('en-US')} more</span>
        </li>
      )}
    </ul>
  )
}

function NodeList({
  ids,
  byId,
  onSelect,
}: {
  ids: string[]
  byId: Map<string, AtlasNode>
  onSelect(id: string): void
}) {
  const shown = ids.slice(0, 24)
  const rest = ids.length - shown.length
  return (
    <ul className="cv-list">
      {shown.map((id) => {
        const target = byId.get(id)
        if (!target) return null
        return (
          <li key={id}>
            <span className="cv-bullet" />
            <button onClick={() => onSelect(id)}>
              {target.path}
              <br />
              <span className="cv-list-sub">{target.role}</span>
            </button>
          </li>
        )
      })}
      {rest > 0 && (
        <li>
          <span className="cv-bullet" />
          <span className="cv-list-sub">and {rest.toLocaleString('en-US')} more</span>
        </li>
      )}
    </ul>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cv-label">{label}</div>
      <div className="cv-field-value">{value}</div>
    </div>
  )
}

function contribution(node: AtlasNode): string {
  if (node.kind === 'external') return `${node.in} references in this slice`
  if (node.kind === 'dir') return `${node.items ?? 0} items / ${node.lines.toLocaleString('en-US')} lines`
  return `${node.lines.toLocaleString('en-US')} lines / ${node.bytes.toLocaleString('en-US')} bytes`
}
