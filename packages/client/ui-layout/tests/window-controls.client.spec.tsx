// @vitest-environment jsdom
/** The Linux frameless window controls: platform-gated rendering and bridge calls. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { WindowControls } from '../src/client/WindowControls.tsx'

const calls: string[] = []
const desktop = { dshDesktop: { window: {
  minimize: vi.fn(async () => { calls.push('minimize') }),
  toggleMaximize: vi.fn(async () => { calls.push('toggleMaximize') }),
  close: vi.fn(async () => { calls.push('close') }),
} } } as unknown as Window

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platform
  delete (window as Partial<Window> & { dshDesktop?: unknown }).dshDesktop
  calls.length = 0
})

describe('WindowControls', () => {
  it('renders the three controls only on the Linux desktop with the bridge', () => {
    const t = (key: string): string => key
    // A plain browser page: no platform mark, no bridge, nothing drawn.
    const plain = render(<WindowControls t={t} />)
    expect(plain.container.querySelector('[data-shell-window-controls]')).toBeNull()
    plain.unmount()
    // The bridge alone, off the desktop platform, still draws nothing.
    Object.assign(window, desktop)
    const bridged = render(<WindowControls t={t} />)
    expect(bridged.container.querySelector('[data-shell-window-controls]')).toBeNull()
    bridged.unmount()
    document.documentElement.dataset.platform = 'linux'
    const linux = render(<WindowControls t={t} />)
    const buttons = [...linux.container.querySelectorAll('[data-window-control]')]
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['close', 'window.minimize', 'window.maximize'])
  })

  it('routes each control to its bridge call', () => {
    Object.assign(window, desktop)
    document.documentElement.dataset.platform = 'linux'
    const view = render(<WindowControls t={key => key} />)
    for (const control of ['close', 'minimize', 'maximize'] as const) {
      fireEvent.click(view.container.querySelector(`[data-window-control="${control}"]`)!)
    }
    expect(calls).toEqual(['close', 'minimize', 'toggleMaximize'])
  })
})
