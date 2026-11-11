// Unico punto di registrazione dei gestori IPC. Ogni canale è tipizzato da @shared/contracts/ipc.
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { EventChannel, EventChannels, InvokeChannel, InvokeChannels } from '@shared/contracts/ipc'

export type Handlers = {
  [K in InvokeChannel]: (...args: Parameters<InvokeChannels[K]>) => ReturnType<InvokeChannels[K]> | Promise<Awaited<ReturnType<InvokeChannels[K]>>>
}

export function registerHandlers(handlers: Handlers, isTrusted: (event: IpcMainInvokeEvent) => boolean): void {
  for (const channel of Object.keys(handlers) as InvokeChannel[]) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!isTrusted(event)) throw new Error('Richiesta rifiutata: origine non autorizzata.')
      const handler = handlers[channel] as (...a: unknown[]) => unknown
      return handler(...args)
    })
  }
}

export function broadcast<K extends EventChannel>(channel: K, payload: EventChannels[K]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}
