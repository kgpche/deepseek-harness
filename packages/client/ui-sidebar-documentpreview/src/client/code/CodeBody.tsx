/** Incrementally highlighted source; the document owner supplies the accumulated text and wrap preference. */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { DocumentFindMarks, DocumentPreviewProps } from '../document/contract.ts'
import { buildFindRanges } from './find-ranges.ts'
import type {} from './locales.ts'
import css from './CodeBody.module.css'

/** Document owner props and this renderer's localized controls. */
export type CodeBodyProps = DocumentPreviewProps & PropsLocale<'sidebarCodePreview'>

/**
 * The find marks as per-line data attributes: the code renderer marks whole
 * lines (shiki owns the tokens inside them), the current match strongest.
 * @param find - the owner's live find marks.
 * @returns the callback CodeBlock applies per line, or undefined with no marks.
 */
function lineDataOf(find: DocumentFindMarks | undefined): ((line: number) => Record<string, string> | undefined) | undefined {
  if (find === undefined || find.spansByLine.size === 0) return undefined
  return (line: number) => {
    const hit = find.spansByLine.has(line)
    const current = find.currentLine === line
    if (!hit && !current) return undefined
    if (current) return { 'code-find-current': '', 'code-find-hit': '' }
    return { 'code-find-hit': '' }
  }
}

/** @param props - accumulated document contents and framework props. @returns one stable CodeBlock, or no body for byte contents. */
export function CodeBody({ resourceAddress, content, wrap, scrollportRef, find, t }: CodeBodyProps): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Content-level find marks as Ranges: rebuilt whenever the marks change and
  // whenever shiki swaps its tree (a mutation, not a prop change), and cleared
  // on every path out. Environments without CSS.highlights skip the fill and
  // keep the line-level marks.
  const marksKey = find === undefined || find.spansByLine.size === 0 ? '' : `${find.spansByLine.size}:${find.currentLine ?? 0}:${content.kind === 'text' ? content.text.length : 0}`
  useEffect(() => {
    const root = rootRef.current
    if (root === null || find === undefined || find.spansByLine.size === 0) return
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    const apply = (): void => {
      const built = buildFindRanges(root, find.spansByLine, find.currentLine)
      const others = built.filter(mark => !mark.current).map(mark => mark.range)
      const current = built.filter(mark => mark.current).map(mark => mark.range)
      if (others.length > 0) CSS.highlights.set('dsh-find-hit', new Highlight(...others))
      else CSS.highlights.delete('dsh-find-hit')
      if (current.length > 0) CSS.highlights.set('dsh-find-current', new Highlight(...current))
      else CSS.highlights.delete('dsh-find-current')
    }
    apply()
    // The settled shiki HTML swaps the streamed tree without a prop change.
    const observer = new MutationObserver(() => { apply() })
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      CSS.highlights.delete('dsh-find-hit')
      CSS.highlights.delete('dsh-find-current')
    }
    // The key changes when marks or content move; find itself is memo-stable per owner render.
  }, [marksKey, find])
  // The address check stays ahead of everything: a malformed address throws
  // before any work, as the type's own contract promises.
  const file = parseFileAddress(resourceAddress)
  if (file === undefined) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`)
  if (content.kind !== 'text') return null
  const language = languageForPath(file.path)
  return (
    <div ref={rootRef} className={css.renderer} data-code-preview data-wrap={wrap}>
      <CodeBlock
        className={css.code}
        contentRef={scrollportRef}
        code={content.text}
        lang={language}
        streaming={!content.eof}
        wrap={wrap}
        lineNumbers
        lineData={lineDataOf(find)}
        copyLabel={t('copy')}
        copiedLabel={t('copied')}
        toolbarLabels={{ codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') }}
      />
    </div>
  )
}
