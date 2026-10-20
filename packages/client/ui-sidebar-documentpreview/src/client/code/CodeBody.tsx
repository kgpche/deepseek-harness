/** Incrementally highlighted source; the document owner supplies the accumulated text and wrap preference. */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { DocumentFindMarks, DocumentPreviewProps } from '../document/contract.ts'
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
  // The address check stays ahead of everything: a malformed address throws
  // before any work, as the type's own contract promises.
  const file = parseFileAddress(resourceAddress)
  if (file === undefined) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`)
  if (content.kind !== 'text') return null
  const language = languageForPath(file.path)
  return (
    <div className={css.renderer} data-code-preview data-wrap={wrap}>
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
