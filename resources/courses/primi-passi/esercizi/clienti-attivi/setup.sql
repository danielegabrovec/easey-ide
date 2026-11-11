CREATE TABLE clienti (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  citta TEXT,
  attivo INTEGER NOT NULL DEFAULT 1,
  scadenza TEXT
);

INSERT INTO clienti (nome, citta, attivo, scadenza) VALUES
  ('Anna Rossi', 'Milano', 1, '2026-12-31'),
  ('Marco Bianchi', 'Torino', 0, '2026-03-15'),
  ('Elena Verdi', 'Milano', 1, '2026-11-30'),
  ('Luca Neri', 'Roma', 1, '2027-02-28'),
  ('Sara Gallo', 'Napoli', 0, '2025-12-01'),
  ('Paolo Conti', 'Torino', 1, '2026-12-15');
