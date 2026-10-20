/**
 * The find bar: VSCode's Ctrl+F over the pages the body holds.
 *
 * The bar owns nothing but its timing. Query and flags live in the store, so a
 * remounting body restores them, and the run itself goes through the face; the
 * bar debounces typing, runs immediately on Enter, and steps through settled
 * matches. Enter/Escape and the Alt toggles are handled here rather than the
 * shortcut catalog: they belong to the input, not the page.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FindState } from './store.ts'
import css from './TextPreview.module.css'

/** The find bar's inputs: the live state and what changes it. */
export interface FindBarProps {
  /** The tab's find state: query, flags, settled matches, current index. */
  readonly find: FindState
  /** The open counter, bumped whenever the bar should focus its input. */
  readonly focusRequest: number
  /** @param query - the query text the bar now holds. */
  readonly onQuery: (query: string) => void
  /** @param flag - the matching flag the bar toggled. */
  readonly onToggle: (flag: 'caseSensitive' | 'regex') => void
  /** Run the current query now, skipping the typing debounce. */
  readonly onRun: () => void
  /** @param delta - step direction: `1` forward, `-1` back. */
  readonly onStep: (delta: 1 | -1) => void
  /** Close the bar. */
  readonly onClose: () => void
  /** Namespace-bound translate. */
  readonly t: TranslateNS<'sidebarDocumentPreview'>
}

/** How long the bar waits after a keystroke before running the query. */
const FIND_DEBOUNCE_MS = 200

/** @param props - find state, its mutations, and copy. @returns the find bar over the body's top right. */
export function FindBar({ find, focusRequest, onQuery, onToggle, onRun, onStep, onClose, t }: FindBarProps): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusRequest])
  // The typing debounce: one timer per keystroke, replaced by the next. The
  // timer fires the latest run, not the one this render closed over, because
  // the store's query only reaches the props on the next commit.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const runRef = useRef(onRun)
  runRef.current = onRun
  useEffect(() => () => { clearTimeout(timer.current) }, [])
  const edited = (query: string): void => {
    onQuery(query)
    clearTimeout(timer.current)
    if (query.length === 0) return
    timer.current = setTimeout(() => { runRef.current() }, FIND_DEBOUNCE_MS)
  }
  const count = find.matches.length > 0
    ? `${find.index + 1} / ${find.matches.length}${find.truncated ? '+' : ''}`
    : find.query.length > 0 ? t('find.none') : ''
  return (
    <div className={css.findBar} data-textpreview-find-bar>
      <input
        ref={inputRef}
        type="text"
        className={css.findInput}
        value={find.query}
        placeholder={t('find.placeholder')}
        aria-label={t('find.aria')}
        data-textpreview-find-input
        spellCheck={false}
        onChange={(event) => { edited(event.target.value) }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            if (find.matches.length > 0) onStep(event.shiftKey ? -1 : 1)
            else onRun()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
            return
          }
          if (event.altKey) {
            const key = event.key.toLowerCase()
            if (key === 'c') { event.preventDefault(); onToggle('caseSensitive'); return }
            if (key === 'r') { event.preventDefault(); onToggle('regex'); return }
          }
        }}
      />
      <span className={css.findCount} data-textpreview-find-count={count}>{count}</span>
      {find.failure !== undefined && (
        <span className={clsx(css.findCount, css.findError)} data-textpreview-find-error>{t('find.failed')}</span>
      )}
      <button
        type="button"
        className={clsx(css.findToggle, find.caseSensitive && css.findToggleOn)}
        aria-pressed={find.caseSensitive}
        aria-label={t('find.caseSensitive')}
        title={t('find.caseSensitive')}
        data-textpreview-find-case
        onClick={() => { onToggle('caseSensitive') }}
      >
        Aa
      </button>
      <button
        type="button"
        className={clsx(css.findToggle, find.regex && css.findToggleOn)}
        aria-pressed={find.regex}
        aria-label={t('find.regex')}
        title={t('find.regex')}
        data-textpreview-find-regex
        onClick={() => { onToggle('regex') }}
      >
        .*
      </button>
      <button
        type="button"
        className={css.findTool}
        aria-label={t('find.previous')}
        title={t('find.previous')}
        data-textpreview-find-previous
        onClick={() => { onStep(-1) }}
      >
        ↑
      </button>
      <button
        type="button"
        className={css.findTool}
        aria-label={t('find.next')}
        title={t('find.next')}
        data-textpreview-find-next
        onClick={() => { onStep(1) }}
      >
        ↓
      </button>
      <button
        type="button"
        className={css.findTool}
        aria-label={t('find.close')}
        title={t('find.close')}
        data-textpreview-find-close
        onClick={onClose}
      >
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
  )
}
