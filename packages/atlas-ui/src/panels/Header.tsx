import type { Atlas, LayoutMode } from '@codeville/core'

interface Props {
  atlas: Atlas
  layoutMode: LayoutMode
  flowing: boolean
  onLayout(mode: LayoutMode): void
  onToggleFlow(): void
  onTrace(): void
  onReset(): void
}

const n = (v: number): string => v.toLocaleString('en-US')

export function Header({ atlas, layoutMode, flowing, onLayout, onToggleFlow, onTrace, onReset }: Props) {
  const { stats } = atlas
  const cells: [string, string][] = [
    [n(stats.nodes), 'nodes'],
    [n(stats.sourceFiles), 'source files'],
    [n(stats.lines), 'lines'],
    [n(stats.links), 'links'],
    [n(stats.packages), 'packages'],
  ]

  return (
    <header className="cv-header">
      <div className="cv-header-primary">
        <div className="cv-repo">
          <span className="cv-label">Repository</span>
          <span className="cv-repo-name" title={atlas.repo.name}>{atlas.repo.name}</span>
        </div>
        <div className="cv-stats">
          {cells.map(([value, label]) => (
            <div className="cv-stat" key={label}>
              <span className="cv-stat-value">{value}</span>
              <span className="cv-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cv-actions">
        <button
          type="button"
          className="cv-btn"
          data-on={layoutMode === 'city'}
          aria-pressed={layoutMode === 'city'}
          onClick={() => onLayout('city')}
        >
          City
        </button>
        <button
          type="button"
          className="cv-btn"
          data-on={layoutMode === 'dependency'}
          aria-pressed={layoutMode === 'dependency'}
          onClick={() => onLayout('dependency')}
        >
          Dependencies
        </button>
        <button type="button" className="cv-btn" data-on={flowing} onClick={onToggleFlow}>
          {flowing ? 'Pause flow' : 'Resume the flow'}
        </button>
        <button type="button" className="cv-btn" onClick={onTrace}>Trace one step</button>
        <button type="button" className="cv-btn" onClick={onReset}>Reset view</button>
      </div>
    </header>
  )
}
