/** Plain source display for files without a more specific document renderer. */
import type { CSSProperties } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { linesOf } from './lines.ts'
import css from '../TextPreview.module.css'

/** One slice of a line between find spans, carrying whether it is a hit. */
interface Segment { readonly text: string; readonly hit: boolean }

/**
 * Split one line by its match spans into alternating segments.
 * @param text - the line's text.
 * @param spans - the line's match spans, non-overlapping and in order.
 * @returns the segments in order; the whole line when there are no spans.
 */
function segmentsOf(text: string, spans: readonly { readonly start: number; readonly end: number }[] | undefined): readonly Segment[] {
  if (spans === undefined || spans.length === 0) return [{ text, hit: false }]
  const segments: Segment[] = []
  let at = 0
  for (const { start, end } of spans) {
    if (start > at) segments.push({ text: text.slice(at, start), hit: false })
    segments.push({ text: text.slice(start, end), hit: true })
    at = end
  }
  if (at < text.length) segments.push({ text: text.slice(at), hit: false })
  return segments
}

/** @param props - document contents and standard tab information. @returns source lines with a numbered gutter and navigation targets. */
export function TextBody({ content, find, useTabInfo }: DocumentPreviewProps): ReactNode {
  const { tab } = useTabInfo()
  const params = tab.navigation.params
  const target = params !== undefined && 'line' in params ? params.line : undefined
  if (content.kind !== 'text') return null
  // The gutter fits the largest loaded line number, shared by every page.
  const last = content.pages.reduce((max, page) => Math.max(max, page.offset + page.lines - 1), 0)
  const digits = Math.max(2, String(Math.max(last, 1)).length)
  return (
    <div
      className={css.textDocument}
      data-textpreview-plain
      style={{ '--dsw-plain-line-no-width': `${digits}ch` } as CSSProperties}
    >
      {content.pages.map(page => (
        <pre
          key={page.offset}
          className={css.page}
          data-textpreview-page={page.offset}
          style={{ counterReset: `textpreview-line ${page.offset - 1}` } as CSSProperties}
        >
          {linesOf(page).map((text, index) => {
            const number = page.offset + index
            const current = find?.currentLine === number
            return (
              <div
                key={number}
                className={clsx(css.line, current && css.findLine)}
                data-textpreview-line={number}
                {...number === target ? { 'data-textpreview-target': number } : {}}
                {...current ? { 'data-textpreview-find-current': number } : {}}
              >
                {segmentsOf(text, find?.spansByLine.get(number)).map((segment, segmentIndex) => segment.hit
                  ? (
                    <span key={segmentIndex} className={clsx(css.findHit, current && css.findHitCurrent)} data-textpreview-find-hit>
                      {segment.text}
                    </span>
                  )
                  : <span key={segmentIndex}>{segment.text}</span>)}
                {'\n'}
              </div>
            )
          })}
        </pre>
      ))}
    </div>
  )
}
