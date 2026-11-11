// Ponte sicuro fra renderer e main: espone `window.ide` con i SOLI canali dichiarati nei contratti.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type IdeBridge } from '@shared/contracts/ipc'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

const bridge: IdeBridge = {
  invoke(channel, ...args) {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Canale non consentito: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, listener) {
    if (!eventAllowed.has(channel)) throw new Error(`Evento non consentito: ${channel}`)
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload as never)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('ide', bridge)
