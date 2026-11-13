// Palette dei comandi (Ctrl+Shift+P) e "Vai al file" (Ctrl+P): cerca ed esegue comandi o apre file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { filePaths } from '@shared/paths'
import { executeCommand, listCommands } from './commands'
import { useWorkbench } from './store'
import { t } from '../i18n'

function score(text: string, query: string): number {
  const haystack = text.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  let total = 0
  for (const word of words) {
    const index = haystack.indexOf(word)
    if (index < 0) return -1
    total += index === 0 ? 3 : /[\s/._-]/.test(haystack[index - 1] ?? '') ? 2 : 1
  }
  return total
}

interface Item {
  id: string
  label: string
  detail?: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const open = useWorkbench((s) => s.paletteOpen)
  const mode = useWorkbench((s) => s.paletteMode)
  const tree = useWorkbench((s) => s.tree)
  const setOpen = useWorkbench((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open, mode])

  const items = useMemo<Item[]>(() => {
    if (!open) return []
    if (mode === 'files') {
      const files = filePaths(tree)
      const ranked = query.trim()
        ? files
            .map((path) => ({ path, value: score(path, query) + (score(path.slice(path.lastIndexOf('/') + 1), query) >= 0 ? 5 : 0) }))
            .filter((f) => f.value >= 0)
            .sort((a, b) => b.value - a.value)
            .map((f) => f.path)
        : files
      return ranked.slice(0, 200).map((path) => ({
        id: path,
        label: path.slice(path.lastIndexOf('/') + 1),
        detail: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined,
        run: () => void executeCommand('editor.open', { path })
      }))
    }
    const commands = listCommands().filter((c) => c.palette !== false && (!c.when || c.when()))
    const sorted = query.trim()
      ? commands
          .map((command) => ({ command, value: score(`${command.category ?? ''} ${command.title}`, query) }))
          .filter((entry) => entry.value >= 0)
          .sort((a, b) => b.value - a.value)
          .map((entry) => entry.command)
      : commands.sort((a, b) => `${a.category}${a.title}`.localeCompare(`${b.category}${b.title}`, 'it'))
    return sorted.map((c) => ({ id: c.id, label: c.title, detail: c.category, hint: c.keybinding, run: () => void executeCommand(c.id) }))
  }, [open, mode, query, tree])

  if (!open) return null

  const run = (index: number) => {
    const item = items[index]
    if (!item) return
    setOpen(false)
    // Dopo la chiusura: il comando può spostare il fuoco (editor, dialoghi) senza ricevere il tasto.
    setTimeout(() => item.run(), 0)
  }

  return (
    <div className="overlay" style={{ background: 'transparent', placeItems: 'start center' }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-label={mode === 'files' ? t('palette.filesTitle') : t('palette.title')}>
        <input
          ref={input}
          placeholder={mode === 'files' ? t('palette.filesPlaceholder') : t('palette.placeholder')}
          value={query}
          // Finché la palette è aperta il fuoco resta qui: un editor che si apre in quel momento
          // non deve rubarlo (l'Invio finirebbe nel file). Per chiuderla: Esc o clic fuori.
          onBlur={() => setTimeout(() => input.current?.isConnected && input.current.focus(), 0)}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(items.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              // Senza preventDefault lo stesso Invio arriverebbe all'editor appena aperto (riga vuota in più).
              e.preventDefault()
              run(selected)
            }
          }}
        />
        <ul>
          {items.map((item, index) => (
            <li key={item.id} className={index === selected ? 'selected' : undefined} onMouseEnter={() => setSelected(index)} onClick={() => run(index)}>
              <span>
                {mode === 'commands' && item.detail && <span className="category">{item.detail}:</span>}
                {item.label}
                {mode === 'files' && item.detail && <span className="category" style={{ marginLeft: 8 }}>{item.detail}</span>}
              </span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </li>
          ))}
          {items.length === 0 && <li>{mode === 'files' ? t('palette.noFiles') : t('palette.empty')}</li>}
        </ul>
      </div>
    </div>
  )
}
