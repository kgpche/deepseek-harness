/**
 * Client-drawn window controls for the frameless Linux window, as macOS
 * traffic lights: red closes, yellow minimizes, green maximizes. Windows uses
 * the native overlay controls and macOS the real traffic lights; Linux's
 * hidden title bar leaves nothing, so this trio sits in the sidebar logo
 * row's empty top band, moving nothing. The preload marks the document root's
 * platform, which is exactly the desktop case — a plain browser page has no
 * `data-platform` and shows nothing.
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

/** @param props - common copy. @returns the three traffic lights, or nothing off the Linux desktop. */
export function WindowControls({ t }: WindowControlsProps): ReactNode {
  const desktop = bridge()
  if (document.documentElement.dataset.platform !== 'linux' || desktop === undefined) return null
  return (
    <div className={css.windowControls} data-shell-window-controls>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowClose}`}
        aria-label={t('close')}
        title={t('close')}
        data-window-control="close"
        onClick={() => { void desktop.close() }}
      >
        <span className={css.windowGlyph} aria-hidden="true">✕</span>
      </button>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowMinimize}`}
        aria-label={t('window.minimize')}
        title={t('window.minimize')}
        data-window-control="minimize"
        onClick={() => { void desktop.minimize() }}
      >
        <span className={css.windowGlyph} aria-hidden="true">─</span>
      </button>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowMaximize}`}
        aria-label={t('window.maximize')}
        title={t('window.maximize')}
        data-window-control="maximize"
        onClick={() => { void desktop.toggleMaximize() }}
      >
        <span className={css.windowGlyph} aria-hidden="true">⤢</span>
      </button>
    </div>
  )
}
