// Elementi e blocchi pronti della palette del designer. Ogni blocco porta, se serve, le regole CSS
// che lo rendono bello: vengono aggiunte al foglio di stile una volta sola.

export type BlockCategory = 'struttura' | 'testo' | 'moduli' | 'media' | 'sezioni'

export interface Block {
  id: string
  label: string
  category: BlockCategory
  html: string
  css?: string
  /** Dimensioni iniziali quando si inserisce in una tavola libera. */
  freeSize?: { width: number; height: number }
}

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  struttura: 'Struttura',
  testo: 'Testo',
  moduli: 'Moduli',
  media: 'Immagini e media',
  sezioni: 'Sezioni pronte'
}

const SECTION_CSS = `.lab-sezione {
  padding: 64px 24px;
  max-width: 1080px;
  margin: 0 auto;
}`

export const BLOCKS: Block[] = [
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
    css: '.lab-griglia {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: 20px;\n}\n\n.lab-scheda {\n  padding: 20px;\n  border-radius: 14px;\n  background: #ffffff;\n  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);\n}'
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
    css: '.lab-modulo {\n  display: grid;\n  gap: 8px;\n  max-width: 420px;\n}\n\n.lab-modulo input,\n.lab-modulo textarea {\n  padding: 10px;\n  border: 1px solid #cfd5df;\n  border-radius: 8px;\n  font: inherit;\n}'
  },
  { id: 'campo', label: 'Campo di testo', category: 'moduli', html: '<input type="text" placeholder="Scrivi qui">', freeSize: { width: 220, height: 40 } },
  { id: 'area', label: 'Area di testo', category: 'moduli', html: '<textarea rows="4" placeholder="Testo lungo"></textarea>', freeSize: { width: 280, height: 100 } },
  { id: 'selezione', label: 'Menu a tendina', category: 'moduli', html: '<select>\n  <option>Prima scelta</option>\n  <option>Seconda scelta</option>\n</select>', freeSize: { width: 200, height: 40 } },
  { id: 'spunta', label: 'Casella di spunta', category: 'moduli', html: '<label><input type="checkbox"> Accetto</label>', freeSize: { width: 160, height: 28 } },
  { id: 'immagine', label: 'Immagine', category: 'media', html: '<img src="https://picsum.photos/600/360" alt="Descrivi l’immagine" width="600" height="360">', freeSize: { width: 300, height: 180 } },
  { id: 'video', label: 'Video', category: 'media', html: '<video controls width="480"></video>', freeSize: { width: 320, height: 180 } },
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
    css: '.lab-hero {\n  padding: 96px 24px;\n  text-align: center;\n  color: #ffffff;\n  background: linear-gradient(135deg, #4f46e5, #9333ea);\n}\n\n.lab-hero h1 {\n  font-size: 48px;\n  margin: 0 0 12px;\n}\n\n.lab-bottone {\n  display: inline-block;\n  margin-top: 16px;\n  padding: 12px 24px;\n  border-radius: 999px;\n  background: #ffffff;\n  color: #4f46e5;\n  font-weight: 700;\n  text-decoration: none;\n}'
  },
  {
    id: 'prezzi',
    label: 'Schede prezzi',
    category: 'sezioni',
    html: '<section class="lab-sezione">\n  <h2>Prezzi</h2>\n  <div class="lab-griglia">\n    <article class="lab-scheda">\n      <h3>Base</h3>\n      <p><strong>9 €</strong> al mese</p>\n    </article>\n    <article class="lab-scheda">\n      <h3>Pro</h3>\n      <p><strong>19 €</strong> al mese</p>\n    </article>\n    <article class="lab-scheda">\n      <h3>Team</h3>\n      <p><strong>49 €</strong> al mese</p>\n    </article>\n  </div>\n</section>',
    css: `${SECTION_CSS}\n\n.lab-griglia {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: 20px;\n}\n\n.lab-scheda {\n  padding: 20px;\n  border-radius: 14px;\n  background: #ffffff;\n  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);\n}`
  },
  {
    id: 'galleria',
    label: 'Galleria di immagini',
    category: 'sezioni',
    html: '<section class="lab-galleria">\n  <img src="https://picsum.photos/id/10/400/300" alt="Foto 1">\n  <img src="https://picsum.photos/id/20/400/300" alt="Foto 2">\n  <img src="https://picsum.photos/id/30/400/300" alt="Foto 3">\n</section>',
    css: '.lab-galleria {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n  gap: 12px;\n  padding: 24px;\n}\n\n.lab-galleria img {\n  width: 100%;\n  border-radius: 10px;\n}'
  },
  {
    id: 'piede',
    label: 'Piè di pagina',
    category: 'sezioni',
    html: '<footer class="lab-piede">\n  <p>© 2026 Il mio sito · Fatto con Easey IDE</p>\n</footer>',
    css: '.lab-piede {\n  padding: 24px;\n  text-align: center;\n  color: #6b7385;\n  border-top: 1px solid #e5e8ef;\n}'
  }
]

export function blockById(id: string): Block | undefined {
  return BLOCKS.find((b) => b.id === id)
}
