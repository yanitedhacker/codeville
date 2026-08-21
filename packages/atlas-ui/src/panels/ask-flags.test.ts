import { describe, expect, it } from 'vitest'
import { askFlagFragment, chosenAskFn } from './ask-flags.js'

describe('askFlagFragment', () => {
  it('copies --node and --fn for an ordinary POSIX path', () => {
    expect(askFlagFragment('lib/session.ts', 'getSession')).toBe(
      '--node lib/session.ts --fn getSession',
    )
  })

  it('single-quotes a path that contains whitespace, zsh-style', () => {
    expect(askFlagFragment('Future landing page/app.ts', 'boot')).toBe(
      "--node 'Future landing page/app.ts' --fn boot",
    )
  })

  it('quotes a whitespace path that contains an apostrophe', () => {
    expect(askFlagFragment("O'Brien page/app.ts", 'boot')).toBe(
      "--node 'O'\\''Brien page/app.ts' --fn boot",
    )
  })

  it('omits --fn when the symbol is missing so a typo is never copied', () => {
    expect(askFlagFragment('lib/session.ts')).toBe('--node lib/session.ts')
    expect(askFlagFragment('lib/session.ts', '')).toBe('--node lib/session.ts')
    expect(askFlagFragment('Future landing page/app.ts')).toBe("--node 'Future landing page/app.ts'")
    expect(askFlagFragment('lib/session.ts', chosenAskFn(['getSession'], 'getSeshun'))).toBe(
      '--node lib/session.ts',
    )
  })

  it('does not wrap ordinary relative paths in quotes and does not invent a repo root', () => {
    const fragment = askFlagFragment('packages/cli/src/ask.ts', 'resolveUnderRoot')
    expect(fragment).toBe('--node packages/cli/src/ask.ts --fn resolveUnderRoot')
    expect(fragment.startsWith('codeville ask')).toBe(false)
    expect(fragment).not.toContain('/Users/')
    expect(fragment).not.toMatch(/(?:^|\s)\.(?:\/|\s|$)/)
  })
})

describe('chosenAskFn', () => {
  it('returns only names that are in the file symbol list', () => {
    expect(chosenAskFn(['getSession'], 'getSession')).toBe('getSession')
    expect(chosenAskFn(['getSession'], '')).toBeUndefined()
    expect(chosenAskFn(['getSession'], 'getSeshun')).toBeUndefined()
  })
})
