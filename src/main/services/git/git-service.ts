// Git integrato: stato, differenze, commit e cronologia del progetto aperto, tramite il `git` di sistema.
// Si passano sempre argomenti separati (execFile, mai una shell): nessuna iniezione di comandi.
import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'
import type { GitChange, GitCommit, GitFileStatus, GitStatus } from '@shared/contracts/git'

const MAX_BUFFER = 16 * 1024 * 1024

interface RunResult {
  stdout: string
  stderr: string
  code: number
}

function run(cwd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: MAX_BUFFER, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as NodeJS.ErrnoException).code === 'number' ? Number((error as NodeJS.ErrnoException).code) : (error as { code?: unknown }).code === 'ENOENT' ? -1 : 1) : 0
      resolve({ stdout: String(stdout), stderr: String(stderr), code })
    })
  })
}

async function must(cwd: string, args: string[]): Promise<string> {
  const result = await run(cwd, args)
  if (result.code === -1) throw new Error('Git non è installato: scaricalo da https://git-scm.com e riavvia l’IDE.')
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} non riuscito`)
  return result.stdout
}

const STATUS: Record<string, [GitFileStatus, string]> = {
  M: ['modificato', 'M'],
  T: ['modificato', 'M'],
  A: ['nuovo', 'A'],
  D: ['eliminato', 'D'],
  R: ['rinominato', 'R'],
  C: ['nuovo', 'A'],
  U: ['conflitto', 'U'],
  '?': ['non tracciato', '?']
}

/** Interpreta `git status --porcelain=v1 -z` (i percorsi rinominati hanno anche il vecchio nome). */
export function parsePorcelain(output: string): GitChange[] {
  const parts = output.split('\0')
  const changes: GitChange[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!
    if (entry.length < 4) continue
    const x = entry[0]!
    const y = entry[1]!
    const path = entry.slice(3)
    if (x === 'R' || x === 'C') i++ // salta il percorso d'origine
    const key = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D') ? 'U' : x === '?' ? '?' : y !== ' ' && y !== '.' ? y : x
    const [status, letter] = STATUS[key] ?? ['modificato', 'M']
    changes.push({ path, status, letter })
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

export class GitService {
  async status(root: string): Promise<GitStatus> {
    const version = await run(root, ['--version'])
    if (version.code === -1) return { available: false, repo: false, branch: null, changes: [] }
    const inside = await run(root, ['rev-parse', '--is-inside-work-tree'])
    if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { available: true, repo: false, branch: null, changes: [], version: version.stdout.trim() }
    const branch = (await run(root, ['branch', '--show-current'])).stdout.trim() || null
    const porcelain = await must(root, ['status', '--porcelain=v1', '-z', '-uall'])
    return { available: true, repo: true, branch, changes: parsePorcelain(porcelain), version: version.stdout.trim() }
  }

  async init(root: string): Promise<void> {
    await must(root, ['init', '-b', 'main'])
  }

  /** Contenuto del file nell'ultimo commit (null se il file è nuovo o non c'è ancora un commit). */
  async original(root: string, path: string): Promise<string | null> {
    const result = await run(root, ['show', `HEAD:./${path}`])
    return result.code === 0 ? result.stdout : null
  }

  /** Aggiunge tutto e crea il commit. Senza identità configurata usa il nome dell'utente del PC. */
  async commit(root: string, message: string): Promise<string> {
    const text = message.trim()
    if (!text) throw new Error('Scrivi un messaggio per il commit.')
    await must(root, ['add', '-A'])
    const identity: string[] = []
    const name = (await run(root, ['config', 'user.name'])).stdout.trim()
    const email = (await run(root, ['config', 'user.email'])).stdout.trim()
    const user = userInfo().username || 'studente'
    if (!name) identity.push('-c', `user.name=${user}`)
    if (!email) identity.push('-c', `user.email=${user}@localhost`)
    await must(root, [...identity, 'commit', '-m', text])
    return (await must(root, ['rev-parse', '--short', 'HEAD'])).trim()
  }

  async log(root: string, limit = 50): Promise<GitCommit[]> {
    const result = await run(root, ['log', `-n${limit}`, '--date=iso-strict', '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1e'])
    if (result.code !== 0) return [] // nessun commit ancora
    return result.stdout
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [hash, short, author, date, message] = record.split('\x1f')
        return { hash: hash!, short: short!, author: author!, date: date!, message: message ?? '' }
      })
  }

  /** Annulla le modifiche di un file tracciato (torna all'ultimo commit). */
  async discard(root: string, path: string): Promise<void> {
    await must(root, ['restore', '--staged', '--worktree', '--source=HEAD', '--', path])
  }
}
