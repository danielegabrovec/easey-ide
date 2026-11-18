// Studio 3D: editor dei file `*.scene3d.json`. Barra (aggiungi, scene pronte, maniglie W/E/R,
// animazioni, codice, immagine), albero degli oggetti con trascinamento, vista 3D (un solo WebGLRenderer,
// disegno a richiesta) e ispettore. Ogni modifica è un passo di annulla/ripeti a istantanee (kit scene3d)
// e si salva da sola con la protezione del lavoro non salvato (useDeferredSave).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { Box, Camera, ChevronDown, ChevronRight, Code2, Copy, Eye, EyeOff, ImageDown, Move3d, Pause, Play, Plus, Redo2, Rotate3d, Scale3d, Sparkles, Trash2, Undo2 } from 'lucide-react'
import {
  ANIMATION_KINDS,
  ANIMATION_LABELS,
  childrenOf,
  createGroup,
  createLight,
  createMesh,
  GEOMETRY_KINDS,
  GEOMETRY_LABELS,
  LIGHT_KINDS,
  LIGHT_LABELS,
  MATERIAL_KINDS,
  MATERIAL_LABELS,
  parseScene3D,
  SCENE3D_EXTENSION,
  serializeScene3D,
  type Scene3DDocument,
  type Scene3DObject,
  type Vec3
} from '@shared/scene3d/model'
import { addObject, commit, createHistory, duplicateObjects, redo, removeObjects, reparent, setCamera, setEnvironment, undo, updateObject, type History } from '@shared/scene3d/commands'
import { SCENE_PRESETS } from '@shared/scene3d/presets'
import { generateScene3DModule, sceneIsAnimated } from '@shared/scene3d/codegen'
import { threeImportFor } from '@shared/designer/scene-embed'
import { basenameOf } from '@shared/paths'
import { ide } from '../../ipc'
import { t } from '../../i18n'
import { showContextMenu, type MenuItem } from '../../ui/ContextMenu'
import { choose } from '../../ui/dialogs'
import { notify, notifyError } from '../../workbench/notifications'
import { useDeferredSave } from '../../workbench/unsaved'
import { hasSceneModule, writeSceneOutputs } from './embed'
import { SceneViewport, type GizmoMode } from './viewport'

type Patch = Parameters<typeof updateObject>[2]

/** Campo numerico che scrive solo a Invio o uscendo (niente passo di annulla a ogni tasto). */
function NumberField({ value, onCommit, step = 0.1, min, max, label, testId }: { value: number; onCommit: (n: number) => void; step?: number; min?: number; max?: number; label: string; testId?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n)) return setText(String(value))
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    if (clamped !== value) onCommit(clamped)
    else setText(String(value))
  }
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={text}
      aria-label={label}
      title={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setText(String(value))
      }}
      data-testid={testId}
    />
  )
}

function Vec3Field({ label, value, onCommit, step, testId }: { label: string; value: Vec3; onCommit: (v: Vec3) => void; step?: number; testId: string }) {
  return (
    <div className="s3-field">
      <label>{label}</label>
      <div className="s3-vec">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberField
            key={axis}
            label={`${label} ${axis}`}
            value={value[i]!}
            step={step}
            onCommit={(n) => {
              const next = [...value] as Vec3
              next[i] = n
              onCommit(next)
            }}
            testId={`${testId}-${axis.toLowerCase()}`}
          />
        ))}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s3-field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (on: boolean) => void; testId?: string }) {
  return (
    <label className="s3-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} /> {label}
    </label>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, testId }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; testId?: string }) {
  return (
    <Row label={`${label} · ${Math.round(value * 100) / 100}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId} />
    </Row>
  )
}

function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (c: string) => void; testId?: string }) {
  return (
    <Row label={label}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId} />
    </Row>
  )
}

const iconFor = (o: Scene3DObject) => (o.kind === 'light' ? '💡' : o.kind === 'group' ? '▣' : '◆')

// ---------------------------------------------------------------- albero degli oggetti

function ObjectTree({ doc, selected, onSelect, apply }: { doc: Scene3DDocument; selected: string[]; onSelect: (id: string, additive: boolean) => void; apply: (change: (d: Scene3DDocument) => Scene3DDocument) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [drop, setDrop] = useState<{ id: string | null; where: 'before' | 'after' | 'inside' } | null>(null)
  const MIME = 'text/x-scene3d-object'
  const whereOf = (event: React.DragEvent): 'before' | 'after' | 'inside' => {
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (event.clientY - r.top) / r.height
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
  }
  const moveTo = (dragged: string, target: Scene3DObject | null, where: 'before' | 'after' | 'inside') => {
    apply((d) => {
      if (!target) return reparent(d, dragged, null)
      if (where === 'inside') return reparent(d, dragged, target.id)
      const siblings = childrenOf(d, target.parent).filter((o) => o.id !== dragged)
      const index = siblings.findIndex((o) => o.id === target.id) + (where === 'after' ? 1 : 0)
      return reparent(d, dragged, target.parent, index)
    })
  }
  const render = (o: Scene3DObject, depth: number): React.ReactNode => {
    const kids = childrenOf(doc, o.id)
    const isClosed = closed.has(o.id)
    const marker = drop?.id === o.id ? ` drop-${drop.where === 'inside' ? 'inside-end' : drop.where}` : ''
    return (
      <div key={o.id}>
        <div
          className={`tree-row s3-row${selected.includes(o.id) ? ' active' : ''}${o.visible ? '' : ' is-hidden'}${marker}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          draggable
          onClick={(e) => onSelect(o.id, e.ctrlKey || e.shiftKey || e.metaKey)}
          onDragStart={(e) => {
            e.dataTransfer.setData(MIME, o.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(MIME)) return
            e.preventDefault()
            const where = whereOf(e)
            if (drop?.id !== o.id || drop.where !== where) setDrop({ id: o.id, where })
          }}
          onDragLeave={() => setDrop((d) => (d?.id === o.id ? null : d))}
          onDrop={(e) => {
            const dragged = e.dataTransfer.getData(MIME)
            const where = whereOf(e)
            setDrop(null)
            if (!dragged || dragged === o.id) return
            e.preventDefault()
            e.stopPropagation()
            moveTo(dragged, o, where)
          }}
          data-object={o.id}
          data-testid="s3-row"
        >
          {kids.length ? (
            <button
              className="layer-toggle"
              onClick={(e) => {
                e.stopPropagation()
                setClosed((s) => {
                  const next = new Set(s)
                  if (next.has(o.id)) next.delete(o.id)
                  else next.add(o.id)
                  return next
                })
              }}
              aria-label={isClosed ? t('designer.expand') : t('designer.collapse')}
            >
              {isClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="layer-toggle" />
          )}
          <span className="s3-icon" aria-hidden>
            {iconFor(o)}
          </span>
          <span className="tree-name">{o.name}</span>
          <button
            className="layer-flag"
            onClick={(e) => {
              e.stopPropagation()
              apply((d) => updateObject(d, o.id, { visible: !o.visible }))
            }}
            title={t('studio3d.visible')}
            aria-label={t('studio3d.visible')}
            aria-pressed={o.visible}
          >
            {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
        {!isClosed && kids.map((k) => render(k, depth + 1))}
      </div>
    )
  }
  const roots = childrenOf(doc, null)
  return (
    <div className="s3-tree" data-testid="s3-tree">
      <div className="panel-toolbar">
        <span className="title">{t('studio3d.objects')}</span>
      </div>
      <div className="hint" style={{ padding: '4px 10px' }}>
        {t('studio3d.treeHint')}
      </div>
      <div className="panel-body">
        {roots.length ? roots.map((o) => render(o, 0)) : <div className="hint" style={{ padding: 10 }}>{t('studio3d.empty')}</div>}
        <div
          className={`s3-root-drop${drop?.id === null ? ' over' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(MIME)) return
            e.preventDefault()
            if (drop?.id !== null) setDrop({ id: null, where: 'inside' })
          }}
          onDragLeave={() => setDrop(null)}
          onDrop={(e) => {
            const dragged = e.dataTransfer.getData(MIME)
            setDrop(null)
            if (dragged) moveTo(dragged, null, 'inside')
          }}
          data-testid="s3-root-drop"
        >
          {t('studio3d.toRoot')}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- ispettore

function Inspector({ doc, object, patch, env, onFov, onUseView }: { doc: Scene3DDocument; object: Scene3DObject | null; patch: (p: Patch, key: string) => void; env: (change: Parameters<typeof setEnvironment>[1], key: string) => void; onFov: (fov: number) => void; onUseView: () => void }) {
  if (!object) {
    const e = doc.environment
    return (
      <div className="s3-inspector" data-testid="s3-inspector">
        <div className="insp-section-title">{t('studio3d.inspectorScene')}</div>
        <Row label={t('studio3d.fieldName')}>
          <input defaultValue={doc.name} key={doc.name} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== doc.name && env({ name: ev.target.value.trim() }, 'name')} data-testid="s3-scene-name" />
        </Row>
        <ColorField label={t('studio3d.background')} value={doc.background} onChange={(c) => env({ background: c }, 'background')} testId="s3-background" />
        <Check label={t('studio3d.grid')} checked={e.grid} onChange={(on) => env({ environment: { grid: on } }, 'grid')} testId="s3-grid" />
        <Check label={t('studio3d.axes')} checked={e.axes} onChange={(on) => env({ environment: { axes: on } }, 'axes')} />
        <Check label={t('studio3d.shadows')} checked={e.shadows} onChange={(on) => env({ environment: { shadows: on } }, 'shadows')} />
        <Check label={t('studio3d.toneMapping')} checked={e.toneMapping === 'aces'} onChange={(on) => env({ environment: { toneMapping: on ? 'aces' : 'none' } }, 'tone')} />
        <Slider label={t('studio3d.exposure')} value={e.exposure} min={0.2} max={3} step={0.05} onChange={(n) => env({ environment: { exposure: n } }, 'exposure')} />
        <Check label={t('studio3d.fog')} checked={!!doc.fog} onChange={(on) => env({ fog: on ? { color: doc.background, near: 8, far: 30 } : null }, 'fog')} />
        {doc.fog && (
          <>
            <Row label={t('studio3d.fogNear')}>
              <NumberField label={t('studio3d.fogNear')} value={doc.fog.near} step={1} min={0} onCommit={(n) => env({ fog: { ...doc.fog!, near: n } }, 'fogNear')} />
            </Row>
            <Row label={t('studio3d.fogFar')}>
              <NumberField label={t('studio3d.fogFar')} value={doc.fog.far} step={1} min={1} onCommit={(n) => env({ fog: { ...doc.fog!, far: n } }, 'fogFar')} />
            </Row>
          </>
        )}
        <div className="insp-section-title">Camera</div>
        <Row label={t('studio3d.fov')}>
          <NumberField label={t('studio3d.fov')} value={doc.camera.fov} step={1} min={10} max={120} onCommit={onFov} />
        </Row>
        <button className="btn" onClick={onUseView} title={t('studio3d.useViewHint')} data-testid="s3-use-view">
          <Camera size={14} /> {t('studio3d.useView')}
        </button>
      </div>
    )
  }
  const m = object.material
  const l = object.light
  return (
    <div className="s3-inspector" data-testid="s3-inspector">
      <Row label={t('studio3d.fieldName')}>
        <input defaultValue={object.name} key={`${object.id}:${object.name}`} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== object.name && patch({ name: ev.target.value.trim() }, 'name')} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} data-testid="s3-name" />
      </Row>
      <Vec3Field label={t('studio3d.position')} value={object.position} onCommit={(v) => patch({ position: v }, 'position')} testId="s3-pos" />
      <Vec3Field label={t('studio3d.rotation')} value={object.rotation} step={5} onCommit={(v) => patch({ rotation: v }, 'rotation')} testId="s3-rot" />
      <Vec3Field label={t('studio3d.scaleField')} value={object.scale} onCommit={(v) => patch({ scale: v }, 'scale')} testId="s3-scale" />
      <Check label={t('studio3d.visible')} checked={object.visible} onChange={(on) => patch({ visible: on }, 'visible')} />
      {object.kind === 'mesh' && (
        <>
          <Check label={t('studio3d.castShadow')} checked={object.castShadow} onChange={(on) => patch({ castShadow: on }, 'cast')} />
          <Check label={t('studio3d.receiveShadow')} checked={object.receiveShadow} onChange={(on) => patch({ receiveShadow: on }, 'receive')} />
        </>
      )}
      {object.geometry && (
        <>
          <div className="insp-section-title">
            {t('studio3d.shape')}: {GEOMETRY_LABELS[object.geometry.kind]}
          </div>
          {Object.entries(object.geometry.params).map(([key, value]) => (
            <Row key={key} label={key}>
              <NumberField label={key} value={value} step={Number.isInteger(value) && value > 4 ? 1 : 0.05} min={0} onCommit={(n) => patch({ geometry: { params: { [key]: n } } }, `geo:${key}`)} />
            </Row>
          ))}
        </>
      )}
      {m && (
        <>
          <div className="insp-section-title">{t('studio3d.material')}</div>
          <Row label={t('studio3d.materialKind')}>
            <select value={m.kind} onChange={(e) => patch({ material: { kind: e.target.value as typeof m.kind } }, 'matKind')} data-testid="s3-material-kind">
              {MATERIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MATERIAL_LABELS[k]}
                </option>
              ))}
            </select>
          </Row>
          <ColorField label={t('studio3d.color')} value={m.color} onChange={(c) => patch({ material: { color: c } }, 'color')} testId="s3-color" />
          <Slider label={t('studio3d.metalness')} value={m.metalness} onChange={(n) => patch({ material: { metalness: n } }, 'metal')} />
          <Slider label={t('studio3d.roughness')} value={m.roughness} onChange={(n) => patch({ material: { roughness: n } }, 'rough')} />
          <Slider label={t('studio3d.opacity')} value={m.opacity} onChange={(n) => patch({ material: { opacity: n } }, 'opacity')} />
          <ColorField label={t('studio3d.emissive')} value={m.emissive} onChange={(c) => patch({ material: { emissive: c } }, 'emissive')} />
          <Slider label={t('studio3d.emissiveIntensity')} value={m.emissiveIntensity} max={3} onChange={(n) => patch({ material: { emissiveIntensity: n } }, 'emissiveI')} />
          {m.kind === 'physical' && <Slider label={t('studio3d.clearcoat')} value={m.clearcoat} onChange={(n) => patch({ material: { clearcoat: n } }, 'clearcoat')} />}
          <Check label={t('studio3d.wireframe')} checked={m.wireframe} onChange={(on) => patch({ material: { wireframe: on } }, 'wire')} />
          <Check label={t('studio3d.flatShading')} checked={m.flatShading} onChange={(on) => patch({ material: { flatShading: on } }, 'flat')} />
        </>
      )}
      {l && (
        <>
          <div className="insp-section-title">
            {t('studio3d.light')}: {LIGHT_LABELS[l.kind]}
          </div>
          <ColorField label={t('studio3d.color')} value={l.color} onChange={(c) => patch({ light: { color: c } }, 'lcolor')} testId="s3-light-color" />
          <Row label={t('studio3d.intensity')}>
            <NumberField label={t('studio3d.intensity')} value={l.intensity} step={0.1} min={0} onCommit={(n) => patch({ light: { intensity: n } }, 'intensity')} testId="s3-intensity" />
          </Row>
          {l.kind === 'hemisphere' && <ColorField label={t('studio3d.groundColor')} value={l.groundColor} onChange={(c) => patch({ light: { groundColor: c } }, 'ground')} />}
          {(l.kind === 'directional' || l.kind === 'spot' || l.kind === 'point') && <Check label={t('studio3d.castShadow')} checked={l.castShadow} onChange={(on) => patch({ light: { castShadow: on } }, 'lshadow')} />}
          {(l.kind === 'point' || l.kind === 'spot') && (
            <Row label={t('studio3d.distance')}>
              <NumberField label={t('studio3d.distance')} value={l.distance} step={1} min={0} onCommit={(n) => patch({ light: { distance: n } }, 'distance')} />
            </Row>
          )}
          {l.kind === 'spot' && (
            <Row label={t('studio3d.angle')}>
              <NumberField label={t('studio3d.angle')} value={l.angle} step={1} min={1} max={89} onCommit={(n) => patch({ light: { angle: n } }, 'angle')} />
            </Row>
          )}
        </>
      )}
      <div className="insp-section-title">{t('studio3d.animation')}</div>
      <Row label={t('studio3d.animation')}>
        <select value={object.animation.kind} onChange={(e) => patch({ animation: { kind: e.target.value as Scene3DObject['animation']['kind'] } }, 'anim')} data-testid="s3-animation">
          {ANIMATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {ANIMATION_LABELS[k]}
            </option>
          ))}
        </select>
      </Row>
      {object.animation.kind !== 'none' && (
        <Row label={t('studio3d.speed')}>
          <NumberField label={t('studio3d.speed')} value={object.animation.speed} step={0.05} onCommit={(n) => patch({ animation: { speed: n } }, 'speed')} />
        </Row>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- codice generato

function CodeView({ doc, path, selected }: { doc: Scene3DDocument; path: string; selected: string | null }) {
  const generated = useMemo(() => generateScene3DModule(doc, { threeImport: threeImportFor(path), sourcePath: path, generator: 'Easey IDE' }), [doc, path])
  const range = selected ? generated.map[selected] : undefined
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    host.current?.querySelector('.s3-code-line.hit')?.scrollIntoView({ block: 'nearest' })
  }, [range?.start, range?.end])
  return (
    <div className="s3-code" ref={host} data-testid="s3-code" title={t('studio3d.codeTitle')}>
      {generated.code.split('\n').map((line, i) => (
        <div key={i} className={`s3-code-line${range && i + 1 >= range.start && i + 1 <= range.end ? ' hit' : ''}`}>
          <span className="s3-code-no">{i + 1}</span>
          <span>{line || ' '}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- pannello

export function Studio3DPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  const path = params.path
  const name = basenameOf(path).replace(SCENE3D_EXTENSION, '')
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<GizmoMode>('translate')
  const [playing, setPlaying] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [fallback, setFallback] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewport = useRef<SceneViewport | null>(null)
  const lastEdit = useRef<{ key: string; time: number } | null>(null)
  /** Il documento che c'è su disco adesso (caricato o scritto per ultimo). */
  const savedDoc = useRef<Scene3DDocument | null>(null)
  const latestDoc = useRef<Scene3DDocument | null>(null)
  const { schedule } = useDeferredSave(t('unsaved.scene3d', { name }), 400)
  const doc = history?.present ?? null

  // Lettura del file.
  useEffect(() => {
    let alive = true
    void ide.invoke('workspace:readFile', path).then(
      (text) => {
        if (!alive) return
        const parsed = parseScene3D(text)
        if (!parsed.ok) return setError(parsed.error)
        savedDoc.current = parsed.doc
        setHistory(createHistory(parsed.doc))
      },
      (e) => alive && setError((e as Error).message)
    )
    return () => {
      alive = false
    }
  }, [path])

  /** Un passo annullabile; modifiche dello stesso campo a raffica (cursori, colori) restano un passo solo. */
  const apply = useCallback((change: (d: Scene3DDocument) => Scene3DDocument, key?: string) => {
    const now = Date.now()
    const coalesce = !!key && lastEdit.current?.key === key && now - lastEdit.current.time < 1200
    lastEdit.current = key ? { key, time: now } : null
    setHistory((h) => (h ? commit(h, change(h.present), coalesce) : h))
  }, [])

  /**
   * Annulla / ripeti. Dopo un passo indietro la modifica seguente è un passo NUOVO: unirla a quella annullata
   * (stesso campo entro 1,2 s) sostituirebbe lo stato di partenza senza poter più annullare.
   */
  const step = useCallback((move: (h: History) => History) => {
    lastEdit.current = null
    setHistory((h) => (h ? move(h) : h))
  }, [])

  // Salvataggio automatico (e modulo/immagine se la scena è usata in una pagina). Si confronta con l'ULTIMO
  // documento scritto su disco, non con quello caricato: annullando fino all'inizio il file torna com'era.
  // Il lavoro in coda scrive il documento di adesso (ref), non quello di quando è stato messo in coda:
  // modifica + annulla entro il ritardo non lascia su disco la versione modificata.
  latestDoc.current = doc
  useEffect(() => {
    if (!doc || doc === savedDoc.current) return
    schedule(async () => {
      const current = latestDoc.current
      if (!current || current === savedDoc.current) return
      await ide.invoke('workspace:writeFile', path, serializeScene3D(current))
      savedDoc.current = current
      if (hasSceneModule(path)) await writeSceneOutputs(path, current)
    })
  }, [doc, path, schedule])

  // La vista 3D: creata una volta (renderer condiviso), aggiornata a ogni documento.
  const selectedRef = useRef<string[]>([])
  selectedRef.current = selected
  useEffect(() => {
    if (!canvas.current || !doc || viewport.current) return
    const view = new SceneViewport(canvas.current, {
      onPick: (id, additive) => setSelected((current) => (id === null ? (additive ? current : []) : additive ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id])),
      onTransform: (id, pose) => apply((d) => updateObject(d, id, pose))
    })
    viewport.current = view
    setFallback(view.fallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc !== null])
  useEffect(() => () => viewport.current?.dispose(), [])
  useEffect(() => {
    if (doc) viewport.current?.setDocument(doc)
  }, [doc])
  useEffect(() => {
    // Oggetti tolti (annulla, elimina): la selezione li perde.
    const alive = selected.filter((id) => doc?.objects.some((o) => o.id === id))
    if (alive.length !== selected.length) setSelected(alive)
    else viewport.current?.setSelection(selected)
  }, [selected, doc])
  useEffect(() => viewport.current?.setMode(mode), [mode])
  useEffect(() => {
    viewport.current?.setPlaying(playing)
  }, [playing])

  if (error) return <div className="panel s3-panel"><div className="hint" style={{ padding: 16 }} data-testid="s3-error">{t('studio3d.invalid', { error })}</div></div>
  const object = doc && selected.length === 1 ? (doc.objects.find((o) => o.id === selected[0]) ?? null) : null
  const animated = doc ? sceneIsAnimated(doc) : false

  const addAndSelect = (make: (d: Scene3DDocument) => Scene3DObject) => {
    if (!doc) return
    const parentGroup = object?.kind === 'group' ? object.id : null
    const created = make(doc)
    apply((d) => addObject(d, { ...created, parent: parentGroup }, parentGroup))
    setSelected([created.id])
  }

  const addMenu = (event: React.MouseEvent) => {
    const items: MenuItem[] = [
      { heading: t('studio3d.addGeometry') },
      ...GEOMETRY_KINDS.map((k) => ({ label: GEOMETRY_LABELS[k], run: () => addAndSelect((d) => createMesh(d, k)), testId: `s3-add-${k}` })),
      'separator' as const,
      { heading: t('studio3d.addLight') },
      ...LIGHT_KINDS.map((k) => ({ label: LIGHT_LABELS[k], run: () => addAndSelect((d) => createLight(d, k)), testId: `s3-add-${k}` })),
      'separator' as const,
      { label: t('studio3d.addGroup'), run: () => addAndSelect((d) => createGroup(d)), testId: 's3-add-group' }
    ]
    showContextMenu(event, items)
  }

  const presetMenu = (event: React.MouseEvent) => {
    showContextMenu(
      event,
      SCENE_PRESETS.map((p) => ({
        label: p.label,
        detail: p.description,
        testId: `s3-preset-${p.id}`,
        run: async () => {
          const ok = await choose<'yes'>({ title: t('studio3d.presetReplace', { name: p.label }), message: t('studio3d.presetReplaceMessage'), choices: [{ value: 'yes', label: t('studio3d.presetUse'), testId: 's3-preset-confirm' }] })
          if (ok !== 'yes') return
          const next = p.build()
          apply(() => next)
          setSelected([])
        }
      }))
    )
  }

  const remove = () => {
    if (!selected.length) return
    apply((d) => removeObjects(d, selected))
    setSelected([])
  }

  const duplicate = () => {
    if (!doc || !selected.length) return
    const result = duplicateObjects(doc, selected)
    apply(() => result.doc)
    setSelected(result.ids)
  }

  const saveImage = async () => {
    const url = viewport.current?.snapshot(1600, 900)
    if (!url) return
    try {
      const saved = await ide.invoke('app:saveFile', `${name}.png`, url.slice(url.indexOf(',') + 1), 'base64')
      if (saved) notify(t('studio3d.imageSaved', { path: saved }), 'success')
    } catch (e) {
      notifyError(e)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const ctrl = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (ctrl && key === 'z') {
      event.preventDefault()
      step(event.shiftKey ? redo : undo)
    } else if (ctrl && key === 'y') {
      event.preventDefault()
      step(redo)
    } else if (ctrl && key === 'd') {
      event.preventDefault()
      duplicate()
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      remove()
    } else if (event.key === 'Escape') setSelected([])
    else if (!ctrl && !event.altKey && key === 'w') setMode('translate')
    else if (!ctrl && !event.altKey && key === 'e') setMode('rotate')
    else if (!ctrl && !event.altKey && key === 'r') setMode('scale')
  }

  const modeButton = (value: GizmoMode, label: string, Icon: typeof Move3d) => (
    <button className={mode === value ? 'active' : undefined} onClick={() => setMode(value)} title={label} aria-label={label} aria-pressed={mode === value} disabled={fallback} data-testid={`s3-mode-${value}`}>
      <Icon size={13} />
    </button>
  )

  return (
    <div className="panel s3-panel" tabIndex={-1} onKeyDown={onKeyDown} data-testid="studio3d" data-fallback={fallback ? '1' : '0'}>
      <div className="panel-toolbar">
        <span className="title">{t('panel.studio3d')}</span>
        <button className="btn" onClick={addMenu} disabled={!doc} data-testid="s3-add">
          <Plus size={14} /> <span className="btn-label">{t('studio3d.add')}</span>
        </button>
        <button className="btn ghost" onClick={presetMenu} disabled={!doc} data-testid="s3-presets">
          <Sparkles size={14} /> <span className="btn-label">{t('studio3d.presets')}</span>
        </button>
        <div className="segmented" role="group">
          {modeButton('translate', t('studio3d.move'), Move3d)}
          {modeButton('rotate', t('studio3d.rotate'), Rotate3d)}
          {modeButton('scale', t('studio3d.scale'), Scale3d)}
        </div>
        <button className={`btn ghost${playing ? ' active' : ''}`} onClick={() => setPlaying(!playing)} disabled={!animated || fallback} title={animated ? (playing ? t('studio3d.pause') : t('studio3d.play')) : t('studio3d.noAnimations')} aria-pressed={playing} data-testid="s3-play">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={duplicate} disabled={!selected.length} title={`${t('studio3d.duplicate')} (Ctrl+D)`} data-testid="s3-duplicate">
          <Copy size={14} />
        </button>
        <button className="icon-btn" onClick={remove} disabled={!selected.length} title={`${t('studio3d.delete')} (Canc)`} data-testid="s3-delete">
          <Trash2 size={14} />
        </button>
        <button className="icon-btn" onClick={() => step(undo)} disabled={!history?.past.length} title={`${t('designer.undo')} (Ctrl+Z)`} data-testid="s3-undo">
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" onClick={() => step(redo)} disabled={!history?.future.length} title={`${t('designer.redo')} (Ctrl+Y)`} data-testid="s3-redo">
          <Redo2 size={14} />
        </button>
        <button className={`btn ghost${showCode ? ' active' : ''}`} onClick={() => setShowCode(!showCode)} aria-pressed={showCode} data-testid="s3-show-code">
          <Code2 size={14} /> <span className="btn-label">{t('studio3d.showCode')}</span>
        </button>
        <button className="btn ghost" onClick={() => void saveImage()} disabled={!doc} data-testid="s3-save-image">
          <ImageDown size={14} /> <span className="btn-label">{t('studio3d.saveImage')}</span>
        </button>
      </div>
      <div className={`s3-body${showCode ? ' with-code' : ''}`}>
        {doc ? <ObjectTree doc={doc} selected={selected} onSelect={(id, additive) => setSelected((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))} apply={apply} /> : <div />}
        <div className="s3-view">
          <canvas ref={canvas} className="s3-canvas" tabIndex={0} data-testid="s3-canvas" />
          {!doc && <div className="s3-overlay hint">{t('studio3d.loading')}</div>}
          <div className="s3-status" data-testid="s3-status">
            <Box size={12} /> {fallback ? t('studio3d.fallback') : t('studio3d.webgl')} · {t('studio3d.status', { count: doc?.objects.length ?? 0 })}
          </div>
        </div>
        {showCode && doc && <CodeView doc={doc} path={path} selected={selected[0] ?? null} />}
        {doc && (
          <Inspector
            doc={doc}
            object={object}
            patch={(p, key) => object && apply((d) => updateObject(d, object.id, p), `${object.id}:${key}`)}
            env={(change, key) => apply((d) => setEnvironment(d, change), `env:${key}`)}
            onFov={(fov) => apply((d) => setCamera(d, { fov }), 'fov')}
            onUseView={() => {
              const view = viewport.current?.view()
              if (view) apply((d) => setCamera(d, view))
            }}
          />
        )}
      </div>
    </div>
  )
}
