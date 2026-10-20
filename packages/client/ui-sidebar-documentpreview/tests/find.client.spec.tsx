// @vitest-environment jsdom
/**
 * The find bar over the text body: the command opens it in the focused body,
 * typing runs debounced, settled matches mark the plain body and land the
 * current one — loading pages until it is held — and stepping wraps.
 *
 * jsdom lays nothing out, so a line's `offsetTop` is its number times one line
 * height (the same geometry stub the navigation spec uses), letting the landing
 * scroll record itself.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceFileFind } from '@deepseek-ai/dsh-api-workspace-files/types'
import { TextPreview } from '../src/client/TextPreview.tsx'
import { harness, page, PATH, settle, TAB_ID } from './fixtures.client.ts'

const LINE_HEIGHT = 20

let offsetTop: PropertyDescriptor | undefined

beforeAll(() => {
  offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const line = this.getAttribute('data-textpreview-line')
      return line === null ? 0 : (Number(line) - 1) * LINE_HEIGHT
    },
  })
})

afterAll(() => {
  if (offsetTop !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTop)
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); cleanup() })

type MatchNote = { lineNumber: number; start: number; end: number }

const found = (matches: readonly MatchNote[], truncated = false): RemoteResult<WorkspaceFileFind> => ({
  ok: true,
  value: { absolutePath: '/host/project/work/notes.md', version: 'v1', matches: matches.map(match => ({ ...match, line: 'line text' })), truncated },
})

/** The counter's current text, read off the bar. */
const count = (container: HTMLElement): string | null =>
  container.querySelector('[data-textpreview-find-count]')?.getAttribute('data-textpreview-find-count') ?? null

/** Render one body with its first page and focus it, so the command answers here. */
async function mounted() {
  const h = harness({ 1: page(1, ['alpha here', 'no match', 'alpha again'], false) })
  const view = render(<TextPreview {...h.props()} />)
  await settle()
  const body = view.container.querySelector('[data-textpreview-body]') as HTMLElement
  // jsdom only focuses programmatically-focusable elements.
  body.setAttribute('tabindex', '-1')
  body.focus()
  const open = (): HTMLInputElement => {
    act(() => { h.findRequest.set(h.findRequest.getSnapshot() + 1) })
    return view.container.querySelector('[data-textpreview-find-input]') as HTMLInputElement
  }
  return { h, view, open }
}

describe('the find bar', () => {
  it('opens from the toolbar search control without body focus', async () => {
    const { view } = await mounted()
    // No focus anywhere in the body: the button is the shortcut-independent way in.
    await act(async () => { fireEvent.click(view.container.querySelector('[data-textpreview-tool="find"]')!) })
    const input = view.container.querySelector('[data-textpreview-find-input]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('opens on the command request in the body holding focus and closes on Escape', async () => {
    const { view, open } = await mounted()
    const input = open()
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }) })
    expect(view.container.querySelector('[data-textpreview-find-bar]')).toBeNull()
  })

  it('runs the typed query after the debounce and marks the plain body', async () => {
    const { h, view, open } = await mounted()
    const input = open()
    await act(async () => { fireEvent.change(input, { target: { value: 'alpha' } }) })
    expect(h.find).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(h.find).toHaveBeenCalledWith(expect.anything(), PATH, { query: 'alpha' }, expect.anything())
    h.find.mockReturnValue(Promise.resolve(found([{ lineNumber: 1, start: 0, end: 5 }, { lineNumber: 3, start: 0, end: 5 }])))
    await act(async () => { fireEvent.change(input, { target: { value: 'alphas' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await settle()
    expect(count(view.container)).toBe('1 / 2')
    expect(view.container.querySelectorAll('[data-textpreview-find-hit]')).toHaveLength(2)
    expect(view.container.querySelector('[data-textpreview-find-current]')?.getAttribute('data-textpreview-find-current')).toBe('1')
  })

  it('steps with wrap-around and a truncated count marker', async () => {
    const { h, view, open } = await mounted()
    const input = open()
    const hit = (lineNumber: number): MatchNote => ({ lineNumber, start: 0, end: 1 })
    h.find.mockReturnValue(Promise.resolve(found([hit(1), hit(3), hit(4)], true)))
    await act(async () => { fireEvent.change(input, { target: { value: 'a' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await settle()
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(count(view.container)).toBe('2 / 3+')
    await act(async () => { fireEvent.click(view.container.querySelector('[data-textpreview-find-next]')!) })
    await act(async () => { fireEvent.click(view.container.querySelector('[data-textpreview-find-next]')!) })
    // The last step wraps back to the first match.
    expect(count(view.container)).toBe('1 / 3+')
    await act(async () => { fireEvent.click(view.container.querySelector('[data-textpreview-find-previous]')!) })
    expect(count(view.container)).toBe('3 / 3+')
  })

  it('loads the page a beyond-the-content match needs and lands it once', async () => {
    const h = harness({ 1: page(1, ['first page'], false), 2: page(2, ['second page'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    const body = view.container.querySelector('[data-textpreview-body]') as HTMLElement
    body.setAttribute('tabindex', '-1')
    body.focus()
    act(() => { h.findRequest.set(1) })
    const input = view.container.querySelector('[data-textpreview-find-input]') as HTMLInputElement
    h.find.mockReturnValue(Promise.resolve(found([{ lineNumber: 2, start: 0, end: 3 }])))
    await act(async () => { fireEvent.change(input, { target: { value: 'hit' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await settle()
    expect(h.read).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2, expect.anything())
    const find = h.instance.getSnapshot().byTab[TAB_ID]?.find
    expect(find?.landed).toBe(0)
    // The landing scrolled the body to the match's line.
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.scrollTop).toBe(LINE_HEIGHT)
  })

  it('drops a settlement the bar has left behind and shows a failed run', async () => {
    const { h, view, open } = await mounted()
    const input = open()
    let resolveFind: ((result: RemoteResult<WorkspaceFileFind>) => void) | undefined
    h.find.mockReturnValue(new Promise<RemoteResult<WorkspaceFileFind>>((resolve) => { resolveFind = resolve }))
    await act(async () => { fireEvent.change(input, { target: { value: 'slow' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await act(async () => { fireEvent.change(input, { target: { value: 'fast' } }) })
    await act(async () => { resolveFind?.(found([{ lineNumber: 1, start: 0, end: 4 }])) })
    await settle()
    // 'slow' answered a query the bar no longer holds, so nothing settled.
    expect(count(view.container)).toBe('find.none')
    h.find.mockReturnValue(Promise.resolve({
      ok: false, error: { code: 'gateway/bad-request', message: 'bad regex', details: {} } as unknown as RemoteFailure,
    }))
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    await settle()
    expect(view.container.querySelector('[data-textpreview-find-error]')).not.toBeNull()
  })

  it('toggles case sensitivity through the bar and reruns with the next flags', async () => {
    const { h, view, open } = await mounted()
    const input = open()
    h.find.mockReturnValue(Promise.resolve(found([{ lineNumber: 1, start: 0, end: 3 }])))
    await act(async () => { fireEvent.change(input, { target: { value: 'alp' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await settle()
    await act(async () => { fireEvent.click(view.container.querySelector('[data-textpreview-find-case]')!) })
    expect(h.find).toHaveBeenLastCalledWith(expect.anything(), PATH, { query: 'alp', caseSensitive: true }, expect.anything())
  })
})
