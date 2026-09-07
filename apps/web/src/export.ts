import type { Atlas, RuntimeTraceBundle } from '@codeville/core'
import { renderStandaloneHtml, STANDALONE_CSS, STANDALONE_JS } from '@codeville/atlas-ui'

/** Inlines the standalone bundle + this atlas into one offline-capable file. */
export async function exportAtlas(atlas: Atlas, runtime?: RuntimeTraceBundle): Promise<void> {
  const [js, css] = await Promise.all([text(STANDALONE_JS), text(STANDALONE_CSS)])
  const html = renderStandaloneHtml(atlas, js, css, runtime)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(atlas.repo.name)}-atlas.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function text(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`Export bundle missing at ${path}. Run: pnpm -F @codeville/atlas-ui build`)
  }
  return res.text()
}

const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo'
