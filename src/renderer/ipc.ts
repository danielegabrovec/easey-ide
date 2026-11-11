// Accesso tipizzato al ponte del preload. Il renderer non conosce Electron: solo `ide`.
import type { IdeBridge } from '@shared/contracts/ipc'

export const ide: IdeBridge = window.ide
