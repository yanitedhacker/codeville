import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'

export interface RuntimeImportDialogProps {
  busy: boolean
  error: string | null
  returnFocusRef?: { readonly current: HTMLElement | null }
  onCancel(): void
  onImport(file: File, sourceRoot?: string): void
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )]
}

export function RuntimeImportDialog({ busy, error, returnFocusRef, onCancel, onImport }: RuntimeImportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const returnTarget = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    fileRef.current?.focus()
    return () => returnTarget?.focus()
  }, [])

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (dialog === null) return
    const focusable = focusableElements(dialog)
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]!
    const last = focusable.at(-1)!
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

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
        ref={dialogRef}
        className="cv-runtime-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-runtime-dialog-title"
        tabIndex={-1}
        onKeyDown={keyDown}
      >
        <h2 id="cv-runtime-dialog-title">Import OTLP trace</h2>
        <p>Choose one local OTLP JSON or JSON Lines file.</p>
        <form onSubmit={submit}>
          <label htmlFor="cv-runtime-file">Runtime trace file</label>
          <input
            ref={fileRef}
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
