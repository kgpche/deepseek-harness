/**
 * Client-drawn window controls for the frameless Linux window. Windows uses the
 * native overlay controls and macOS the inset traffic lights; Linux's hidden
 * title bar leaves nothing, so this cluster rides the top-right corner over
 * the chrome rows that already drag the window. The preload marks the document
 * root's platform, which is exactly the desktop case — a plain browser page
 * has no `data-platform` and shows nothing.
 */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import css from './AppFrame.module.css'

/** The slice of the preload bridge the controls call. */
interface DesktopWindowBridge {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
}

const bridge = (): DesktopWindowBridge | undefined =>
  (window as Window & { dshDesktop?: { window?: DesktopWindowBridge } }).dshDesktop?.window

/** Window controls' inputs: shell copy only. */
export interface WindowControlsProps {
  /** Common-namespace translate; the three labels live there. */
  readonly t: TranslateNS<'common'>
}

/** @param props - common copy. @returns the three window controls, or nothing off the Linux desktop. */
export function WindowControls({ t }: WindowControlsProps): ReactNode {
  const desktop = bridge()
  if (document.documentElement.dataset.platform !== 'linux' || desktop === undefined) return null
  return (
    <div className={css.windowControls} data-shell-window-controls>
      <button
        type="button"
        className={css.windowButton}
        aria-label={t('window.minimize')}
        title={t('window.minimize')}
        data-window-control="minimize"
        onClick={() => { void desktop.minimize() }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button
        type="button"
        className={css.windowButton}
        aria-label={t('window.maximize')}
        title={t('window.maximize')}
        data-window-control="maximize"
        onClick={() => { void desktop.toggleMaximize() }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowClose}`}
        aria-label={t('close')}
        title={t('close')}
        data-window-control="close"
        onClick={() => { void desktop.close() }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
    </div>
  )
}
