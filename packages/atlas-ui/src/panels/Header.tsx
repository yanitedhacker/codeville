import type { Atlas } from '@codeville/core'

interface Props {
  atlas: Atlas
  flowing: boolean
  onToggleFlow(): void
  onTrace(): void
  onReset(): void
}

const n = (v: number): string => v.toLocaleString('en-US')

export function Header({ atlas, flowing, onToggleFlow, onTrace, onReset }: Props) {
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
      <div className="cv-actions">
        <button className="cv-btn" data-on={flowing} onClick={onToggleFlow}>
          {flowing ? 'Pause flow' : 'Resume the flow'}
        </button>
        <button className="cv-btn" onClick={onTrace}>Trace one step</button>
        <button className="cv-btn" onClick={onReset}>Reset view</button>
      </div>
    </header>
  )
}
