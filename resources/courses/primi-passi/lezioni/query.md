Con **SELECT** chiedi al database le righe che ti interessano:

```sql
SELECT nome, citta
FROM clienti
WHERE citta = 'Milano'
ORDER BY nome;
```

- `SELECT` sceglie le **colonne**;
- `FROM` dice da quale **tabella**;
- `WHERE` filtra le **righe**;
- `ORDER BY` le mette in ordine.

> 💡 Le stringhe in SQL vanno fra apici singoli: `'Milano'`.

> 🔍 Puoi provare la query anche nel **SQL Lab**: apri un file `.sql` e premi Ctrl+Invio.
