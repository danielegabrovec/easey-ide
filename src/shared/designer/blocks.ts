// Elementi e blocchi pronti della palette del designer. Ogni blocco porta, se serve, le regole CSS
// che lo rendono bello: vengono aggiunte al foglio di stile una regola alla volta, senza doppioni.
// I colori dei blocchi usano le variabili dei temi (`--colore-primario`…) con un valore di riserva:
// scegliendo un tema nella scheda «Sito» si ricolora tutta la pagina.

import { ICON_CSS, iconSvg } from '../design-kit/icons'

export type BlockCategory = 'struttura' | 'testo' | 'moduli' | 'media' | 'sezioni' | 'modelli'

export interface Block {
  id: string
  label: string
  category: BlockCategory
  html: string
  css?: string
  /** Parole in più per la ricerca nella palette. */
  keywords?: string
  /** Dimensioni iniziali quando si inserisce in una tavola libera. */
  freeSize?: { width: number; height: number }
}

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  struttura: 'Struttura',
  testo: 'Testo',
  moduli: 'Moduli',
  media: 'Immagini e media',
  sezioni: 'Sezioni pronte',
  modelli: 'Pagine intere'
}

const PRIMARY = 'var(--colore-primario, #4f46e5)'
const SECONDARY = 'var(--colore-secondario, #9333ea)'
const SURFACE = 'var(--colore-superficie, #ffffff)'
const MUTED = 'var(--colore-tenue, #6b7385)'

const BUTTON_CSS = `.lab-bottone {
  display: inline-block;
  margin-top: 16px;
  padding: 12px 24px;
  border-radius: 999px;
  background: #ffffff;
  color: ${PRIMARY};
  font-weight: 700;
  text-decoration: none;
}`

const GRID_CSS = `.lab-griglia {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.lab-scheda {
  padding: 20px;
  border-radius: 14px;
  background: ${SURFACE};
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}`

const FORM_CSS = `.lab-modulo {\n  display: grid;\n  gap: 8px;\n  max-width: 420px;\n}\n\n.lab-modulo input,\n.lab-modulo textarea {\n  padding: 10px 12px;\n  border: 1px solid #cfd5df;\n  border-radius: 8px;\n  font: inherit;\n}\n\n.lab-modulo button {\n  justify-self: start;\n  margin-top: 8px;\n  padding: 12px 24px;\n  border: 0;\n  border-radius: 10px;\n  background: ${PRIMARY};\n  color: #ffffff;\n  font: inherit;\n  font-weight: 600;\n  cursor: pointer;\n}`

/** Icona SVG del kit (lucide), in linea e del colore del testo. */
const icon = (name: string) => iconSvg(name)!

/** Riquadro morbido attorno a un'icona (caratteristiche, servizi). */
const ICON_TILE_CSS = `.lab-icona {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--colore-primario, #4f46e5) 12%, transparent);
  color: var(--colore-primario, #4f46e5);
  font-size: 24px;
}`

const IMAGE_CSS = `.lab-immagine {
  display: block;
  width: 100%;
  max-width: 640px;
  height: auto;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: 12px;
}`

/**
 * Regole di base di una pagina intera: le immagini non escono mai dal loro contenitore e la pagina
 * occupa tutta la larghezza (il body lo sistema l'azione che inserisce la pagina, vedi PAGE_BODY_RESET).
 */
export const PAGE_CSS = `img {
  max-width: 100%;
  height: auto;
}

.lab-pagina {
  width: 100%;
}`

/** Proprietà del body tolte o fissate inserendo una pagina intera (es. il body «centrato» dei modelli vecchi). */
export const PAGE_BODY_RESET: Record<string, string | null> = { margin: '0', display: null, 'place-items': null, 'place-content': null, 'align-items': null, 'justify-content': null, 'justify-items': null }

const SECTION_CSS = `.lab-sezione {
  padding: 64px 24px;
  max-width: 1080px;
  margin: 0 auto;
}`

const BASE_BLOCKS: Block[] = [
  { id: 'tavola', label: 'Tavola libera (stile Canva)', category: 'struttura', html: '<div class="tavola"></div>', css: '.tavola {\n  position: relative;\n  width: 100%;\n  max-width: 960px;\n  height: 520px;\n  margin: 24px auto;\n  overflow: hidden;\n  background: #ffffff;\n}' },
  { id: 'sezione', label: 'Sezione', category: 'struttura', html: '<section class="lab-sezione">\n  <h2>Titolo della sezione</h2>\n  <p>Scrivi qui il contenuto.</p>\n</section>', css: SECTION_CSS },
  { id: 'contenitore', label: 'Contenitore', category: 'struttura', html: '<div>\n  <p>Contenuto</p>\n</div>', freeSize: { width: 240, height: 140 } },
  {
    id: 'colonne',
    label: 'Due colonne',
    category: 'struttura',
    html: '<div class="lab-colonne">\n  <div>\n    <h3>Colonna 1</h3>\n    <p>Testo della prima colonna.</p>\n  </div>\n  <div>\n    <h3>Colonna 2</h3>\n    <p>Testo della seconda colonna.</p>\n  </div>\n</div>',
    css: '.lab-colonne {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 24px;\n}\n\n@media (max-width: 600px) {\n  .lab-colonne {\n    grid-template-columns: 1fr;\n  }\n}'
  },
  {
    id: 'griglia',
    label: 'Griglia di tre schede',
    category: 'struttura',
    html: '<div class="lab-griglia">\n  <article class="lab-scheda">\n    <h3>Prima</h3>\n    <p>Descrizione breve.</p>\n  </article>\n  <article class="lab-scheda">\n    <h3>Seconda</h3>\n    <p>Descrizione breve.</p>\n  </article>\n  <article class="lab-scheda">\n    <h3>Terza</h3>\n    <p>Descrizione breve.</p>\n  </article>\n</div>',
    keywords: 'card schede tre colonne',
    css: GRID_CSS
  },
  { id: 'titolo', label: 'Titolo grande', category: 'testo', html: '<h1>Titolo</h1>', freeSize: { width: 420, height: 64 } },
  { id: 'sottotitolo', label: 'Sottotitolo', category: 'testo', html: '<h2>Sottotitolo</h2>', freeSize: { width: 360, height: 48 } },
  { id: 'paragrafo', label: 'Paragrafo', category: 'testo', html: '<p>Scrivi qui il tuo testo. Doppio clic per modificarlo direttamente.</p>', freeSize: { width: 320, height: 60 } },
  { id: 'link', label: 'Link', category: 'testo', html: '<a href="#">Un collegamento</a>', freeSize: { width: 160, height: 24 } },
  { id: 'elenco', label: 'Elenco puntato', category: 'testo', html: '<ul>\n  <li>Primo punto</li>\n  <li>Secondo punto</li>\n  <li>Terzo punto</li>\n</ul>', freeSize: { width: 260, height: 90 } },
  { id: 'citazione', label: 'Citazione', category: 'testo', html: '<blockquote>Una frase importante da mettere in evidenza.</blockquote>', freeSize: { width: 320, height: 70 } },
  { id: 'pulsante', label: 'Pulsante', category: 'moduli', html: '<button type="button">Clicca qui</button>', freeSize: { width: 140, height: 44 } },
  {
    id: 'modulo',
    label: 'Modulo di contatto',
    category: 'moduli',
    html: '<form class="lab-modulo">\n  <label for="nome">Nome</label>\n  <input id="nome" name="nome" type="text" placeholder="Il tuo nome">\n  <label for="email">Email</label>\n  <input id="email" name="email" type="email" placeholder="nome@esempio.it">\n  <label for="messaggio">Messaggio</label>\n  <textarea id="messaggio" name="messaggio" rows="4"></textarea>\n  <button type="submit">Invia</button>\n</form>',
    keywords: 'form contatti email',
    css: FORM_CSS
  },
  { id: 'campo', label: 'Campo di testo', category: 'moduli', html: '<input type="text" placeholder="Scrivi qui">', freeSize: { width: 220, height: 40 } },
  { id: 'area', label: 'Area di testo', category: 'moduli', html: '<textarea rows="4" placeholder="Testo lungo"></textarea>', freeSize: { width: 280, height: 100 } },
  { id: 'selezione', label: 'Menu a tendina', category: 'moduli', html: '<select>\n  <option>Prima scelta</option>\n  <option>Seconda scelta</option>\n</select>', freeSize: { width: 200, height: 40 } },
  { id: 'spunta', label: 'Casella di spunta', category: 'moduli', html: '<label><input type="checkbox"> Accetto</label>', freeSize: { width: 160, height: 28 } },
  { id: 'immagine', label: 'Immagine', category: 'media', html: '<img class="lab-immagine" src="img/segnaposto-foto-1.svg" alt="Descrivi l’immagine" width="1200" height="800">', css: IMAGE_CSS, keywords: 'foto figura picture', freeSize: { width: 300, height: 200 } },
  { id: 'video', label: 'Video', category: 'media', html: '<video controls width="480"></video>', freeSize: { width: 320, height: 180 } },
  { id: 'icona', label: 'Icona', category: 'media', html: `<span class="lab-icona">${icon('sparkles')}</span>`, css: `${ICON_TILE_CSS}\n\n${ICON_CSS}`, keywords: 'icona simbolo svg lucide pittogramma', freeSize: { width: 48, height: 48 } },
  { id: 'emoji', label: 'Emoji grande', category: 'media', html: '<span class="lab-emoji">🚀</span>', css: '.lab-emoji {\n  font-size: 64px;\n  line-height: 1;\n}', freeSize: { width: 80, height: 80 } },
  { id: 'forma', label: 'Forma colorata', category: 'media', html: '<div class="lab-forma"></div>', css: '.lab-forma {\n  width: 120px;\n  height: 120px;\n  border-radius: 24px;\n  background: linear-gradient(135deg, #6d7cff, #b26dff);\n}', freeSize: { width: 120, height: 120 } },
  {
    id: 'intestazione',
    label: 'Intestazione con menu',
    category: 'sezioni',
    html: '<header class="lab-intestazione">\n  <strong class="lab-logo">Il mio sito</strong>\n  <nav>\n    <a href="#">Home</a>\n    <a href="#">Chi sono</a>\n    <a href="#">Contatti</a>\n  </nav>\n</header>',
    css: '.lab-intestazione {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 16px 24px;\n  background: #ffffff;\n  border-bottom: 1px solid #e5e8ef;\n}\n\n.lab-intestazione nav {\n  display: flex;\n  gap: 20px;\n}\n\n.lab-intestazione a {\n  color: inherit;\n  text-decoration: none;\n}'
  },
  {
    id: 'hero',
    label: 'Copertina (hero)',
    category: 'sezioni',
    html: '<section class="lab-hero">\n  <h1>Un titolo che colpisce</h1>\n  <p>Una frase che spiega in breve di cosa si tratta.</p>\n  <a class="lab-bottone" href="#">Scopri di più</a>\n</section>',
    keywords: 'banner apertura titolo principale',
    css: `.lab-hero {\n  padding: 96px 24px;\n  text-align: center;\n  color: #ffffff;\n  background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});\n}\n\n.lab-hero h1 {\n  max-width: 22ch;\n  margin: 0 auto 16px;\n  font-size: clamp(2.25rem, 1.5rem + 3vw, 3.5rem);\n  line-height: 1.1;\n  text-wrap: balance;\n}\n\n.lab-hero p {\n  max-width: 56ch;\n  margin: 0 auto;\n  font-size: 1.125rem;\n}\n\n${BUTTON_CSS}`
  },
  {
    id: 'prezzi',
    label: 'Schede prezzi',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <h2>Prezzi</h2>\n  <div class="lab-griglia">\n    <article class="lab-scheda">\n      <h3>Base</h3>\n      <p><strong>9 €</strong> al mese</p>\n    </article>\n    <article class="lab-scheda">\n      <h3>Pro</h3>\n      <p><strong>19 €</strong> al mese</p>\n    </article>\n    <article class="lab-scheda">\n      <h3>Team</h3>\n      <p><strong>49 €</strong> al mese</p>\n    </article>\n  </div>\n</section>',
    keywords: 'listino abbonamenti piani costi',
    css: `${SECTION_CSS}\n\n${GRID_CSS}`
  },
  {
    id: 'galleria',
    label: 'Galleria di immagini',
    category: 'sezioni',
    html: '<section class="lab-galleria">\n  <img src="img/segnaposto-foto-1.svg" alt="Descrivi la foto 1" width="1200" height="800">\n  <img src="img/segnaposto-foto-2.svg" alt="Descrivi la foto 2" width="1200" height="800">\n  <img src="img/segnaposto-foto-3.svg" alt="Descrivi la foto 3" width="1200" height="800">\n</section>',
    keywords: 'foto immagini album portfolio',
    css: '.lab-galleria {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));\n  gap: 16px;\n  max-width: 1080px;\n  margin: 0 auto;\n  padding: 48px 24px;\n}\n\n.lab-galleria img {\n  display: block;\n  width: 100%;\n  height: auto;\n  aspect-ratio: 4 / 3;\n  object-fit: cover;\n  border-radius: 12px;\n}'
  },
  {
    id: 'piede',
    label: 'Piè di pagina',
    category: 'sezioni',
    html: '<footer class="lab-piede">\n  <p>© 2026 Il mio sito · Fatto con Easey IDE</p>\n</footer>',
    keywords: 'footer fondo copyright',
    css: `.lab-piede {\n  padding: 24px;\n  text-align: center;\n  color: ${MUTED};\n  border-top: 1px solid #e5e8ef;\n}`
  },
  // Elementi in più
  { id: 'separatore', label: 'Linea di separazione', category: 'struttura', html: '<hr class="lab-separatore">', css: '.lab-separatore {\n  border: 0;\n  border-top: 1px solid #e5e8ef;\n  margin: 32px 0;\n}', keywords: 'hr divisore riga', freeSize: { width: 320, height: 2 } },
  { id: 'scheda', label: 'Scheda (card)', category: 'struttura', html: '<article class="lab-scheda">\n  <h3>Titolo della scheda</h3>\n  <p>Una descrizione breve.</p>\n</article>', css: GRID_CSS, keywords: 'card riquadro box', freeSize: { width: 260, height: 160 } },
  { id: 'etichetta', label: 'Etichetta (badge)', category: 'testo', html: '<span class="lab-etichetta">Novità</span>', css: `.lab-etichetta {\n  display: inline-block;\n  padding: 4px 10px;\n  border-radius: 999px;\n  background: color-mix(in srgb, ${PRIMARY} 14%, transparent);\n  color: ${PRIMARY};\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}`, keywords: 'badge tag pillola', freeSize: { width: 90, height: 26 } },
  { id: 'pulsanti', label: 'Coppia di pulsanti', category: 'moduli', html: '<div class="lab-pulsanti">\n  <a class="lab-pulsante" href="#">Inizia ora</a>\n  <a class="lab-pulsante secondario" href="#">Scopri di più</a>\n</div>', css: `.lab-pulsanti {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px;\n}\n\n.lab-pulsante {\n  display: inline-block;\n  padding: 12px 22px;\n  border-radius: 10px;\n  border: 2px solid ${PRIMARY};\n  background: ${PRIMARY};\n  color: #ffffff;\n  font-weight: 600;\n  text-decoration: none;\n}\n\n.lab-pulsante.secondario {\n  background: transparent;\n  color: ${PRIMARY};\n}`, keywords: 'pulsante bottoni azioni cta', freeSize: { width: 320, height: 52 } },
  { id: 'tabella', label: 'Tabella', category: 'testo', html: '<table class="lab-tabella">\n  <thead>\n    <tr><th>Nome</th><th>Ruolo</th><th>Città</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Anna</td><td>Grafica</td><td>Milano</td></tr>\n    <tr><td>Luca</td><td>Sviluppo</td><td>Roma</td></tr>\n  </tbody>\n</table>', css: '.lab-tabella {\n  width: 100%;\n  border-collapse: collapse;\n}\n\n.lab-tabella th,\n.lab-tabella td {\n  padding: 10px 12px;\n  border-bottom: 1px solid #e5e8ef;\n  text-align: left;\n}', keywords: 'table dati righe colonne', freeSize: { width: 420, height: 130 } },
  // Sezioni in più
  {
    id: 'caratteristiche',
    label: 'Caratteristiche con icone',
    category: 'sezioni',
    html: `<section class="lab-sezione">\n  <h2>Perché sceglierci</h2>\n  <div class="lab-griglia">\n    <article class="lab-scheda">\n      <span class="lab-icona">${icon('zap')}</span>\n      <h3>Veloce</h3>\n      <p>Tutto pronto in pochi minuti.</p>\n    </article>\n    <article class="lab-scheda">\n      <span class="lab-icona">${icon('shield-check')}</span>\n      <h3>Sicuro</h3>\n      <p>I tuoi dati restano tuoi.</p>\n    </article>\n    <article class="lab-scheda">\n      <span class="lab-icona">${icon('message-circle')}</span>\n      <h3>Seguito</h3>\n      <p>Ti rispondiamo sempre.</p>\n    </article>\n  </div>\n</section>`,
    keywords: 'vantaggi servizi punti di forza features',
    css: `${SECTION_CSS}\n\n${GRID_CSS}\n\n${ICON_TILE_CSS}\n\n${ICON_CSS}`
  },
  {
    id: 'testimonianze',
    label: 'Testimonianze',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <h2>Dicono di noi</h2>\n  <div class="lab-griglia">\n    <blockquote class="lab-scheda lab-voce">\n      <p>«Semplice e curato: lo consiglio.»</p>\n      <cite>Giulia, Torino</cite>\n    </blockquote>\n    <blockquote class="lab-scheda lab-voce">\n      <p>«Risultato oltre le aspettative.»</p>\n      <cite>Marco, Bari</cite>\n    </blockquote>\n  </div>\n</section>',
    keywords: 'recensioni opinioni clienti citazioni',
    css: `${SECTION_CSS}\n\n${GRID_CSS}\n\n.lab-voce {\n  margin: 0;\n}\n\n.lab-voce cite {\n  color: ${MUTED};\n  font-style: normal;\n  font-weight: 600;\n}`
  },
  {
    id: 'faq',
    label: 'Domande frequenti',
    category: 'sezioni',
    html: '<section class="lab-sezione lab-faq">\n  <h2>Domande frequenti</h2>\n  <details>\n    <summary>Quanto costa?</summary>\n    <p>Scrivi qui la risposta.</p>\n  </details>\n  <details>\n    <summary>Come si inizia?</summary>\n    <p>Scrivi qui la risposta.</p>\n  </details>\n</section>',
    keywords: 'faq domande risposte fisarmonica accordion',
    css: `${SECTION_CSS}\n\n.lab-faq details {\n  padding: 14px 0;\n  border-bottom: 1px solid #e5e8ef;\n}\n\n.lab-faq summary {\n  cursor: pointer;\n  font-weight: 600;\n}`
  },
  {
    id: 'cta',
    label: 'Invito all’azione',
    category: 'sezioni',
    html: '<section class="lab-cta">\n  <h2>Pronto a iniziare?</h2>\n  <p>Bastano due minuti.</p>\n  <a class="lab-bottone" href="#">Contattaci</a>\n</section>',
    keywords: 'cta call to action contatto banner finale',
    css: `.lab-cta {\n  margin: 32px auto;\n  max-width: 1080px;\n  padding: 56px 24px;\n  border-radius: 24px;\n  text-align: center;\n  color: #ffffff;\n  background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});\n}\n\n${BUTTON_CSS}`
  },
  {
    id: 'numeri',
    label: 'Numeri in evidenza',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <div class="lab-numeri">\n    <div>\n      <strong>1200+</strong>\n      <span>clienti</span>\n    </div>\n    <div>\n      <strong>15</strong>\n      <span>anni di esperienza</span>\n    </div>\n    <div>\n      <strong>98%</strong>\n      <span>soddisfatti</span>\n    </div>\n  </div>\n</section>',
    keywords: 'statistiche cifre risultati contatori',
    css: `${SECTION_CSS}\n\n.lab-numeri {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));\n  gap: 24px;\n  text-align: center;\n}\n\n.lab-numeri strong {\n  display: block;\n  font-size: 44px;\n  color: ${PRIMARY};\n}\n\n.lab-numeri span {\n  color: ${MUTED};\n}`
  },
  {
    id: 'squadra',
    label: 'Squadra',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <h2>Chi siamo</h2>\n  <div class="lab-griglia lab-squadra">\n    <article>\n      <img src="img/segnaposto-persona-1.svg" alt="Foto di Sara" width="480" height="480">\n      <h3>Sara</h3>\n      <p>Fondatrice</p>\n    </article>\n    <article>\n      <img src="img/segnaposto-persona-2.svg" alt="Foto di Paolo" width="480" height="480">\n      <h3>Paolo</h3>\n      <p>Progettista</p>\n    </article>\n  </div>\n</section>',
    keywords: 'team persone staff chi siamo',
    css: `${SECTION_CSS}\n\n${GRID_CSS}\n\n.lab-squadra {\n  text-align: center;\n}\n\n.lab-squadra img {\n  width: 120px;\n  height: 120px;\n  border-radius: 50%;\n  object-fit: cover;\n}`
  },
  {
    id: 'contatti',
    label: 'Contatti con modulo',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <div class="lab-colonne">\n    <div>\n      <h2>Contattaci</h2>\n      <p>Via Roma 1, Milano</p>\n      <p><a href="mailto:info@esempio.it">info@esempio.it</a></p>\n    </div>\n    <form class="lab-modulo">\n      <label for="contatto-nome">Nome</label>\n      <input id="contatto-nome" name="nome" type="text">\n      <label for="contatto-email">Email</label>\n      <input id="contatto-email" name="email" type="email">\n      <button type="submit">Invia</button>\n    </form>\n  </div>\n</section>',
    keywords: 'contatti indirizzo email form modulo',
    css: `${SECTION_CSS}\n\n.lab-colonne {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 24px;\n}\n\n@media (max-width: 600px) {\n  .lab-colonne {\n    grid-template-columns: 1fr;\n  }\n}\n\n${FORM_CSS}`
  }
]

function indentBlock(html: string, indent: string): string {
  return html
    .split('\n')
    .map((line) => (line ? indent + line : line))
    .join('\n')
}

/** Pagina intera fatta di sezioni della palette, in un unico contenitore. */
function pageTemplate(id: string, label: string, sections: string[], keywords: string): Block {
  const parts = sections.map((s) => BASE_BLOCKS.find((b) => b.id === s)!)
  return {
    id,
    label,
    category: 'modelli',
    keywords: `pagina modello template ${keywords}`,
    html: `<div class="lab-pagina">\n${parts.map((p) => indentBlock(p.html, '  ')).join('\n')}\n</div>`,
    css: [PAGE_CSS, ...parts.map((p) => p.css)].filter(Boolean).join('\n\n')
  }
}

export const BLOCKS: Block[] = [
  ...BASE_BLOCKS,
  pageTemplate('pagina-presentazione', 'Presentazione (landing)', ['intestazione', 'hero', 'caratteristiche', 'testimonianze', 'cta', 'piede'], 'landing vetrina prodotto servizio'),
  pageTemplate('pagina-portfolio', 'Portfolio', ['intestazione', 'hero', 'galleria', 'numeri', 'contatti', 'piede'], 'lavori progetti foto'),
  pageTemplate('pagina-attivita', 'Attività locale', ['intestazione', 'hero', 'caratteristiche', 'squadra', 'prezzi', 'faq', 'contatti', 'piede'], 'negozio studio azienda'),
  pageTemplate('pagina-contatti', 'Pagina contatti', ['intestazione', 'contatti', 'faq', 'piede'], 'dove siamo')
]

export function blockById(id: string): Block | undefined {
  return BLOCKS.find((b) => b.id === id)
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Ricerca nella palette: tutte le parole devono comparire in nome, parole chiave o categoria. */
export function searchBlocks(query: string): Block[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return BLOCKS
  return BLOCKS.filter((block) => {
    const haystack = normalize(`${block.label} ${block.keywords ?? ''} ${CATEGORY_LABELS[block.category]} ${block.id}`)
    return words.every((w) => haystack.includes(w))
  })
}
