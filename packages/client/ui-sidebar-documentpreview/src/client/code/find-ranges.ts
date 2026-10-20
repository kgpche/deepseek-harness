/**
 * Content-level find marks for the code body, through the CSS Custom Highlight
 * API. Shiki owns the token spans inside a code line, so wrapping match ranges
 * in elements would fight both React reconciliation and the settled-HTML swap;
 * Ranges style the same text without touching the tree. Environments without
 * `CSS.highlights` (older browsers) keep the line-level marks and lose only
 * the in-line fill.
 */

/** One DOM range plus whether it is the current match. */
export interface FindRange { readonly range: Range; readonly current: boolean }

/**
 * Build one Range per match span over the rendered lines' text nodes.
 * @param root - the element holding one `span.line` per source line.
 * @param spansByLine - match spans by 1-based line.
 * @param currentLine - the 1-based line the current match lies on, when one is.
 * @returns the ranges in file order; a span whose line is not rendered (or
 *   whose offsets no longer align with the rendered text) contributes none.
 */
export function buildFindRanges(
  root: HTMLElement,
  spansByLine: ReadonlyMap<number, readonly { readonly start: number; readonly end: number }[]>,
  currentLine: number | undefined,
): readonly FindRange[] {
  const lines = root.querySelectorAll<HTMLElement>('span.line')
  const ranges: FindRange[] = []
  lines.forEach((line, index) => {
    const spans = spansByLine.get(index + 1)
    if (spans === undefined) return
    const current = currentLine === index + 1
    for (const { start, end } of spans) {
      const range = rangeOver(line, start, end)
      if (range !== undefined) ranges.push({ range, current })
    }
  })
  return ranges
}

/**
 * One Range over `[start, end)` code units of a line's concatenated text.
 * @param line - the rendered line element.
 * @param start - inclusive offset in the line's text.
 * @param end - exclusive offset in the line's text.
 * @returns the range, or undefined when the line's text does not reach `end`
 *   (the renderer replaced content since the matches were computed).
 */
function rangeOver(line: HTMLElement, start: number, end: number): Range | undefined {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let at = 0
  let began = false
  const range = document.createRange()
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!began && start <= at + length) {
      range.setStart(node, Math.max(0, start - at))
      began = true
    }
    if (began && end <= at + length) {
      range.setEnd(node, Math.max(0, end - at))
      return range
    }
    at += length
  }
  return undefined
}
