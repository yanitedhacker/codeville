import type { Atlas } from '@codeville/core'

interface Props {
  atlas: Atlas
  activeArea: string | null
  filter: string
  onArea(id: string | null): void
  onFilter(value: string): void
}

export function SystemMap({ atlas, activeArea, filter, onArea, onFilter }: Props) {
  const total = atlas.nodes.length

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
        onChange={(e) => onFilter(e.target.value)}
      />

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

      <p className="cv-note">{atlas.repo.note}</p>
    </aside>
  )
}
