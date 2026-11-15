import { describe, expect, it } from 'vitest'
import { launchCandidates } from '../../src/main/launch-args'
import { projectRelative } from '../../src/shared/launch-args'

const app = 'C:\\Program Files\\Easey IDE\\resources\\app.asar'
const cwd = 'C:\\Users\\ada'

describe('argomenti della riga di comando', () => {
  it('il file passato da Easey DB, anche fra virgolette e con gli spazi', () => {
    expect(launchCandidates(['C:\\Programs\\Easey IDE\\Easey IDE.exe', 'C:\\Users\\ada\\Documents\\Easey DB\\Esempi\\query 1.sql'], app, cwd)).toEqual(['C:\\Users\\ada\\Documents\\Easey DB\\Esempi\\query 1.sql'])
    expect(launchCandidates(['Easey IDE.exe', '"C:\\Progetti\\Sito"'], app, cwd)).toEqual(['C:\\Progetti\\Sito'])
  })

  it('mai le opzioni di Electron e di Chromium, né il programma stesso', () => {
    expect(launchCandidates(['electron.exe', '--inspect=0', '--remote-debugging-port=0', '-x', '--allow-file-access-from-files', 'D:\\a.py'], app, cwd)).toEqual(['D:\\a.py'])
    expect(launchCandidates(['Easey IDE.exe'], app, cwd)).toEqual([])
  })

  it('mai la cartella dell’app né i suoi file (`electron .` in sviluppo e nei collaudi)', () => {
    const repo = 'C:\\Users\\ada\\IDE'
    expect(launchCandidates(['electron.exe', '.'], repo, repo)).toEqual([])
    expect(launchCandidates(['electron.exe', 'C:\\Users\\ada\\IDE\\out\\main\\index.js', 'D:\\x.js'], repo, repo)).toEqual(['D:\\x.js'])
  })

  it('percorsi relativi alla cartella da cui parte il comando; niente indirizzi', () => {
    expect(launchCandidates(['Easey IDE.exe', 'esempi\\prova.py'], app, cwd)).toEqual(['C:\\Users\\ada\\esempi\\prova.py'])
    expect(launchCandidates(['Easey IDE.exe', 'easey-ide://apri', 'file:///C:/a.py'], app, cwd)).toEqual([])
  })

  it('un file dentro il progetto aperto (senza badare a maiuscole e barre)', () => {
    expect(projectRelative('C:\\Progetti\\Sito', 'c:/progetti/sito/src/app.js')).toBe('src/app.js')
    expect(projectRelative('C:\\Progetti\\Sito\\', 'C:\\Progetti\\Sito\\index.html')).toBe('index.html')
    expect(projectRelative('C:\\Progetti\\Sito', 'C:\\Progetti\\Sito2\\a.js')).toBeNull()
  })
})
