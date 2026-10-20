/** Range construction for the code body's content-level find marks. */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { buildFindRanges } from '../src/client/code/find-ranges.ts'

afterEach(cleanup)

/** A shiki-shaped line: match ranges may straddle token spans. */
function tree(lines: readonly string[]): HTMLElement {
  const root = render(createElement('div', {}, ...lines.map(line =>
    createElement('span', { className: 'line' }, line)))).container.firstElementChild as HTMLElement
  return root
}

describe('buildFindRanges', () => {
  it('builds one range per span over the line text, straddling token nodes', () => {
    const root = render(createElement('div', {}, createElement('span', { className: 'line' },
      createElement('span', { style: { color: 'red' } }, 'ab'),
      createElement('span', { style: { color: 'blue' } }, 'cd'),
      'ef'))).container.firstElementChild as HTMLElement
    const marks = buildFindRanges(root, new Map([[1, [{ start: 1, end: 5 }, { start: 5, end: 6 }]]]), undefined)
    expect(marks.map(mark => mark.range.toString())).toEqual(['bcde', 'f'])
    expect(marks.every(mark => !mark.current)).toBe(true)
  })

  it('marks the current line and skips unrendered lines', () => {
    const root = tree(['one', 'two'])
    const marks = buildFindRanges(root, new Map([[2, [{ start: 0, end: 3 }]], [5, [{ start: 0, end: 2 }]]]), 2)
    expect(marks).toHaveLength(1)
    expect(marks[0]?.current).toBe(true)
    expect(marks[0]?.range.toString()).toBe('two')
  })

  it('drops a span the rendered text no longer reaches', () => {
    const root = tree(['ab'])
    expect(buildFindRanges(root, new Map([[1, [{ start: 0, end: 9 }]]]), undefined)).toHaveLength(0)
  })
})
