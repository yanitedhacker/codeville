import { useCallback, useRef, useState } from 'react'
import { applyExplanations, buildAtlas, toRequests, type Atlas as AtlasData } from '@codeville/core'
import { heuristic } from '@codeville/core/explain/heuristic'
import { Atlas } from '@codeville/atlas-ui'
import { fromDataTransfer, fromFileList, fromGithub, type Ingested } from './ingest/index.js'
import { exportAtlas } from './export.js'
import './drop.css'

type Phase = { kind: 'idle' } | { kind: 'working'; label: string } | { kind: 'error'; message: string }

export function App() {
  const [atlas, setAtlas] = useState<AtlasData | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (label: string, load: () => Promise<Ingested>) => {
    setPhase({ kind: 'working', label })
    try {
      const { name, files, truncated, omittedWorkspaces } = await load()
      // Yield once so the working state paints before the analyzer blocks the thread.
      await new Promise((r) => setTimeout(r, 0))
      const built = buildAtlas(files, { repoName: name, ...(omittedWorkspaces ? { omittedWorkspaces } : {}) })
      // The heuristic explainer is pure and cheap, so the browser path fills the
      // summary panel exactly like the CLI does. AI adapters are node-only.
      const withProse = applyExplanations(built, await heuristic.explain(toRequests(built)))
      if (truncated) {
        withProse.repo.note += ' Input hit the file cap, so this slice is partial.'
      }
      setAtlas(withProse)
      setPhase({ kind: 'idle' })
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read that repository.' })
    }
  }, [])

  if (atlas) {
    return (
      <Atlas
        atlas={atlas}
        footerExtra={
          <>
            <button className="cv-inline-btn" onClick={() => exportAtlas(atlas)}>Export html</button>
            <button className="cv-inline-btn" onClick={() => setAtlas(null)}>New repo</button>
            {' · '}
          </>
        }
      />
    )
  }

  return (
    <div
      className="drop-root"
      data-dragging={dragging}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void run('Reading dropped files', () => fromDataTransfer(e.dataTransfer.items))
      }}
    >
      <div className="drop-card">
        <span className="drop-label">Codeville</span>
        <h1 className="drop-title">Drop a repo. Get an atlas.</h1>
        <p className="drop-copy">
          Supported source files become blocks; parser-confirmed and heuristic imports become
          inspectable arcs. The atlas reports unsupported files, unresolved imports, and roll-ups
          instead of hiding them. The moving dots are the import statements themselves. Folders and
          archives are read entirely in this browser.
        </p>

        <div className="drop-zone">
          <strong>Drag a folder or a .zip here</strong>
          <span className="drop-sub">nothing leaves your machine</span>
          <div className="drop-actions">
            <button className="cv-btn" onClick={() => folderRef.current?.click()}>Choose folder</button>
            <button className="cv-btn" onClick={() => zipRef.current?.click()}>Choose .zip</button>
          </div>
        </div>

        <form
          className="drop-github"
          onSubmit={(e) => {
            e.preventDefault()
            if (repoInput.trim()) void run(`Fetching ${repoInput.trim()}`, () => fromGithub(repoInput.trim()))
          }}
        >
          <input
            className="cv-filter drop-input"
            value={repoInput}
            spellCheck={false}
            placeholder="or paste a github url — vercel/next.js"
            onChange={(e) => setRepoInput(e.target.value)}
          />
          <button className="cv-btn" type="submit">Visualise</button>
        </form>

        {phase.kind === 'working' && <p className="drop-status">{phase.label}…</p>}
        {phase.kind === 'error' && <p className="drop-status drop-error">{phase.message}</p>}
      </div>

      <input
        ref={folderRef}
        type="file"
        hidden
        // @ts-expect-error non-standard but universally supported directory picker
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          const list = e.target.files
          if (list?.length) void run('Reading folder', () => fromFileList(list))
        }}
      />
      <input
        ref={zipRef}
        type="file"
        hidden
        accept=".zip"
        onChange={(e) => {
          const list = e.target.files
          if (list?.length) void run('Unpacking archive', () => fromFileList(list))
        }}
      />
    </div>
  )
}
