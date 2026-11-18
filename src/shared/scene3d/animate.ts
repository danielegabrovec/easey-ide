// Animazioni semplici della scena (gira, fluttua, pulsa, orbita): una funzione pura del tempo, usata
// dallo Studio 3D e copiata identica nel codice generato (ANIMATE_SOURCE), così si muovono uguali.
import type { AnimationSpec, Vec3 } from './model'

export interface Pose {
  position: Vec3
  /** Radianti. */
  rotation: Vec3
  scale: Vec3
}

const DEG = Math.PI / 180

/** Posa a riposo: la trasformazione scritta nel documento (rotazione convertita in radianti). */
export function restPose(position: Vec3, rotationDeg: Vec3, scale: Vec3): Pose {
  return { position: [...position], rotation: [rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG], scale: [...scale] }
}

/** Posa al tempo `t` (secondi) per l'animazione data, partendo dalla posa a riposo. */
export function animatedPose(rest: Pose, animation: AnimationSpec, t: number): Pose {
  const phase = t * animation.speed * Math.PI * 2
  const p: Vec3 = [...rest.position]
  const r: Vec3 = [...rest.rotation]
  const s: Vec3 = [...rest.scale]
  switch (animation.kind) {
    case 'spin':
      r[1] += phase
      break
    case 'float':
      p[1] += Math.sin(phase) * 0.25
      break
    case 'pulse': {
      const k = 1 + Math.sin(phase) * 0.08
      s[0] *= k
      s[1] *= k
      s[2] *= k
      break
    }
    case 'orbit': {
      const radius = Math.hypot(p[0], p[2])
      const start = Math.atan2(p[2], p[0])
      p[0] = Math.cos(start + phase) * radius
      p[2] = Math.sin(start + phase) * radius
      break
    }
    case 'none':
      break
  }
  return { position: p, rotation: r, scale: s }
}

/** La stessa funzione in JavaScript semplice, per il codice generato (tenuta allineata da un test). */
export const ANIMATE_SOURCE = `function anima(o, kind, speed, t) {
  const phase = t * speed * Math.PI * 2
  const b = o.userData.riposo
  o.position.set(b.p[0], b.p[1], b.p[2])
  o.rotation.set(b.r[0], b.r[1], b.r[2])
  o.scale.set(b.s[0], b.s[1], b.s[2])
  if (kind === 'spin') o.rotation.y += phase
  else if (kind === 'float') o.position.y += Math.sin(phase) * 0.25
  else if (kind === 'pulse') o.scale.multiplyScalar(1 + Math.sin(phase) * 0.08)
  else if (kind === 'orbit') {
    const radius = Math.hypot(b.p[0], b.p[2])
    const start = Math.atan2(b.p[2], b.p[0])
    o.position.x = Math.cos(start + phase) * radius
    o.position.z = Math.sin(start + phase) * radius
  }
}`

/** C'è almeno un oggetto animato (serve il ciclo continuo di disegno)? */
export const hasAnimations = (objects: ReadonlyArray<{ animation: AnimationSpec; visible: boolean }>): boolean =>
  objects.some((o) => o.visible && o.animation.kind !== 'none' && o.animation.speed !== 0)
