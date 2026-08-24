import type { TourChapter } from '../tour.js'

export interface GuidedTourProps {
  chapters: TourChapter[]
  index: number | null
  onStart(): void
  onMove(index: number): void
  onExit(): void
}

export function GuidedTour({ chapters, index, onStart, onMove, onExit }: GuidedTourProps) {
  if (index == null) {
    return (
      <section className="cv-tour">
        <button type="button" className="cv-btn" onClick={onStart}>
          Start guided tour
        </button>
      </section>
    )
  }

  const bounded = chapters.length === 0 ? 0 : Math.min(Math.max(index, 0), chapters.length - 1)
  const chapter = chapters[bounded]
  if (!chapter) return null

  return (
    <section className="cv-tour">
      <div className="cv-tour-head">
        <strong>Chapter {bounded + 1} of {chapters.length}</strong>
        <button type="button" className="cv-btn" onClick={onExit}>Exit tour</button>
      </div>
      <div className="cv-tour-title">{chapter.title}</div>
      <p className="cv-tour-note" aria-live="polite">{chapter.note}</p>
      <div className="cv-tour-actions">
        <button type="button" className="cv-btn" disabled={bounded === 0} onClick={() => onMove(Math.max(0, bounded - 1))}>
          Back
        </button>
        <button type="button" className="cv-btn" disabled={bounded >= chapters.length - 1} onClick={() => onMove(Math.min(chapters.length - 1, bounded + 1))}>
          Next
        </button>
      </div>
    </section>
  )
}
