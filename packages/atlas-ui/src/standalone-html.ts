import {
  DEFAULT_RUNTIME_IMPORT_LIMITS,
  assertRuntimeBundleSerializedBytes,
  type Atlas,
  type RuntimeImportOptions,
  type RuntimeTraceBundle,
} from '@codeville/core'

const CONTENT_SECURITY_POLICY = "default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

/**
 * Wraps a bundle + an atlas into one self-contained page: no network requests,
 * no external assets. Shared by the web export button and the CLI.
 */
export function renderStandaloneHtml(
  atlas: Atlas,
  js: string,
  css: string,
  runtime?: RuntimeTraceBundle,
  options: RuntimeImportOptions = {},
): string {
  const maxSerializedBundleBytes = options.limits?.maxSerializedBundleBytes
    ?? DEFAULT_RUNTIME_IMPORT_LIMITS.maxSerializedBundleBytes
  if (runtime !== undefined) {
    assertRuntimeBundleSerializedBytes(runtime, maxSerializedBundleBytes, { escapeForScript: true })
  }
  const runtimePayload = runtime === undefined
    ? ''
    : `\n<script>window.__CODEVILLE_RUNTIME__=${embedJson(runtime)}</script>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
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
<script>window.__CODEVILLE_ATLAS__=${embedJson(atlas)}</script>${runtimePayload}
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
