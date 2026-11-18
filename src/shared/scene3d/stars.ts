// Stelle: punti su un guscio sferico, con un generatore casuale a seme fisso (mulberry32), così lo Studio
// e il codice generato disegnano lo stesso cielo. STARS_SOURCE è la stessa funzione in JavaScript semplice.

export function starPositions(count: number, radius: number, seed = 7): Float32Array {
  let a = seed >>> 0
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const n = Math.max(0, Math.min(20000, Math.floor(count)))
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = random() * 2 - 1
    const theta = random() * Math.PI * 2
    const r = radius * (0.6 + random() * 0.4)
    const s = Math.sqrt(1 - u * u)
    out[i * 3] = r * s * Math.cos(theta)
    out[i * 3 + 1] = r * u
    out[i * 3 + 2] = r * s * Math.sin(theta)
  }
  return out
}

export const STARS_SOURCE = `function stelle(count, radius, seed = 7) {
  let a = seed >>> 0
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const n = Math.max(0, Math.min(20000, Math.floor(count)))
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = random() * 2 - 1
    const theta = random() * Math.PI * 2
    const r = radius * (0.6 + random() * 0.4)
    const s = Math.sqrt(1 - u * u)
    out[i * 3] = r * s * Math.cos(theta)
    out[i * 3 + 1] = r * u
    out[i * 3 + 2] = r * s * Math.sin(theta)
  }
  return out
}`
