---
titolo: I clienti con l'abbonamento attivo
linguaggio: sql
livello: base
capitolo: SQL, cap. 4
file: query.sql
---

Nel database del centro fitness c'è la tabella **clienti**:

| Colonna | Tipo |
|---|---|
| id | INTEGER |
| nome | TEXT |
| citta | TEXT |
| attivo | INTEGER (1 = abbonamento attivo, 0 = scaduto) |
| scadenza | TEXT (data AAAA-MM-GG) |

Scrivi in `query.sql` una query che mostri **nome** e **scadenza** dei clienti con l'abbonamento **attivo**, ordinati per **scadenza** dalla più vicina alla più lontana.

## Suggerimenti

- Le colonne da mostrare vanno dopo `SELECT`, separate da virgola: `SELECT nome, scadenza`.
- Il filtro è `WHERE attivo = 1`.
- L'ordinamento crescente è quello predefinito: `ORDER BY scadenza`.
