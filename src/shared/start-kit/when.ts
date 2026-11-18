// Schermata iniziale (comune a Easey DB, Easey IDE e IDE Next, docs/SCHERMATA-INIZIALE.md di Easey DB): «quando»
// di un progetto recente in parole: «oggi, 9:05», «ieri, 18:40», «lunedì», «12 novembre», «12 novembre 2025».
// Puro, senza dipendenze: si copia identico nelle altre app.

export type StartLang = 'it' | 'en'

const WEEKDAYS: Record<StartLang, string[]> = {
  it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
}
const MONTHS: Record<StartLang, string[]> = {
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
}
const WORDS: Record<StartLang, { today: string; yesterday: string }> = {
  it: { today: 'oggi', yesterday: 'ieri' },
  en: { today: 'today', yesterday: 'yesterday' }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const pad = (n: number) => String(n).padStart(2, '0')

/** Quando, detto come lo direbbe una persona; `now` si passa per i test. */
export function relativeWhen(at: number, now: number = Date.now(), lang: StartLang = 'it'): string {
  const date = new Date(at)
  const today = new Date(now)
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000)
  const time = `${date.getHours()}:${pad(date.getMinutes())}`
  if (days <= 0) return `${WORDS[lang].today}, ${time}`
  if (days === 1) return `${WORDS[lang].yesterday}, ${time}`
  if (days < 7) return WEEKDAYS[lang][date.getDay()]!
  const day = lang === 'it' ? `${date.getDate()} ${MONTHS.it[date.getMonth()]}` : `${MONTHS.en[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === today.getFullYear() ? day : `${day} ${date.getFullYear()}`
}

/** Cartella più leggibile: la parte della cartella utente diventa «~» (C:\Users\ada\Documenti → ~\Documenti). */
export function friendlyPath(path: string, home?: string): string {
  if (home && path.toLowerCase().startsWith(home.toLowerCase())) return `~${path.slice(home.length)}`
  return path
}
