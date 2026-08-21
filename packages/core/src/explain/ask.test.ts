import { describe, expect, it } from 'vitest'
import { ASK_FINGERPRINT, ASK_SYSTEM, askUserPrompt, heuristicAskLine } from './ask.js'

describe('ask prompt', () => {
  const payload = {
    path: 'lib/session.ts',
    role: 'service logic',
    area: 'lib',
    in: 1,
    out: 2,
    imports: ['jose', 'lib/db.ts'],
    importedBy: ['middleware.ts'],
    samples: ['import { getSession } from "@/lib/session"'],
    sourceDigest: 'export const getSession = () => {}\n',
    fn: 'getSession',
    question: 'what does getSession return?',
    graphRole: 'A connector in this slice.',
  }

  it('has a distinct fingerprint from the file explainer', () => {
    expect(ASK_FINGERPRINT).toMatch(/^ask-/)
    expect(ASK_FINGERPRINT).not.toBe('p2')
  })

  it('puts role, neighbours, samples, digest, fn, question, and graph role in the user prompt', () => {
    const text = askUserPrompt(payload)
    expect(text).toContain('lib/session.ts')
    expect(text).toContain('service logic')
    expect(text).toContain('jose')
    expect(text).toContain('middleware.ts')
    expect(text).toContain('import { getSession } from "@/lib/session"')
    expect(text).toContain('export const getSession = () => {}')
    expect(text).toContain('getSession')
    expect(text).toContain('what does getSession return?')
    expect(text).toContain('A connector in this slice.')
    expect(text).not.toMatch(/\bcalls\b|\binvokes\b/)
  })

  it('tells the model not to invent runtime from an import', () => {
    expect(ASK_SYSTEM.toLowerCase()).toMatch(/import/)
    expect(ASK_SYSTEM.toLowerCase()).not.toMatch(/\bcalls\b|\buses\b|\binvokes\b/)
  })

  it('marks the fallback one-liner as heuristic', () => {
    const line = heuristicAskLine(payload)
    expect(line.toLowerCase()).toContain('heuristic')
    expect(line).toContain('getSession')
    expect(line).toContain('lib/session.ts')
  })
})
