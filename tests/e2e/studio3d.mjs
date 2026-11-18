// Collaudo dello Studio 3D e della scena 3D nelle pagine (1.7). `npm run build` prima.
//  1. «Nuova scena 3D» (dialogo con le scene pronte) crea scene/….scene3d.json e lo apre nello Studio
//  2. aggiungi un cubo, ispettore (posizione), annulla/ripeti, gruppo e trascinamento nell'albero, Canc
//  3. «Mostra codice» con le righe dell'oggetto scelto evidenziate; scena pronta (sostituisce, un passo)
//  4. blocco «Scena 3D» nel designer: Three copiato nel progetto, modulo e immagine accanto alla scena,
//     caricatore e <canvas data-scena>; nel designer si vede l'immagine; salvando la scena il modulo si rifà
//  5. Anteprima: la pagina carica il modulo e Three dal progetto, senza errori
//  6. ripiego 2D senza WebGL: si apre da Esplora, si disegna, si sceglie dall'albero
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consoleText, createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('studio3d')
const { check } = run

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Scene')
  const file = (p) => join(root, ...p.split('/'))
  const read = (p) => (existsSync(file(p)) ? readFileSync(file(p), 'utf8') : '')
  const scene = () => {
    try {
      return JSON.parse(read('scene/stanza.scene3d.json'))
    } catch {
      return null
    }
  }
  const byName = (name) => scene()?.objects.find((o) => o.name === name)
  const row = (name) => page.locator('[data-testid="s3-row"]', { hasText: name }).first()

  // 1. Nuova scena 3D.
  await run.palette('Nuova scena 3D')
  await page.locator('[data-scene-preset="stanza"]').click()
  await page.getByTestId('s3-new-name').fill('Stanza')
  await page.getByTestId('s3-create').click()
  check('«Nuova scena 3D» crea scene/stanza.scene3d.json', !!(await until(() => scene()?.name === 'Stanza', 8000)), read('scene/stanza.scene3d.json').slice(0, 200))
  check('…e la apre nello Studio 3D', !!(await until(() => page.getByTestId('studio3d').isVisible(), 8000)))
  const status = await page.getByTestId('s3-status').innerText()
  check('la vista dice come disegna (WebGL a richiesta o ripiego 2D)', /WebGL|Ripiego 2D/.test(status), status)
  const rows = await until(async () => (await page.getByTestId('s3-row').count()) === scene().objects.length && scene().objects.length, 5000)
  check('l’albero mostra tutti gli oggetti della scena pronta', !!rows, String(await page.getByTestId('s3-row').count()))
  check('la lampada è nell’albero', (await row('Lampada calda').count()) === 1)

  // 2. Aggiungi, ispettore, annulla/ripeti, gruppo, trascinamento, Canc.
  await page.getByTestId('s3-add').click()
  await page.getByTestId('s3-add-box').click()
  check('aggiungi → Cubo: nell’albero e nel file', !!(await until(async () => (await row('Cubo 2').count()) === 1 && !!byName('Cubo 2'), 6000)), JSON.stringify(scene()?.objects.map((o) => o.name)))
  await page.getByTestId('s3-pos-x').fill('2.5')
  await page.getByTestId('s3-pos-x').press('Enter')
  check('ispettore: posizione X scritta nel file', !!(await until(() => byName('Cubo 2')?.position[0] === 2.5, 5000)), JSON.stringify(byName('Cubo 2')?.position))
  await page.getByTestId('s3-undo').click()
  check('annulla: la posizione torna com’era', !!(await until(() => byName('Cubo 2')?.position[0] === 0, 5000)), JSON.stringify(byName('Cubo 2')?.position))
  await page.getByTestId('s3-redo').click()
  check('ripeti: di nuovo 2,5', !!(await until(() => byName('Cubo 2')?.position[0] === 2.5, 5000)))
  await page.getByTestId('s3-add').click()
  await page.getByTestId('s3-add-group').click()
  await until(() => !!byName('Gruppo'), 5000)
  await row('Cubo 2').dragTo(row('Gruppo'))
  const group = await until(() => byName('Gruppo'), 3000)
  check('trascinato sul gruppo: il cubo ci entra (parent)', !!(await until(() => byName('Cubo 2')?.parent === group?.id, 5000)), JSON.stringify(byName('Cubo 2')))
  await row('Cubo 2').click()
  check('scelto nell’albero: l’ispettore lo mostra', (await page.getByTestId('s3-name').inputValue()) === 'Cubo 2')

  // 3. Codice con le righe evidenziate.
  await page.getByTestId('s3-show-code').click()
  const code = page.getByTestId('s3-code')
  check('«Mostra codice»: modulo con montaScena', (await code.innerText()).includes('export function montaScena(canvas)'))
  const hit = await code.locator('.s3-code-line.hit').allInnerTexts()
  check('…le righe dell’oggetto scelto sono evidenziate', hit.length > 2 && hit.some((l) => l.includes('Cubo 2')), hit.slice(0, 3).join(' / '))
  await page.getByTestId('s3-show-code').click()
  await page.getByTestId('studio3d').focus()
  await page.keyboard.press('Delete')
  check('Canc toglie l’oggetto scelto', !!(await until(() => !byName('Cubo 2'), 5000)))
  await page.getByTestId('s3-presets').click()
  await page.getByTestId('s3-preset-logo').click()
  await page.getByTestId('s3-preset-confirm').click()
  check('scena pronta «Logo che gira»: sostituisce la scena', !!(await until(() => scene()?.name === 'Logo che gira', 5000)))
  await page.getByTestId('s3-undo').click()
  check('…e annulla la riporta com’era in un passo', !!(await until(() => scene()?.name === 'Stanza' && !byName('Cubo 2'), 5000)))
  await run.shot('01-studio')

  // 4. Blocco «Scena 3D» nel designer.
  await page.getByTestId('open-designer').click().catch(async () => run.palette('Apri il designer'))
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  await until(async () => (await frame.locator('h1').count()) === 1, 15000)
  await page.getByTestId('designer-palette-search').fill('scena 3d')
  await page.locator('[data-block="scena-3d"]').click()
  await page.getByTestId('scene-pick-stanza.scene3d.json').click()
  const inserted = await until(() => /<canvas[^>]*class="scena-3d"[^>]*data-scena="scene\/stanza\.scene3d\.json"/.test(read('index.html')), 15000)
  check('nella pagina: <canvas class="scena-3d" data-scena="scene/stanza.scene3d.json">', !!inserted, read('index.html').slice(read('index.html').indexOf('<body')))
  check('…e lo script del caricatore in fondo al body', /<script type="module" src="js\/scene-3d\.js"><\/script>\s*<\/body>/.test(read('index.html')))
  check('Three copiato nel progetto (vendor/three)', existsSync(file('vendor/three/three.module.js')) && existsSync(file('vendor/three/three.core.js')))
  check('modulo generato accanto alla scena, con Three dal progetto', /from "\.\.\/vendor\/three\/three\.module\.js"/.test(read('scene/stanza.scene3d.js')) && read('scene/stanza.scene3d.js').includes('export function montaScena'), read('scene/stanza.scene3d.js').slice(0, 300))
  check('caricatore js/scene-3d.js', read('js/scene-3d.js').includes("querySelectorAll('canvas.scena-3d[data-scena]')"))
  check('immagine della scena per il designer', /^<svg[^>]+><image href="data:image\/png;base64,/.test(read('scene/stanza.scene3d.svg')))
  const background = await until(() => frame.locator('canvas.scena-3d').evaluate((el) => el.getAttribute('style') ?? ''), 8000)
  check('nel designer il canvas mostra l’immagine della scena', /scene\/stanza\.scene3d\.svg/.test(background), background)

  // Salvando la scena nello Studio il modulo si rigenera.
  await page.locator('.dv-tab', { hasText: 'Studio 3D' }).first().click()
  await row('Cubo').first().click()
  await page.getByTestId('s3-name').fill('Cubo Rosso')
  await page.getByTestId('s3-name').press('Enter')
  check('salvando la scena il modulo si rigenera', !!(await until(() => read('scene/stanza.scene3d.js').includes('Cubo Rosso'), 8000)))

  // 5. Anteprima: la scena gira davvero.
  await page.locator('.dv-tab', { hasText: 'Designer' }).first().click()
  await page.locator('[data-testid="designer"] .panel-toolbar button[aria-label="Anteprima"]').click()
  await page.waitForSelector('[data-testid="preview-frame"]', { timeout: 15000 })
  const preview = await until(() => page.frames().find((f) => f.url().startsWith('ide-preview://') && f.url().includes('index.html')), 10000)
  // Three segna il canvas su cui crea il renderer (data-engine="three.js r…"): il modulo e Three sono stati caricati ed eseguiti.
  const engine = () => preview.evaluate(() => document.querySelector('canvas.scena-3d')?.getAttribute('data-engine') ?? '')
  const loaded = preview && (await until(async () => /^three\.js r\d+/.test(await engine()), 15000))
  check('Anteprima: la scena gira davvero (modulo e Three dal progetto)', !!loaded, preview ? await engine().catch((e) => String(e)) : page.frames().map((f) => f.url()).join(', '))
  await wait(800)
  const consoleNow = await consoleText(page).catch(() => '')
  check('…senza errori della scena', !/Scena 3D non caricata|Error/i.test(consoleNow), consoleNow.slice(0, 300))
  await run.shot('02-anteprima')

  // 6. Ripiego 2D senza WebGL.
  await run.app.close()
  page = await run.launch()
  // Il ripiego si sceglie prima che lo Studio crei il renderer: si ricarica la finestra con la scelta fatta.
  await page.evaluate(() => localStorage.setItem('easey.studio3d.noWebGL', '1'))
  await page.reload()
  await page.waitForSelector('[data-testid="explorer-tree"]', { timeout: 20000 })
  const sceneRow = page.locator('[data-path="scene/stanza.scene3d.json"]')
  if (!(await sceneRow.isVisible().catch(() => false))) await page.locator('[data-path="scene"]').click()
  await sceneRow.click()
  check('ripiego 2D: la scena si apre da Esplora nello Studio', !!(await until(() => page.getByTestId('studio3d').isVisible(), 10000)))
  const fallbackOn = await until(async () => (await page.getByTestId('studio3d').getAttribute('data-fallback')) === '1' && /Ripiego 2D/.test(await page.getByTestId('s3-status').innerText()), 6000)
  check('…e dice che disegna in 2D', !!fallbackOn, await page.getByTestId('s3-status').innerText())
  const painted = await until(() => page.getByTestId('s3-canvas').evaluate((c) => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const colours = new Set()
    for (let i = 0; i < data.length; i += 4 * 97) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    return colours.size > 3
  }), 6000)
  check('…la vista è disegnata (griglia e sagome)', !!painted)
  await row('Sfera').click()
  check('…si sceglie dall’albero e si modifica come prima', (await page.getByTestId('s3-name').inputValue()) === 'Sfera')

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
