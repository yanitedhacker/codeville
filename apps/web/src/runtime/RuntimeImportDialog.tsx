import type { FormEvent } from 'react'

export interface RuntimeImportDialogProps {
  busy: boolean
  error: string | null
  onCancel(): void
  onImport(file: File, sourceRoot?: string): void
}

export function RuntimeImportDialog({ busy, error, onCancel, onImport }: RuntimeImportDialogProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    const fileInput = event.currentTarget.elements.namedItem('runtimeFile') as HTMLInputElement | null
    const sourceRootInput = event.currentTarget.elements.namedItem('sourceRoot') as HTMLInputElement | null
    const file = fileInput?.files?.[0]
    if (!file) return

    const sourceRoot = sourceRootInput?.value.trim()
    onImport(file, sourceRoot || undefined)
  }

  return (
    <div className="cv-runtime-dialog-backdrop">
      <section
        className="cv-runtime-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-runtime-dialog-title"
      >
        <h2 id="cv-runtime-dialog-title">Import OTLP trace</h2>
        <p>Choose one local OTLP JSON or JSON Lines file.</p>
        <form onSubmit={submit}>
          <label htmlFor="cv-runtime-file">Runtime trace file</label>
          <input
            id="cv-runtime-file"
            name="runtimeFile"
            type="file"
            accept=".json,.jsonl,application/json"
            required
            disabled={busy}
          />

          <label htmlFor="cv-runtime-source-root">Source root recorded in the trace</label>
          <input
            id="cv-runtime-source-root"
            name="sourceRoot"
            type="text"
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
          />

          {busy && <p className="cv-runtime-dialog-status" role="status">Importing runtime trace…</p>}
          {error && <p className="cv-runtime-dialog-error" role="alert">{error}</p>}

          <div className="cv-runtime-dialog-actions">
            <button className="cv-btn" type="submit" disabled={busy}>Import</button>
            <button className="cv-btn" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  )
}
