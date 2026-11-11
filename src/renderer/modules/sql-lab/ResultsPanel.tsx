// Risultati delle query: una scheda per istruzione, griglia con intestazione fissa, esportazione,
// e il piano di esecuzione con la valutazione didattica (scansione completa / indice).
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, Gauge, Search, Sparkles, Zap } from 'lucide-react'
import type { CellValue, PlanNode, QueryOutcome } from '@shared/contracts/db'
import { toCsv } from '@shared/sql/format-table'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { notify } from '../../workbench/notifications'
import { t } from '../../i18n'
import { useSql } from './sql-store'

function Cell({ value }: { value: CellValue }) {
  if (value === null) return <td className="null">NULL</td>
  if (typeof value === 'number') return <td className="num">{value}</td>
  if (typeof value === 'boolean') return <td className="num">{value ? 'true' : 'false'}</td>
  return <td title={value.length > 60 ? value : undefined}>{value}</td>
}

function shortStatement(statement: string): string {
  const single = statement.replace(/\s+/g, ' ').trim()
  return single.length > 48 ? `${single.slice(0, 47)}…` : single
}

function OutcomeView({ outcome }: { outcome: QueryOutcome }) {
  if (outcome.kind === 'error') {
    return (
      <div className="sql-error" data-testid="sql-error">
        <AlertCircle size={15} />
        <div>
          <strong>{outcome.message}</strong>
          <pre>{outcome.statement}</pre>
        </div>
      </div>
    )
  }
  if (outcome.columns.length === 0) {
    return (
      <div className="sql-message" data-testid="sql-message">
        <CheckCircle2 size={15} color="var(--success)" />
        {t('sql.done', { changes: outcome.changes, ms: outcome.durationMs.toFixed(1) })}
      </div>
    )
  }
  return (
    <div className="sql-grid-wrap">
      <table className="sql-grid" data-testid="sql-grid">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {outcome.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {outcome.rows.map((row, r) => (
            <tr key={r}>
              <td className="rownum">{r + 1}</td>
              {row.map((v, c) => (
                <Cell key={c} value={v} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {outcome.rows.length === 0 && <div className="hint" style={{ padding: 10 }}>{t('sql.noRows')}</div>}
    </div>
  )
}

function PlanView() {
  const plan = useSql((s) => s.plan)
  if (!plan) return null
  const children = (parent: string | null): PlanNode[] => plan.nodes.filter((n) => n.parent === parent)
  const render = (node: PlanNode, depth: number): React.ReactNode => (
    <div key={node.id}>
      <div className={`plan-node ${node.hint}`} style={{ paddingLeft: 10 + depth * 18 }}>
        {node.hint === 'scan' ? <Search size={13} /> : node.hint === 'index' ? <Zap size={13} /> : <Gauge size={13} />}
        <span>{node.detail}</span>
        {node.hint === 'scan' && <span className="plan-badge scan">{t('sql.planScan')}</span>}
        {node.hint === 'index' && <span className="plan-badge index">{t('sql.planIndex')}</span>}
      </div>
      {children(node.id).map((child) => render(child, depth + 1))}
    </div>
  )
  const roots = plan.nodes.filter((n) => !n.parent || !plan.nodes.some((p) => p.id === n.parent))
  return (
    <div className="plan-view" data-testid="sql-plan">
      <div className="plan-head">
        <strong>{t('sql.planTitle')}</strong>
        <span className="hint">{shortStatement(plan.statement)}</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn ghost"
          onClick={() =>
            executeCommand('ai.ask', {
              prompt: t('sql.aiExplainPlan', { engine: plan.engine === 'sqlite' ? 'SQLite' : 'PostgreSQL', sql: plan.statement, plan: plan.raw }),
              display: t('sql.aiExplainPlanShort')
            })
          }
        >
          <Sparkles size={13} /> {t('sql.aiExplainPlanShort')}
        </button>
      </div>
      {roots.map((n) => render(n, 0))}
      <div className="hint" style={{ padding: '6px 10px' }}>{t('sql.planLegend')}</div>
    </div>
  )
}

export function ResultsPanel() {
  const results = useSql((s) => s.results)
  const plan = useSql((s) => s.plan)
  const running = useSql((s) => s.running)
  const [tab, setTab] = useState(0)

  useEffect(() => {
    if (!results) return
    // Si mostra l'ultima istruzione con righe (o l'errore, se c'è).
    const errorIndex = results.outcomes.findIndex((o) => o.kind === 'error')
    const lastWithRows = results.outcomes.map((o, i) => (o.kind === 'result' && o.columns.length ? i : -1)).filter((i) => i >= 0).at(-1)
    setTab(errorIndex >= 0 ? errorIndex : (lastWithRows ?? results.outcomes.length - 1))
  }, [results])

  if (!results && !plan) return <div className="empty-state">{running ? t('common.loading') : t('sql.noResults')}</div>
  const outcome = results?.outcomes[tab]

  const exportAs = async (format: 'csv' | 'json') => {
    if (!outcome || outcome.kind !== 'result' || outcome.columns.length === 0) return
    const content = format === 'csv' ? toCsv(outcome.columns, outcome.rows) : JSON.stringify(outcome.rows.map((r) => Object.fromEntries(outcome.columns.map((c, i) => [c, r[i]]))), null, 2)
    const saved = await ide.invoke('app:saveFile', `risultato.${format}`, content)
    if (saved) notify(t('sql.exported', { path: saved }), 'success')
  }

  return (
    <div className="panel sql-results">
      {results && (
        <div className="panel-toolbar">
          <div className="sql-tabs" role="tablist">
            {results.outcomes.map((o, i) => (
              <button key={i} role="tab" aria-selected={i === tab} className={`${i === tab ? 'active' : ''} ${o.kind === 'error' ? 'error' : ''}`} onClick={() => setTab(i)} title={o.statement}>
                {o.kind === 'error' ? <AlertCircle size={12} /> : null}
                {shortStatement(o.statement)}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {outcome?.kind === 'result' && outcome.columns.length > 0 && (
            <>
              <span className="hint" data-testid="sql-rowcount">
                {t('sql.rows', { count: outcome.rows.length, ms: outcome.durationMs.toFixed(1) })}
                {outcome.truncated ? ` · ${t('sql.truncated')}` : ''}
              </span>
              <button className="icon-btn" title={t('sql.exportCsv')} onClick={() => exportAs('csv')}>
                <Download size={14} />
              </button>
              <button className="btn ghost" style={{ height: 24 }} onClick={() => exportAs('json')}>
                JSON
              </button>
            </>
          )}
        </div>
      )}
      <div className="panel-body">
        {plan && <PlanView />}
        {outcome && <OutcomeView outcome={outcome} />}
      </div>
    </div>
  )
}
