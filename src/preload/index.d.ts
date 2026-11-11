import type { IdeBridge } from '../shared/contracts/ipc'

declare global {
  interface Window {
    ide: IdeBridge
  }
}

export {}
