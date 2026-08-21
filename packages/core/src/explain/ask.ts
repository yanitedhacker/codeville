export const ASK_FINGERPRINT = 'ask-q1'

/**
 * Function Q&A in city context. Distinct from the per-file explainer prompt
 * so cached file summaries are never reused as answers.
 */
export const ASK_SYSTEM = [
  'You answer one question about one named function in a codebase.',
  'The city graph is import evidence: roles, fan-in, fan-out, neighbour paths, and quoted import statements.',
  'Do not invent runtime from an import statement.',
  'Be specific. No preamble, no markdown, no bullet points.',
].join(' ')

export interface AskPayload {
  path: string
  role: string
  area: string
  in: number
  out: number
  imports: string[]
  importedBy: string[]
  samples: string[]
  sourceDigest: string
  fn: string
  question: string
  graphRole: string
}

export function askUserPrompt(p: AskPayload): string {
  return [
    `File: ${p.path}`,
    `Function: ${p.fn}`,
    `Question: ${p.question}`,
    `Graph role: ${p.graphRole}`,
    `Detected role: ${p.role}`,
    `Area: ${p.area}`,
    `Fan-in: ${p.in.toLocaleString('en-US')}  Fan-out: ${p.out.toLocaleString('en-US')}`,
    p.imports.length ? `Imports: ${p.imports.join(', ')}` : null,
    p.importedBy.length ? `Imported by: ${p.importedBy.join(', ')}` : null,
    p.samples.length ? `Import statements:\n${p.samples.map((s) => `  ${s}`).join('\n')}` : null,
    '',
    'Source:',
    p.sourceDigest,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export function heuristicAskLine(p: AskPayload): string {
  return (
    `${p.graphRole} ${p.path} (${p.role}) names ${p.fn}. ` +
    `Fan-in ${p.in.toLocaleString('en-US')}, fan-out ${p.out.toLocaleString('en-US')}. ` +
    `This answer is heuristic.`
  )
}
