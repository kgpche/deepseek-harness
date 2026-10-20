/**
 * Frameless-window control IPC, for the client-drawn controls platforms without
 * a native title bar need. Every handler serves only a top-frame sender of a
 * live BrowserWindow; `close` rides the window's normal close path, so the
 * close-to-quit confirmation on Linux still runs.
 */
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { DESKTOP_IPC, assertDesktopSender } from './ipc.ts'

/** The live window a control call names, or a throw for any other sender. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const found = BrowserWindow.fromWebContents(event.sender)
  if (found === null || found.isDestroyed() || event.sender !== found.webContents
    || event.senderFrame !== found.webContents.mainFrame) throw new Error('desktop window: rejected sender')
  assertDesktopSender(event, ['app'])
  return found
}

/**
 * Register the window-control handlers.
 * @returns disposal that removes every handler this installed.
 */
export function installWindowControls(): () => void {
  const channels: readonly string[] = [DESKTOP_IPC.windowMinimize, DESKTOP_IPC.windowToggleMaximize, DESKTOP_IPC.windowClose]
  ipcMain.handle(DESKTOP_IPC.windowMinimize, (event) => { senderWindow(event).minimize() })
  ipcMain.handle(DESKTOP_IPC.windowToggleMaximize, (event) => {
    const window = senderWindow(event)
    if (window.isFullScreen()) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle(DESKTOP_IPC.windowClose, (event) => { senderWindow(event).close() })
  return () => { for (const channel of channels) ipcMain.removeHandler(channel) }
}
