import type { Atlas } from '@codeville/core'
import { searchMatchCount, searchNodes } from '../search.js'

interface Props {
  atlas: Atlas
  activeArea: string | null
  filter: string
  onArea(id: string | null): void
  onFilter(value: string): void
  onSelect(id: string): void
}

export function SystemMap({ atlas, activeArea, filter, onArea, onFilter, onSelect }: Props) {
  const total = atlas.nodes.length
  const querying = filter.trim() !== ''
  const matchCount = querying ? searchMatchCount(atlas.nodes, filter) : 0
  const results = querying ? searchNodes(atlas.nodes, filter) : []
  const coverage = (atlas as Atlas & { coverage?: Atlas['coverage'] }).coverage
  const rows: [string, number][] = coverage
    ? [
        ['exact', coverage.exactFiles],
        ['heuristic', coverage.heuristicFiles],
        ['unsupported', coverage.unsupportedFiles],
        ['unresolved', coverage.unresolvedFacts],
        ['rolled-up', coverage.rolledUpFiles],
        ['hidden-external', coverage.hiddenExternals],
      ]
    : []

  return (
    <aside className="cv-rail">
      <div className="cv-rail-head">
        <strong>System map</strong>
        <span className="cv-label">Area: {activeArea ?? 'all'}</span>
      </div>

      <input
        className="cv-filter"
        value={filter}
        placeholder="filter files or areas"
        spellCheck={false}
        aria-label="Search files, roles, and symbols"
        onChange={(e) => onFilter(e.target.value)}
      />

      {querying && (
        <div className="cv-search-results">
          <span className="cv-label">{matchCount.toLocaleString('en-US')} results</span>
          {results.map((node) => (
            <button key={node.id} className="cv-search-result" onClick={() => onSelect(node.id)}>
              {node.path}
              <span className="cv-list-sub">{node.role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="cv-areas">
        <button
          className="cv-area"
          data-on={activeArea === null}
          aria-label={`whole system, ${total} nodes`}
          aria-pressed={activeArea === null}
          onClick={() => onArea(null)}
        >
          <span className="cv-swatch" />
          <span className="cv-area-name">whole system</span>
          <span className="cv-area-count">{total}</span>
        </button>
        {atlas.areas.map((area) => (
          <button
            key={area.id}
            className="cv-area"
            data-on={activeArea === area.id}
            aria-label={`${area.label}, ${area.count} nodes`}
            aria-pressed={activeArea === area.id}
            style={{ ['--swatch' as string]: area.color }}
            onClick={() => onArea(activeArea === area.id ? null : area.id)}
          >
            <span className="cv-swatch" />
            <span className="cv-area-name">{area.label}</span>
            <span className="cv-area-count">{area.count}</span>
          </button>
        ))}
      </div>

      <div className="cv-coverage">
        {coverage ? (
          <>
            {rows.map(([label, value]) => (
              <div className="cv-coverage-row" key={label}>
                <span>{label}</span>
                <span>{value.toLocaleString('en-US')}</span>
              </div>
            ))}
            {coverage.importFacts === 0 && (
              <p className="cv-coverage-empty">No import facts extracted</p>
            )}
          </>
        ) : (
          <p className="cv-coverage-empty">Coverage unavailable for this atlas</p>
        )}
      </div>

      <p className="cv-note">{atlas.repo.note}</p>
    </aside>
  )
}
