// Genera le icone dell'app da build/icon.svg con Electron (Chromium disegna l'SVG):
//   build/icon.ico            per l'eseguibile e l'installer (16…256 px, PNG dentro l'ICO)
//   build/icon.png            512 px (README, GitHub)
//   resources/icon.png        256 px (icona della finestra)
//   src/renderer/assets/logo.svg  per la barra in alto
// Uso: npx electron scripts/make-icons.mjs
import { app, BrowserWindow } from 'electron'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

/** Disegna l'SVG su un canvas della dimensione richiesta e restituisce il PNG (con trasparenza). */
let page = null
async function render(size) {
  if (!page) {
    page = new BrowserWindow({ width: 600, height: 600, show: false })
    await page.loadURL('data:text/html,<html><body></body></html>')
  }
  const dataUrl = await page.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ${size}
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, ${size}, ${size})
    return canvas.toDataURL('image/png')
  })()`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO con immagini PNG (formato accettato da Windows Vista in poi). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

app.whenReady().then(async () => {
  const images = []
  for (const size of ICO_SIZES) images.push({ size, png: await render(size) })
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(images))
  writeFileSync(join(root, 'build', 'icon.png'), await render(512))
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(join(root, 'resources', 'icon.png'), images.find((i) => i.size === 256).png)
  mkdirSync(join(root, 'src', 'renderer', 'assets'), { recursive: true })
  copyFileSync(join(root, 'build', 'icon.svg'), join(root, 'src', 'renderer', 'assets', 'logo.svg'))
  console.log('Icone generate:', ICO_SIZES.join(', '), '+ 512')
  page?.destroy()
  app.quit()
})
