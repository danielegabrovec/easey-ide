import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ANIMATE_SOURCE, animatedPose, restPose } from '@shared/scene3d/animate'
import { generateScene3DHtml, generateScene3DModule, identifierFor, topologicalOrder } from '@shared/scene3d/codegen'
import { addObject, commit, createHistory, duplicateObjects, redo, removeObjects, reparent, setEnvironment, undo, updateObject } from '@shared/scene3d/commands'
import { pickFallback, renderFallback2D, type Ctx2D } from '@shared/scene3d/fallback2d'
import { createGroup, createLight, createMesh, emptyScene3D, isScene3DPath, parseScene3D, serializeScene3D, subtreeIds } from '@shared/scene3d/model'
import { SCENE_PRESETS } from '@shared/scene3d/presets'
import { STARS_SOURCE, starPositions } from '@shared/scene3d/stars'
import { SceneSync, structuralSignature } from '@shared/scene3d/three-sync'

function sceneWithCube() {
  const doc = emptyScene3D('Prova')
  const cube = createMesh(doc, 'box')
  return { doc: addObject(doc, cube), cube }
}

describe('modello e file', () => {
  it('scena vuota con due luci, ida e ritorno dal JSON', () => {
    const doc = emptyScene3D()
    expect(doc.objects.map((o) => o.light?.kind)).toEqual(['ambient', 'directional'])
    const parsed = parseScene3D(serializeScene3D(doc))
    expect(parsed.ok && parsed.doc).toEqual(doc)
    expect(isScene3DPath('scene/Casa.Scene3D.json')).toBe(true)
  })

  it('valori sbagliati prendono il default, errori gravi in italiano', () => {
    const r = parseScene3D(JSON.stringify({ objects: [{ id: 'a', kind: 'mesh', geometry: { kind: 'boh' }, material: { color: 'rosso' }, position: [1, 'x', 3] }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.objects[0].geometry!.kind).toBe('box')
    expect(r.doc.objects[0].material!.color).toBe('#6d7cff')
    expect(r.doc.objects[0].position).toEqual([0, 0, 0])
    expect(parseScene3D('{').ok).toBe(false)
    expect(parseScene3D(JSON.stringify({ objects: [{ id: 'a' }, { id: 'a' }] }))).toEqual({ ok: false, error: 'L\'id "a" compare due volte.' })
  })

  it('genitori mancanti o in ciclo tornano alla radice', () => {
    const r = parseScene3D(JSON.stringify({ objects: [{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'zz' }] }))
    expect(r.ok && r.doc.objects.map((o) => o.parent)).toEqual([null, 'a', null])
  })

  it('id e nomi unici', () => {
    const { doc, cube } = sceneWithCube()
    const second = createMesh(doc, 'box')
    expect(cube.id).toBe('cubo-1')
    expect(second.id).toBe('cubo-2')
    expect(second.name).toBe('Cubo 2')
  })
})

describe('comandi e annulla', () => {
  it('aggiorna unendo i sotto-oggetti; nessun cambiamento = stesso documento', () => {
    const { doc, cube } = sceneWithCube()
    const next = updateObject(doc, cube.id, { material: { color: '#ff0000' }, geometry: { params: { width: 2 } } })
    const o = next.objects.find((x) => x.id === cube.id)!
    expect(o.material!.color).toBe('#ff0000')
    expect(o.material!.roughness).toBe(0.45)
    expect(o.geometry!.params).toEqual({ width: 2, height: 1, depth: 1 })
    expect(updateObject(next, cube.id, { material: { color: '#ff0000' } })).toBe(next)
  })

  it('gruppi: sposta dentro, rifiuta i cicli, toglie con i figli, duplica con i figli', () => {
    let { doc, cube } = sceneWithCube()
    const group = createGroup(doc)
    doc = addObject(doc, group)
    doc = reparent(doc, cube.id, group.id)
    expect(doc.objects.find((o) => o.id === cube.id)!.parent).toBe(group.id)
    expect(reparent(doc, group.id, cube.id)).toBe(doc)
    expect(subtreeIds(doc, group.id)).toEqual([group.id, cube.id])
    const dup = duplicateObjects(doc, [group.id])
    const copy = dup.doc.objects.find((o) => o.id === dup.ids[0])!
    expect(copy.name).toBe('Gruppo 2')
    expect(dup.doc.objects.filter((o) => o.parent === copy.id)).toHaveLength(1)
    expect(removeObjects(doc, [group.id]).objects.some((o) => o.id === cube.id)).toBe(false)
  })

  it('annulla esatto anche per campi aggiunti; coalesce; limite', () => {
    const { doc, cube } = sceneWithCube()
    let h = createHistory(doc)
    const withFog = setEnvironment(doc, { fog: { color: '#000000', near: 1, far: 9 } })
    h = commit(h, withFog)
    h = commit(h, updateObject(h.present, cube.id, { position: [1, 0, 0] }))
    h = commit(h, updateObject(h.present, cube.id, { position: [2, 0, 0] }), true)
    expect(h.past).toHaveLength(2)
    h = undo(h)
    expect(h.present).toBe(withFog)
    h = undo(h)
    expect(h.present.fog).toBeNull()
    h = redo(redo(h))
    expect(h.present.objects.find((o) => o.id === cube.id)!.position).toEqual([2, 0, 0])
    expect(commit(h, h.present)).toBe(h)
  })
})

describe('animazioni e stelle: il codice generato fa la stessa cosa', () => {
  it('ANIMATE_SOURCE coincide con animatedPose', () => {
    // eslint-disable-next-line no-new-func
    const anima = new Function(`${ANIMATE_SOURCE}; return anima`)() as (o: THREE.Object3D, k: string, s: number, t: number) => void
    for (const kind of ['spin', 'float', 'pulse', 'orbit'] as const) {
      const rest = restPose([1.5, 0.5, -2], [10, 20, 30], [1, 2, 1])
      const o = new THREE.Object3D()
      o.userData.riposo = { p: rest.position, r: rest.rotation, s: rest.scale }
      anima(o, kind, 0.3, 1.7)
      const pose = animatedPose(rest, { kind, speed: 0.3 }, 1.7)
      expect(o.position.toArray().map((v) => +v.toFixed(6))).toEqual(pose.position.map((v) => +v.toFixed(6)))
      expect([o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(6))).toEqual(pose.rotation.map((v) => +v.toFixed(6)))
      expect(o.scale.toArray().map((v) => +v.toFixed(6))).toEqual(pose.scale.map((v) => +v.toFixed(6)))
    }
  })

  it('STARS_SOURCE coincide con starPositions', () => {
    // eslint-disable-next-line no-new-func
    const stelle = new Function(`${STARS_SOURCE}; return stelle`)() as (c: number, r: number) => Float32Array
    expect(Array.from(stelle(50, 10))).toEqual(Array.from(starPositions(50, 10)))
  })
})

describe('sincronizzazione con Three', () => {
  it('costruisce, aggiorna sul posto, ricostruisce se cambia la struttura, libera ciò che sparisce', () => {
    let { doc, cube } = sceneWithCube()
    const scene = new THREE.Scene()
    const sync = new SceneSync(scene)
    sync.sync(doc)
    const mesh = sync.get(cube.id) as THREE.Mesh
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(scene.children).toHaveLength(3)
    doc = updateObject(doc, cube.id, { position: [3, 0, 0], material: { color: '#00ff00' } })
    sync.sync(doc)
    expect(sync.get(cube.id)).toBe(mesh)
    expect(mesh.position.x).toBe(3)
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('00ff00')
    const before = structuralSignature(doc.objects.find((o) => o.id === cube.id)!)
    doc = updateObject(doc, cube.id, { material: { kind: 'toon' } })
    expect(structuralSignature(doc.objects.find((o) => o.id === cube.id)!)).not.toBe(before)
    sync.sync(doc)
    expect(sync.get(cube.id)).not.toBe(mesh)
    expect((sync.get(cube.id) as THREE.Mesh).material).toBeInstanceOf(THREE.MeshToonMaterial)
    sync.sync(removeObjects(doc, [cube.id]))
    expect(sync.get(cube.id)).toBeUndefined()
    expect(scene.children).toHaveLength(2)
  })

  it('i figli seguono il gruppo e il raggio trova l’oggetto del documento', () => {
    let { doc, cube } = sceneWithCube()
    const group = createGroup(doc, { position: [0, 0, -5] })
    doc = reparent(addObject(doc, group), cube.id, group.id)
    const scene = new THREE.Scene()
    const sync = new SceneSync(scene)
    sync.sync(doc)
    expect(sync.get(cube.id)!.parent).toBe(sync.get(group.id))
    scene.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.6, 5), new THREE.Vector3(0, 0, -1))
    expect(sync.pick(ray)).toBe(cube.id)
    sync.setTime(1)
    sync.dispose()
    expect(scene.children).toHaveLength(0)
  })

  it('tutte le scene pronte si costruiscono', () => {
    for (const preset of SCENE_PRESETS) {
      const doc = preset.build()
      const sync = new SceneSync(new THREE.Scene())
      sync.sync(doc)
      expect(parseScene3D(serializeScene3D(doc))).toEqual({ ok: true, doc })
      for (const o of doc.objects) expect(sync.get(o.id), `${preset.id}/${o.id}`).toBeDefined()
    }
  })
})

describe('codice generato', () => {
  it('nomi di variabile sicuri e unici', () => {
    const used = new Set<string>()
    expect(identifierFor('Luce del sole', used)).toBe('luceDelSole')
    expect(identifierFor('Luce del sole', used)).toBe('luceDelSole2')
    expect(identifierFor('3 "pazzo" </script>', used)).toBe('o3PazzoScript')
    expect(identifierFor('scena', used)).toBe('scena2')
    expect(identifierFor('', used)).toBe('oggetto')
  })

  it('modulo leggibile con mappa oggetto→righe, genitori prima dei figli, si valuta senza errori', () => {
    const doc = SCENE_PRESETS.find((p) => p.id === 'logo')!.build()
    doc.objects.reverse()
    expect(topologicalOrder(doc)[0].parent).toBeNull()
    const out = generateScene3DModule(doc, { threeImport: '../vendor/three.module.min.js', sourcePath: 'scene/logo.scene3d.json' })
    expect(out.code).toContain("import * as THREE from \"../vendor/three.module.min.js\"")
    expect(out.code).toContain('function anima(')
    expect(out.code).toContain('export function montaScena(canvas)')
    const lines = out.code.split('\n')
    for (const o of doc.objects) {
      const { start, end } = out.map[o.id]
      expect(lines[start - 1]).toContain(`// ${o.name}`)
      expect(lines.slice(start - 1, end).join('\n')).toContain(`const ${out.names[o.id]} =`)
    }
    const anello = doc.objects.find((o) => o.name === 'Anello')!
    expect(out.code).toContain(`  logo.add(${out.names[anello.id]})`)
    // Il modulo è JavaScript valido: si esegue con un THREE vero e un canvas finto (senza WebGL non disegna).
    const body = out.code.replace(/^import .*$/m, '').replace('export function', 'function')
    expect(() => new Function('THREE', `${body}; return montaScena`)(THREE)).not.toThrow()
  })

  it('ferma() libera geometrie, materiali e ombre, poi il renderer e il suo contesto WebGL', () => {
    const doc = SCENE_PRESETS.find((p) => p.id === 'logo')!.build()
    const body = generateScene3DModule(doc).code.replace(/^import .*$/m, '').replace('export function', 'function')
    // Un renderer finto (in Node non c'è WebGL) che conta le chiamate; il resto è il THREE vero.
    const calls: string[] = []
    class FakeRenderer {
      shadowMap = { enabled: false }
      toneMapping = 0
      toneMappingExposure = 1
      setPixelRatio() {}
      setSize() {}
      render() {}
      dispose() {
        calls.push('dispose')
      }
      forceContextLoss() {
        calls.push('forceContextLoss')
      }
    }
    const fakeThree = { ...THREE, WebGLRenderer: FakeRenderer }
    const globals = globalThis as unknown as Record<string, unknown>
    const saved = { ResizeObserver: globals.ResizeObserver, requestAnimationFrame: globals.requestAnimationFrame, cancelAnimationFrame: globals.cancelAnimationFrame }
    globals.ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
    globals.requestAnimationFrame = () => 1
    globals.cancelAnimationFrame = () => undefined
    try {
      const montaScena = new Function('THREE', `${body}; return montaScena`)(fakeThree) as (canvas: unknown) => { scena: THREE.Scene; ferma: () => void }
      const { scena, ferma } = montaScena({ clientWidth: 300, clientHeight: 150 })
      const freed = new Set<unknown>()
      let resources = 0
      scena.traverse((o) => {
        const parts = [(o as THREE.Mesh).geometry, ...([] as THREE.Material[]).concat((o as THREE.Mesh).material ?? [])]
        for (const part of parts.filter(Boolean)) {
          resources++
          part!.addEventListener('dispose', () => freed.add(part))
        }
      })
      expect(resources).toBeGreaterThan(3)
      ferma()
      expect(freed.size).toBe(resources)
      expect(calls).toEqual(['dispose', 'forceContextLoss'])
    } finally {
      Object.assign(globals, saved)
    }
  })

  it('nomi con virgolette e a capo non rompono il codice; HTML con import map e senza </script> interni', () => {
    let doc = emptyScene3D('Scena "strana" </script>')
    doc = addObject(doc, createMesh(doc, 'sphere', { name: 'a\nb "c"' }))
    doc = addObject(doc, createLight(doc, 'spot'))
    const out = generateScene3DModule(doc)
    expect(() => new Function('THREE', `${out.code.replace(/^import .*$/m, '').replace('export function', 'function')}`)).not.toThrow()
    const html = generateScene3DHtml(doc, './vendor/three.module.min.js')
    expect(html).toContain('"three":"./vendor/three.module.min.js"')
    expect(html).toContain('<title>Scena &quot;strana&quot; &lt;/script&gt;</title>')
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })
})

describe('ripiego 2D', () => {
  it('disegna e trova l’oggetto sotto il clic', () => {
    const calls: string[] = []
    const ctx: Ctx2D = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      fillRect: () => calls.push('fillRect'),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => calls.push('arc'),
      closePath: () => {},
      fill: () => calls.push('fill'),
      stroke: () => {}
    }
    let doc = emptyScene3D()
    doc = { ...doc, camera: { position: [0, 0, 10], target: [0, 0, 0], fov: 45 } }
    const ball = createMesh(doc, 'sphere', { position: [0, 0, 0] })
    doc = addObject(doc, ball)
    const regions = renderFallback2D(ctx, doc, 400, 300, new Set([ball.id]))
    expect(calls[0]).toBe('fillRect')
    expect(regions).toHaveLength(1)
    expect(regions[0].x).toBeCloseTo(200)
    expect(pickFallback(regions, 200, 150)).toBe(ball.id)
    expect(pickFallback(regions, 10, 10)).toBeNull()
  })
})
