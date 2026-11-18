# Lo Studio 3D: scene in tre dimensioni

Lo Studio 3D modifica i file `.scene3d.json` del progetto con Three.js: forme, luci, materiali e animazioni, senza scrivere codice.

1. **Nuova scena 3D** (menu Crea, palette comandi o tasto destro di Esplora): scegli una **scena pronta** da cui partire.
2. **Aggiungi** una forma (cubo, sfera, ciambella…) o una luce. Clic su un oggetto per sceglierlo, nella vista o nell'albero.
3. **Maniglie**: **W** sposta, **E** ruota, **R** scala. Trascina con il tasto sinistro sul vuoto per girare attorno alla scena, la rotellina avvicina.
4. **Ispettore** a destra: posizione, materiale (colore, metallo, ruvidità), luce, animazione. Senza niente scelto: sfondo, griglia, ombre, nebbia e camera.
5. **Albero**: trascina un oggetto su un altro per metterlo dentro (si muovono insieme), sopra o sotto per riordinare.

## Trucchi

- **Ctrl+Z / Ctrl+Y** annullano e ripetono, **Ctrl+D** duplica, **Canc** elimina.
- **Mostra codice**: il modulo Three.js della scena, con le righe dell'oggetto scelto evidenziate.
- **Salva immagine** crea un PNG; **Usa questa vista come camera** decide da dove si vedrà la scena nelle pagine.
- **Nelle pagine**: nel designer, blocco **Scena 3D** della palette. Three viene copiato nel progetto (`vendor/three`) e il codice della scena si rigenera ogni volta che la salvi.
- Senza WebGL (scheda video assente) lo Studio mostra una vista dall'alto semplificata: si lavora lo stesso con albero e ispettore.
