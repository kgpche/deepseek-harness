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

/** The macOS glyphs, drawn as vectors: the shell fonts render these code points full-width or not at all. */
const glyph = {
  /** Close: two crossing diagonals. */
  close: (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1.2 1.2l5.6 5.6M6.8 1.2L1.2 6.8" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  ),
  /** Minimize: one short horizontal stroke, optically centered. */
  minimize: (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  ),
  /** Zoom: two filled triangles pointing outward along the diagonal, the NE/SW pair. */
  maximize: (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M7.4 0.6v3.2L4.2 0.6zM0.6 7.4V4.2l3.2 3.2z" fill="currentColor" />
    </svg>
  ),
}

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
        <span className={css.windowGlyph} aria-hidden="true">{glyph.close}</span>
      </button>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowMinimize}`}
        aria-label={t('window.minimize')}
        title={t('window.minimize')}
        data-window-control="minimize"
        onClick={() => { void desktop.minimize() }}
      >
        <span className={css.windowGlyph} aria-hidden="true">{glyph.minimize}</span>
      </button>
      <button
        type="button"
        className={`${css.windowButton} ${css.windowMaximize}`}
        aria-label={t('window.maximize')}
        title={t('window.maximize')}
        data-window-control="maximize"
        onClick={() => { void desktop.toggleMaximize() }}
      >
        <span className={css.windowGlyph} aria-hidden="true">{glyph.maximize}</span>
      </button>
    </div>
  )
}
