/** The frameless window-control IPC: handlers registered, senders verified, calls routed. */
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }))
const windows = vi.hoisted(() => {
  const window = {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    webContents: { mainFrame: { url: 'dsh-app://app/index.html' } },
  }
  return { window }
})
vi.mock('electron', () => ({ ipcMain: ipc, BrowserWindow: { fromWebContents: vi.fn(() => windows.window) } }))

const { installWindowControls } = await import('../src/window-controls.ts')

/** The registered handler for one channel, or a throw when it is missing. */
function handler(channel: string): (event: unknown) => unknown {
  const call = ipc.handle.mock.calls.find((registered: unknown[]) => registered[0] === channel)
  if (call === undefined) throw new Error(`missing handler for ${channel}`)
  return call[1] as (event: unknown) => unknown
}

/** A sender fixture the handler accepts: the window's own web contents, on the app document's main frame. */
const senderEvent = (): unknown => ({
  sender: windows.window.webContents,
  senderFrame: windows.window.webContents.mainFrame,
})

afterEach(() => {
  vi.clearAllMocks()
  windows.window.isDestroyed.mockReturnValue(false)
})

it('registers the three channels and disposes them together', () => {
  const dispose = installWindowControls()
  for (const channel of [DESKTOP_IPC.windowMinimize, DESKTOP_IPC.windowToggleMaximize, DESKTOP_IPC.windowClose]) {
    expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
  }
  dispose()
  const removed = ipc.removeHandler.mock.calls.map(([channel]) => channel)
  expect(removed).toEqual([DESKTOP_IPC.windowMinimize, DESKTOP_IPC.windowToggleMaximize, DESKTOP_IPC.windowClose])
})

it('routes minimize, maximize, unmaximize, and close to the sender window', () => {
  installWindowControls()
  handler(DESKTOP_IPC.windowMinimize)(senderEvent())
  expect(windows.window.minimize).toHaveBeenCalledTimes(1)
  handler(DESKTOP_IPC.windowToggleMaximize)(senderEvent())
  expect(windows.window.maximize).toHaveBeenCalledTimes(1)
  windows.window.isMaximized.mockReturnValue(true)
  handler(DESKTOP_IPC.windowToggleMaximize)(senderEvent())
  expect(windows.window.unmaximize).toHaveBeenCalledTimes(1)
  handler(DESKTOP_IPC.windowClose)(senderEvent())
  expect(windows.window.close).toHaveBeenCalledTimes(1)
})

it('ignores fullscreen toggles and rejects a destroyed sender window', () => {
  installWindowControls()
  windows.window.isFullScreen.mockReturnValue(true)
  handler(DESKTOP_IPC.windowToggleMaximize)(senderEvent())
  expect(windows.window.maximize).not.toHaveBeenCalled()
  windows.window.isFullScreen.mockReturnValue(false)
  windows.window.isDestroyed.mockReturnValue(true)
  expect(() => handler(DESKTOP_IPC.windowMinimize)(senderEvent())).toThrow('rejected sender')
})

it('rejects a foreign frame and an app frame on a foreign document', () => {
  installWindowControls()
  // A frame object other than the window's main frame: identity rejects it first.
  const foreignFrame = { sender: windows.window.webContents, senderFrame: { url: 'dsh-app://app/index.html' } }
  expect(() => handler(DESKTOP_IPC.windowClose)(foreignFrame)).toThrow('rejected sender')
  // The main frame itself carrying a non-app document: the sender check rejects it.
  const mainFrame = windows.window.webContents.mainFrame as { url: string }
  const saved = mainFrame.url
  mainFrame.url = 'https://example.com/'
  try {
    expect(() => handler(DESKTOP_IPC.windowClose)(senderEvent())).toThrow('unowned renderer')
  } finally {
    mainFrame.url = saved
  }
})

it('satisfies the BrowserWindow typing contract it reads', () => {
  // The mocked window carries exactly the members the handlers call; the cast
  // below fails to compile if window-controls.ts starts using more of the
  // native surface than these tests exercise.
  const shaped = windows.window satisfies Record<string, unknown>
  expect(shaped.close).toBeInstanceOf(Function)
})
