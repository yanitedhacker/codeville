import type { Atlas } from '@codeville/core'

/**
 * Wraps a bundle + an atlas into one self-contained page: no network requests,
 * no external assets. Shared by the web export button and the CLI.
 */
export function renderStandaloneHtml(atlas: Atlas, js: string, css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(atlas.repo.name)} — codeville</title>
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;background:#e4e1be}
#root{position:relative;height:100%}
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>window.__CODEVILLE_ATLAS__=${embedJson(atlas)}</script>
<script>${js}</script>
</body>
</html>
`
}

/** Escape so a string inside the atlas can never terminate the script tag. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

export const STANDALONE_JS = '/standalone/codeville.js'
export const STANDALONE_CSS = '/standalone/codeville.css'
