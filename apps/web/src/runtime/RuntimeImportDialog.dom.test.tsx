// @vitest-environment happy-dom

import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeImportDialog } from './RuntimeImportDialog.js'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('RuntimeImportDialog real DOM focus management', () => {
  it('focuses the dialog, wraps Tab, cancels with Escape, and restores the exact opener', async () => {
    await act(async () => root.render(<Host />))
    const opener = container.querySelector<HTMLButtonElement>('#open-runtime')!
    opener.focus()
    await act(async () => opener.click())

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!
    const file = container.querySelector<HTMLInputElement>('#cv-runtime-file')!
    const cancel = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Cancel')!
    const background = container.querySelector<HTMLElement>('main')!
    const newRepo = container.querySelector<HTMLButtonElement>('#new-repo')!

    expect(document.activeElement).toBe(file)
    expect(background.inert).toBe(true)
    expect(newRepo.closest('[inert]')).toBe(background)

    cancel.focus()
    await press(cancel, 'Tab')
    expect(document.activeElement).toBe(file)

    file.focus()
    await press(file, 'Tab', true)
    expect(document.activeElement).toBe(cancel)

    await press(cancel, 'Escape')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(background.inert).toBe(false)
  })
})

async function press(target: HTMLElement, key: string, shiftKey = false): Promise<void> {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })))
}

function Host() {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <>
      <main inert={open || undefined} aria-hidden={open || undefined}>
        <button id="open-runtime" ref={opener} type="button" onClick={() => setOpen(true)}>Import OTLP trace</button>
        <button id="new-repo" type="button">New repo</button>
      </main>
      {open
        ? (
            <RuntimeImportDialog
              busy={false}
              error={null}
              returnFocusRef={opener}
              onCancel={() => setOpen(false)}
              onImport={vi.fn()}
            />
          )
        : null}
    </>
  )
}
