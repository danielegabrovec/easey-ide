// Database d'esempio per esercitarsi (stesso contenuto in SQLite e PostgreSQL).
import type { DbEngine } from '../contracts/db'

export interface SampleDatabase {
  id: string
  title: string
  description: string
  sql: Record<DbEngine, string>
}

const id = (engine: DbEngine) => (engine === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY')
const money = (engine: DbEngine) => (engine === 'sqlite' ? 'REAL' : 'NUMERIC(10,2)')
const date = (engine: DbEngine) => (engine === 'sqlite' ? 'TEXT' : 'DATE')

function negozio(engine: DbEngine): string {
  return `CREATE TABLE clienti (
  id ${id(engine)},
  nome TEXT NOT NULL,
  citta TEXT,
  email TEXT UNIQUE,
  iscritto_il ${date(engine)}
);

CREATE TABLE prodotti (
  id ${id(engine)},
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  prezzo ${money(engine)} NOT NULL,
  scorte INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ordini (
  id ${id(engine)},
  cliente_id INTEGER NOT NULL REFERENCES clienti (id),
  data ${date(engine)} NOT NULL,
  stato TEXT NOT NULL DEFAULT 'nuovo'
);

CREATE TABLE righe_ordine (
  ordine_id INTEGER NOT NULL REFERENCES ordini (id),
  prodotto_id INTEGER NOT NULL REFERENCES prodotti (id),
  quantita INTEGER NOT NULL,
  prezzo_unitario ${money(engine)} NOT NULL,
  PRIMARY KEY (ordine_id, prodotto_id)
);

INSERT INTO clienti (nome, citta, email, iscritto_il) VALUES
  ('Anna Rossi', 'Trieste', 'anna@esempio.it', '2024-01-15'),
  ('Luca Bianchi', 'Udine', 'luca@esempio.it', '2024-03-02'),
  ('Sara Verdi', 'Trieste', 'sara@esempio.it', '2024-05-20'),
  ('Marco Neri', 'Gorizia', NULL, '2025-02-11'),
  ('Giulia Gallo', 'Pordenone', 'giulia@esempio.it', '2025-06-30');

INSERT INTO prodotti (nome, categoria, prezzo, scorte) VALUES
  ('Quaderno a righe', 'Cancelleria', 2.50, 120),
  ('Penna blu', 'Cancelleria', 1.20, 300),
  ('Zaino', 'Accessori', 34.90, 15),
  ('Calcolatrice', 'Elettronica', 12.00, 40),
  ('Chiavetta USB 64GB', 'Elettronica', 9.99, 0),
  ('Astuccio', 'Accessori', 7.50, 25);

INSERT INTO ordini (cliente_id, data, stato) VALUES
  (1, '2025-09-01', 'consegnato'),
  (1, '2025-10-12', 'spedito'),
  (2, '2025-10-15', 'consegnato'),
  (3, '2025-11-02', 'nuovo'),
  (5, '2025-11-05', 'nuovo');

INSERT INTO righe_ordine (ordine_id, prodotto_id, quantita, prezzo_unitario) VALUES
  (1, 1, 5, 2.50), (1, 2, 10, 1.20),
  (2, 3, 1, 34.90),
  (3, 4, 1, 12.00), (3, 1, 2, 2.50),
  (4, 6, 1, 7.50), (4, 2, 3, 1.20),
  (5, 5, 2, 9.99);
`
}

function scuola(engine: DbEngine): string {
  return `CREATE TABLE studenti (
  id ${id(engine)},
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  classe TEXT NOT NULL
);

CREATE TABLE materie (
  id ${id(engine)},
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE voti (
  id ${id(engine)},
  studente_id INTEGER NOT NULL REFERENCES studenti (id),
  materia_id INTEGER NOT NULL REFERENCES materie (id),
  voto ${money(engine)} NOT NULL CHECK (voto BETWEEN 1 AND 10),
  data ${date(engine)} NOT NULL
);

INSERT INTO studenti (nome, cognome, classe) VALUES
  ('Elena', 'Fabbri', '3A'), ('Paolo', 'Riva', '3A'), ('Chiara', 'Moro', '3B'), ('Davide', 'Conti', '3B');

INSERT INTO materie (nome) VALUES ('Matematica'), ('Italiano'), ('Informatica');

INSERT INTO voti (studente_id, materia_id, voto, data) VALUES
  (1, 1, 8, '2025-10-01'), (1, 3, 9.5, '2025-10-08'), (2, 1, 5.5, '2025-10-01'),
  (2, 2, 7, '2025-10-03'), (3, 3, 10, '2025-10-08'), (3, 1, 6.5, '2025-10-01'),
  (4, 2, 6, '2025-10-03'), (4, 3, 7.5, '2025-10-08');
`
}

export const SAMPLE_DATABASES: SampleDatabase[] = [
  { id: 'negozio', title: 'Negozio', description: 'Clienti, prodotti, ordini e righe d’ordine: JOIN, aggregati, chiavi esterne.', sql: { sqlite: negozio('sqlite'), postgres: negozio('postgres') } },
  { id: 'scuola', title: 'Scuola', description: 'Studenti, materie e voti: medie, GROUP BY, vincoli CHECK.', sql: { sqlite: scuola('sqlite'), postgres: scuola('postgres') } }
]
