-- Nome e scadenza dei clienti con l'abbonamento attivo, dalla scadenza più vicina.
SELECT nome, scadenza
FROM clienti
WHERE attivo = 1
ORDER BY scadenza;
