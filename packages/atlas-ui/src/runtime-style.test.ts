import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')

function blockAfter(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return ''
  const openIndex = source.indexOf('{', markerIndex + marker.length)
  if (openIndex < 0) return ''
  let depth = 1
  for (let index = openIndex + 1; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(openIndex + 1, index)
  }
  return ''
}

describe('Runtime Lens responsive style contract', () => {
  it('contains the runtime root and every grid child within the viewport', () => {
    const root = blockAfter(css, '.cv-runtime-root')
    const gridChildren = blockAfter(css, '.cv-runtime-lens > *,\n.cv-runtime-regions > *')

    expect(root).toMatch(/position:\s*absolute/)
    expect(root).toMatch(/inset:\s*0/)
    expect(root).toMatch(/max-width:\s*100%/)
    expect(root).toMatch(/overflow-x:\s*hidden/)
    expect(gridChildren).toMatch(/min-width:\s*0/)
  })

  it('stacks the runtime rail, summary and timeline, inspector, and footer at 860px', () => {
    const narrow = blockAfter(css, '@media (max-width: 860px)')
    const runtimeGrid = blockAfter(narrow, '.cv-runtime-lens')

    expect(runtimeGrid).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(runtimeGrid).toMatch(/"rail"/)
    expect(runtimeGrid).toMatch(/"summary"/)
    expect(runtimeGrid).toMatch(/"timeline"/)
    expect(runtimeGrid).toMatch(/"inspector"/)
    expect(runtimeGrid).toMatch(/"footer"/)
  })

  it('keeps all runtime controls at least 44px high at 480px', () => {
    const compact = blockAfter(css, '@media (max-width: 480px)')
    const controls = blockAfter(compact, '.cv-runtime-root :is(button, input, select)')

    expect(controls).toMatch(/min-height:\s*44px/)
  })

  it('removes runtime animation and transition when reduced motion is requested', () => {
    const reduced = blockAfter(css, '@media (prefers-reduced-motion: reduce)')
    const runtime = blockAfter(reduced, '.cv-runtime-root *,\n  .cv-runtime-root *::before,\n  .cv-runtime-root *::after')

    expect(runtime).toMatch(/animation:\s*none/)
    expect(runtime).toMatch(/transition:\s*none/)
  })
})
