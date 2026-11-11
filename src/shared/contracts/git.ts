// Integrazione Git (usa il comando `git` installato nel sistema).

export type GitFileStatus = 'modificato' | 'nuovo' | 'eliminato' | 'rinominato' | 'non tracciato' | 'conflitto'

export interface GitChange {
  path: string
  status: GitFileStatus
  /** Lettera breve per l'elenco (M, A, D, R, U, ?). */
  letter: string
}

export interface GitStatus {
  /** false se `git` non è installato. */
  available: boolean
  /** true se il progetto è un repository. */
  repo: boolean
  branch: string | null
  changes: GitChange[]
  version?: string
}

export interface GitCommit {
  hash: string
  short: string
  author: string
  date: string
  message: string
}
