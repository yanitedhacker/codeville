import { useCallback, useRef, useState } from 'react'
import {
  applyExplanations,
  buildAtlas,
  RuntimeImportError,
  toRequests,
  type Atlas as AtlasData,
  type RuntimeTraceBundle,
} from '@codeville/core'
import { heuristic } from '@codeville/core/explain/heuristic'
import { Atlas } from '@codeville/atlas-ui'
import { fromDataTransfer, fromFileList, fromGithub, type Ingested } from './ingest/index.js'
import { exportAtlas } from './export.js'
import { ingestRuntimeFile } from './runtime/ingest.js'
import { RuntimeImportDialog } from './runtime/RuntimeImportDialog.js'
import './drop.css'

type Phase = { kind: 'idle' } | { kind: 'working'; label: string } | { kind: 'error'; message: string }

export function App() {
  const [atlas, setAtlas] = useState<AtlasData | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [runtime, setRuntime] = useState<RuntimeTraceBundle | null>(null)
  const [runtimeImportOpen, setRuntimeImportOpen] = useState(false)
  const [runtimeImportBusy, setRuntimeImportBusy] = useState(false)
  const [runtimeImportError, setRuntimeImportError] = useState<string | null>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const runtimeImportButtonRef = useRef<HTMLButtonElement>(null)
  const runtimeImportAttemptRef = useRef(0)

  const run = useCallback(async (label: string, load: () => Promise<Ingested>) => {
    setPhase({ kind: 'working', label })
    try {
      const { name, files, truncated, omittedWorkspaces, omittedCargo } = await load()
      // Yield once so the working state paints before the analyzer blocks the thread.
      await new Promise((r) => setTimeout(r, 0))
      const built = buildAtlas(files, {
        repoName: name,
        omitted: {
          ...(omittedWorkspaces ? { npm: omittedWorkspaces } : {}),
          ...(omittedCargo ? { cargo: omittedCargo } : {}),
        },
      })
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

  const importRuntime = useCallback(async (file: File, sourceRoot?: string) => {
    if (!atlas) return
    const attempt = ++runtimeImportAttemptRef.current
    setRuntimeImportError(null)
    setRuntimeImportBusy(true)
    try {
      const imported = await ingestRuntimeFile(file, atlas, sourceRoot ? { sourceRoot } : {})
      if (attempt !== runtimeImportAttemptRef.current) return
      setRuntime(imported)
      setRuntimeImportOpen(false)
    } catch (error) {
      if (attempt !== runtimeImportAttemptRef.current) return
      setRuntimeImportError(
        error instanceof RuntimeImportError
          ? error.message
          : 'Could not import that runtime trace.',
      )
    } finally {
      if (attempt === runtimeImportAttemptRef.current) setRuntimeImportBusy(false)
    }
  }, [atlas])

  const clearRuntime = useCallback(() => {
    runtimeImportAttemptRef.current += 1
    setRuntime(null)
    setRuntimeImportBusy(false)
    setRuntimeImportError(null)
  }, [])

  const cancelRuntimeImport = useCallback(() => {
    runtimeImportAttemptRef.current += 1
    setRuntimeImportOpen(false)
    setRuntimeImportBusy(false)
    setRuntimeImportError(null)
  }, [])

  const newRepository = useCallback(() => {
    runtimeImportAttemptRef.current += 1
    setRuntime(null)
    setRuntimeImportOpen(false)
    setRuntimeImportBusy(false)
    setRuntimeImportError(null)
    setAtlas(null)
  }, [])

  if (atlas) {
    const footerExtra = (
      <>
        <button
          className="cv-inline-btn"
          onClick={() => runtime ? exportAtlas(atlas, runtime) : exportAtlas(atlas)}
        >
          {runtime ? 'Export HTML (includes sanitized telemetry)' : 'Export html'}
        </button>
        <button
          ref={runtimeImportButtonRef}
          className="cv-inline-btn"
          onClick={() => {
            setRuntimeImportError(null)
            setRuntimeImportOpen(true)
          }}
        >
          Import OTLP trace
        </button>
        <button className="cv-inline-btn" onClick={newRepository}>New repo</button>
        {' · '}
      </>
    )

    return (
      <>
        <div
          className="cv-runtime-app-background"
          inert={runtimeImportOpen || undefined}
          aria-hidden={runtimeImportOpen || undefined}
        >
          {runtime
            ? <Atlas atlas={atlas} runtime={runtime} initialMode="runtime" onClearRuntime={clearRuntime} footerExtra={footerExtra} />
            : <Atlas atlas={atlas} footerExtra={footerExtra} />}
        </div>
        {runtimeImportOpen && (
          <RuntimeImportDialog
            busy={runtimeImportBusy}
            error={runtimeImportError}
            returnFocusRef={runtimeImportButtonRef}
            onCancel={cancelRuntimeImport}
            onImport={importRuntime}
          />
        )}
      </>
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
