import type { Atlas, AtlasNode } from '@codeville/core'

export type Tab = 'does' | 'built'

interface Props {
  atlas: Atlas
  node: AtlasNode | null
  pinned: boolean
  tab: Tab
  onTab(tab: Tab): void
  onSelect(id: string): void
}

export function Inspect({ atlas, node, pinned, tab, onTab, onSelect }: Props) {
  return (
    <aside className="cv-inspect">
      <div className="cv-inspect-head">
        <strong>Inspect</strong>
        <span className="cv-label">{node ? (pinned ? 'Selected block' : 'Hovering') : 'Hover / click'}</span>
      </div>

      <div className="cv-tabs">
        <button className="cv-tab" data-on={tab === 'does'} onClick={() => onTab('does')}>What it does</button>
        <button className="cv-tab" data-on={tab === 'built'} onClick={() => onTab('built')}>How it&apos;s built</button>
      </div>

      <div className="cv-inspect-body">
        {!node ? (
          <p className="cv-empty">
            Choose a block in the map. The moving packets represent real import relationships, not decorative activity.
          </p>
        ) : tab === 'does' ? (
          <WhatItDoes node={node} />
        ) : (
          <HowItsBuilt atlas={atlas} node={node} onSelect={onSelect} />
        )}
      </div>
    </aside>
  )
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

function HowItsBuilt({ atlas, node, onSelect }: { atlas: Atlas; node: AtlasNode; onSelect(id: string): void }) {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]))
  const flows = atlas.links.filter((l) => l.type !== 'containment')
  const outgoing = flows.filter((l) => l.from === node.id)
  const incoming = flows.filter((l) => l.to === node.id)
  const packet = [...outgoing, ...incoming].flatMap((l) => l.samples)[0]

  return (
    <>
      <Identity node={node} />

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
          <span className="cv-list-sub">and {rest} more</span>
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
