// Menu dell'applicazione. Ogni voce invia un id di comando al renderer, che lo esegue
// col registro dei comandi del workbench (una sola fonte di verità per le azioni).
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { broadcast } from './ipc/router'

const command = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({
  label,
  accelerator,
  // L'acceleratore è gestito dal renderer (registerAccelerator: false) per non duplicare le scorciatoie.
  registerAccelerator: false,
  click: () => broadcast('menu:command', id)
})

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        command('Nuovo progetto…', 'workspace.newProject', 'Ctrl+Shift+N'),
        command('Apri cartella…', 'workspace.openFolder', 'Ctrl+O'),
        command('Scrittura rapida (senza progetto)', 'quick.open', 'Ctrl+Shift+Q'),
        command('Chiudi progetto', 'workspace.close'),
        { type: 'separator' },
        command('Nuovo file', 'explorer.newFile', 'Ctrl+N'),
        command('Vai al file…', 'workbench.quickOpen', 'Ctrl+P'),
        command('Salva', 'editor.save', 'Ctrl+S'),
        command('Salva tutto', 'editor.saveAll', 'Ctrl+Alt+S'),
        { type: 'separator' },
        command('Esporta come ZIP…', 'project.exportZip'),
        command('Esporta come pagina HTML unica…', 'project.exportHtml'),
        { type: 'separator' },
        { role: 'quit', label: 'Esci' }
      ]
    },
    {
      label: 'Modifica',
      submenu: [
        { role: 'undo', label: 'Annulla' },
        { role: 'redo', label: 'Ripeti' },
        { type: 'separator' },
        { role: 'cut', label: 'Taglia' },
        { role: 'copy', label: 'Copia' },
        { role: 'paste', label: 'Incolla' },
        { role: 'selectAll', label: 'Seleziona tutto' }
      ]
    },
    {
      label: 'Esegui',
      submenu: [
        command('Esegui progetto', 'run.project', 'F5'),
        command('Esegui file nel terminale', 'run.fileInTerminal', 'Ctrl+F5'),
        command('Apri anteprima web', 'run.preview'),
        { type: 'separator' },
        command('Esegui passo passo', 'trace.run', 'Ctrl+F10'),
        command('REPL JavaScript', 'terminal.repl')
      ]
    },
    {
      label: 'Visualizza',
      submenu: [
        command('Palette dei comandi…', 'workbench.commandPalette', 'Ctrl+Shift+P'),
        command('Nuovo terminale', 'terminal.new', 'Ctrl+Shift+`'),
        command('Esplora file', 'explorer.show', 'Ctrl+Shift+E'),
        command('Console', 'run.showConsole'),
        command('Problemi', 'editor.showProblems', 'Ctrl+Shift+M'),
        command('Git', 'git.show', 'Ctrl+Alt+G'),
        command('Lezioni ed esercizi', 'learn.show', 'Ctrl+Alt+L'),
        command('Ripristina disposizione pannelli', 'workbench.resetLayout'),
        { type: 'separator' },
        command('Tema chiaro/scuro', 'workbench.toggleTheme'),
        command('Ingrandisci testo', 'workbench.zoomIn', 'Ctrl+='),
        command('Riduci testo', 'workbench.zoomOut', 'Ctrl+-'),
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
        {
          label: 'Strumenti per sviluppatori',
          accelerator: 'Ctrl+Shift+I',
          click: () => getWindow()?.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Aiuto',
      submenu: [command('Scorciatoie da tastiera', 'workbench.shortcuts'), command('Informazioni', 'workbench.about')]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
