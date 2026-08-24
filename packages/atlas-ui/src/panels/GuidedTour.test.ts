import { describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { GuidedTour } from './GuidedTour.js'
import type { TourChapter } from '../tour.js'

type AnyElement = ReactElement<Record<string, any>>

const chapters: TourChapter[] = [
  {
    kind: 'area',
    id: 'area:app',
    title: 'Application',
    note: '2 nodes in the visible slice.',
    nodeIds: ['a', 'b'],
    linkKeys: ['import\0a\0b'],
  },
  {
    kind: 'all',
    id: 'all',
    title: 'Whole visible system',
    note: 'Every node and link in the whole visible slice.',
    nodeIds: ['a', 'b'],
    linkKeys: ['import\0a\0b'],
  },
]

function walk(node: ReactNode, seen: AnyElement[] = []): AnyElement[] {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return seen
  if (Array.isArray(node)) {
    for (const child of node) walk(child, seen)
    return seen
  }
  if (typeof node !== 'object' || !('type' in node)) return seen
  const element = node as AnyElement
  seen.push(element)
  if (typeof element.type === 'function') walk((element.type as (props: Record<string, any>) => ReactNode)(element.props), seen)
  else walk(element.props?.children, seen)
  return seen
}

function texts(elements: AnyElement[]): string[] {
  return elements.flatMap((element) => {
    const children = element.props?.children
    if (typeof children === 'string') return [children]
    if (Array.isArray(children)) return children.filter((child): child is string => typeof child === 'string')
    return []
  })
}

function textContent(value: ReactNode): string {
  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textContent).join('')
  if (typeof value === 'object' && 'type' in value) return textContent((value as AnyElement).props?.children)
  return ''
}

describe('GuidedTour', () => {
  it('renders an inactive start control and invokes onStart', () => {
    const onStart = vi.fn()
    const elements = walk(GuidedTour({ chapters, index: null, onStart, onMove: vi.fn(), onExit: vi.fn() }))
    const start = elements.find((element) => element.type === 'button' && element.props.children === 'Start guided tour')
    expect(start).toBeDefined()
    start?.props.onClick()
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('renders the first active chapter with live note and bounded controls', () => {
    const elements = walk(GuidedTour({ chapters, index: 0, onStart: vi.fn(), onMove: vi.fn(), onExit: vi.fn() }))
    expect(textContent(elements.find((element) => element.type === 'strong')?.props.children)).toBe('Chapter 1 of 2')
    expect(texts(elements)).toContain('Application')
    expect(texts(elements)).toContain('2 nodes in the visible slice.')
    const live = elements.find((element) => element.props['aria-live'] === 'polite')
    expect(live).toBeDefined()
    const back = elements.find((element) => element.type === 'button' && element.props.children === 'Back')
    const next = elements.find((element) => element.type === 'button' && element.props.children === 'Next')
    expect(back?.props.disabled).toBe(true)
    expect(next?.props.disabled).toBe(false)
  })

  it('disables next on the last chapter and bounds navigation callbacks', () => {
    const onMove = vi.fn()
    const onExit = vi.fn()
    const elements = walk(GuidedTour({ chapters, index: 1, onStart: vi.fn(), onMove, onExit }))
    const back = elements.find((element) => element.type === 'button' && element.props.children === 'Back')
    const next = elements.find((element) => element.type === 'button' && element.props.children === 'Next')
    const exit = elements.find((element) => element.type === 'button' && element.props.children === 'Exit tour')
    expect(next?.props.disabled).toBe(true)
    back?.props.onClick()
    exit?.props.onClick()
    expect(onMove).toHaveBeenCalledWith(0)
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledOnce()
  })
})
