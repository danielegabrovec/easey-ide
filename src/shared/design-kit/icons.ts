// Icone del kit: una scelta di icone lucide (licenza ISC) con nomi e parole chiave in italiano per la
// ricerca. Nella pagina diventano SVG in linea con `currentColor`: prendono il colore del testo e si
// ridimensionano con `width`/`height` (o con `font-size`, perché misurano 1em).
import { ICON_NODES } from './icon-data'

export interface KitIcon {
  /** Nome lucide in kebab-case (es. `shield-check`). */
  name: string
  /** Parole per la ricerca (italiano). */
  keywords: string
}

export const KIT_ICONS: KitIcon[] = [
  { name: 'zap', keywords: 'fulmine veloce energia rapido' },
  { name: 'shield-check', keywords: 'sicuro sicurezza protezione garanzia' },
  { name: 'lock', keywords: 'lucchetto privacy password sicuro' },
  { name: 'message-circle', keywords: 'messaggio chat supporto assistenza' },
  { name: 'heart', keywords: 'cuore amore preferito' },
  { name: 'star', keywords: 'stella valutazione recensione qualità' },
  { name: 'sparkles', keywords: 'novità magia brillante' },
  { name: 'rocket', keywords: 'razzo lancio partenza crescita' },
  { name: 'check', keywords: 'spunta fatto ok incluso' },
  { name: 'circle-check', keywords: 'spunta cerchio completato' },
  { name: 'clock', keywords: 'orologio tempo orari' },
  { name: 'calendar', keywords: 'calendario data appuntamento evento' },
  { name: 'map-pin', keywords: 'posizione indirizzo luogo mappa dove' },
  { name: 'phone', keywords: 'telefono chiamata contatto' },
  { name: 'mail', keywords: 'email posta contatto messaggio' },
  { name: 'users', keywords: 'persone squadra team clienti' },
  { name: 'user', keywords: 'persona profilo utente' },
  { name: 'globe', keywords: 'mondo internet web lingue' },
  { name: 'leaf', keywords: 'foglia natura ecologico bio' },
  { name: 'sun', keywords: 'sole estate luce' },
  { name: 'moon', keywords: 'luna notte scuro' },
  { name: 'camera', keywords: 'fotocamera foto immagini' },
  { name: 'music', keywords: 'musica nota audio' },
  { name: 'book-open', keywords: 'libro lettura corso studio' },
  { name: 'graduation-cap', keywords: 'laurea scuola formazione' },
  { name: 'briefcase', keywords: 'lavoro valigetta azienda' },
  { name: 'shopping-cart', keywords: 'carrello acquisti negozio' },
  { name: 'credit-card', keywords: 'carta pagamento' },
  { name: 'gift', keywords: 'regalo dono offerta' },
  { name: 'truck', keywords: 'consegna spedizione camion' },
  { name: 'coffee', keywords: 'caffè bar pausa' },
  { name: 'utensils', keywords: 'ristorante cibo posate cucina' },
  { name: 'house', keywords: 'casa home abitazione' },
  { name: 'wrench', keywords: 'chiave strumenti riparazione assistenza' },
  { name: 'settings', keywords: 'impostazioni ingranaggio configurazione' },
  { name: 'chart-column', keywords: 'grafico statistiche dati risultati' },
  { name: 'trending-up', keywords: 'crescita aumento successo' },
  { name: 'target', keywords: 'obiettivo bersaglio precisione' },
  { name: 'lightbulb', keywords: 'idea lampadina creatività' },
  { name: 'palette', keywords: 'tavolozza colori design arte' },
  { name: 'code', keywords: 'codice programmazione sviluppo' },
  { name: 'smartphone', keywords: 'telefono cellulare app mobile' },
  { name: 'wifi', keywords: 'rete connessione internet' },
  { name: 'award', keywords: 'premio medaglia riconoscimento' },
  { name: 'thumbs-up', keywords: 'pollice mi piace approvato' },
  { name: 'arrow-right', keywords: 'freccia destra avanti continua' },
  { name: 'play', keywords: 'avvia video riproduci' },
  { name: 'download', keywords: 'scarica download' },
  { name: 'search', keywords: 'cerca ricerca lente' },
  { name: 'bell', keywords: 'campanella notifiche avvisi' },
  { name: 'dumbbell', keywords: 'palestra sport allenamento fitness' },
  { name: 'stethoscope', keywords: 'medico salute dottore' },
  { name: 'paw-print', keywords: 'animali zampa veterinario cane gatto' },
  { name: 'plane', keywords: 'aereo viaggio vacanza' },
  { name: 'handshake', keywords: 'stretta di mano accordo partner fiducia' },
  { name: 'infinity', keywords: 'infinito illimitato sempre' }
]

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Ricerca: tutte le parole devono comparire nel nome o nelle parole chiave. */
export function searchIcons(query: string): KitIcon[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return KIT_ICONS
  return KIT_ICONS.filter((icon) => {
    const haystack = normalize(`${icon.name} ${icon.keywords}`)
    return words.every((w) => haystack.includes(w))
  })
}

const escapeAttr = (value: string | number) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** SVG in linea dell'icona `name` (null se non è fra quelle del kit). */
export function iconSvg(name: string): string | null {
  const nodes = ICON_NODES[name]
  if (!nodes) return null
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}/>`).join('')
  return inlineIconSvg(name, inner)
}

/** Nome lucide (`shield-check`) → nome del componente React (`ShieldCheck`). */
export const iconComponentName = (name: string): string =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

/**
 * SVG in linea pronto per la pagina: misura 1em (segue la dimensione del testo), colore del testo,
 * nascosto ai lettori di schermo (è decorativo: il significato lo dà il testo accanto).
 */
export function inlineIconSvg(name: string, inner: string): string {
  return `<svg class="lab-icona-svg" data-icona="${name}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
}

export const ICON_CSS = `.lab-icona-svg {
  width: 1em;
  height: 1em;
  flex: none;
  vertical-align: -0.125em;
}`
