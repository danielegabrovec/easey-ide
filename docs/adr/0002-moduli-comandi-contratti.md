# ADR 0002 — Workbench, moduli isolati, comandi e contratti

**Stato:** accettata (2026-11-11)

## Contesto
L'IDE crescerà per anni (SQL Lab, designer, programmazione visuale, diagrammi, didattica, AI).
Senza confini, ogni nuova area finirebbe per dipendere da tutte le altre.

## Decisione
- Il **workbench** (shell) gestisce solo layout, comandi, eventi e stato minimo condiviso.
- Ogni area è un **modulo** in `src/renderer/modules/<nome>/` che si attiva da `modules/index.ts`
  registrando pannelli e comandi. I moduli **non si importano** fra loro.
- Le azioni sono **comandi** (registro unico): menu, palette, pulsanti e scorciatoie li richiamano.
- Main e renderer comunicano solo con i canali dichiarati in `src/shared/contracts/ipc.ts`; il preload
  espone esattamente quella whitelist e il main verifica che il mittente sia la finestra principale.

## Conseguenze
- Aggiungere un modulo non tocca gli altri (vedi CONVENTION, "Aggiungere un modulo").
- Prossimo passo: far rispettare i confini anche da un linter (eslint-plugin-boundaries) quando si
  introduce ESLint.
