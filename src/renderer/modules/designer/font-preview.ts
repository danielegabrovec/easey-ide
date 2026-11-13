// Anteprime dei caratteri del design kit nell'ispettore: il woff2 arriva dal main (base64) e si
// registra una volta sola nel documento dell'app con FontFace.
import { useEffect, useState } from 'react'
import { kitFont } from '@shared/design-kit/fonts'
import { ide } from '../../ipc'

const loading = new Map<string, Promise<boolean>>()

export function loadKitFont(id: string): Promise<boolean> {
  const font = kitFont(id)
  if (!font) return Promise.resolve(false)
  let promise = loading.get(id)
  if (!promise) {
    promise = ide
      .invoke('app:fontData', id)
      .then(async (base64) => {
        const weight = font.weights[0] === font.weights[1] ? String(font.weights[0]) : `${font.weights[0]} ${font.weights[1]}`
        const face = new FontFace(font.family, `url(data:font/woff2;base64,${base64})`, { weight })
        document.fonts.add(await face.load())
        return true
      })
      .catch(() => false)
    loading.set(id, promise)
  }
  return promise
}

/** true quando tutti i caratteri indicati sono pronti per l'anteprima. */
export function useKitFonts(ids: string[]): boolean {
  const key = ids.join(',')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    void Promise.all(key.split(',').filter(Boolean).map(loadKitFont)).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [key])
  return ready
}
