// Blockly per l'IDE: lingua italiana, temi, blocchi "Pagina" (eventi ed elementi del sito) e generatori JS.
import * as Blockly from 'blockly'
import { javascriptGenerator, Order } from 'blockly/javascript'
import * as It from 'blockly/msg/it'
import type { VisualTarget } from '@shared/visual/program'

let configured = false
let elementIds: string[] = []

/** Id degli elementi delle pagine del progetto, mostrati nei menu dei blocchi "Pagina". */
export function setElementIds(ids: string[]): void {
  elementIds = ids
}

const EVENTS: [string, string][] = [
  ['clic', 'click'],
  ['scrittura', 'input'],
  ['cambio valore', 'change'],
  ['mouse sopra', 'mouseover'],
  ['mouse fuori', 'mouseout'],
  ['tasto premuto', 'keydown']
]

const STYLES: [string, string][] = [
  ['colore del testo', 'color'],
  ['sfondo', 'backgroundColor'],
  ['dimensione del testo', 'fontSize'],
  ['visualizzazione', 'display'],
  ['opacità', 'opacity'],
  ['larghezza', 'width'],
  ['altezza', 'height']
]

function elementField(): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(function (this: Blockly.FieldDropdown) {
    const current = this.getValue?.() as string | null
    const values = new Set(elementIds.map((id) => `#${id}`))
    if (current) values.add(current)
    const options = [...values].map((v) => [v, v] as [string, string])
    return options.length ? options : [['(nessun id nella pagina)', 'body']]
  })
}

const quote = (value: string) => JSON.stringify(value || 'body')

function defineBlocks(): void {
  const PAGE = 20
  Blockly.Blocks['lab_on_event'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('quando').appendField(new Blockly.FieldDropdown(EVENTS), 'EVENT').appendField('su').appendField(elementField(), 'EL')
      this.appendStatementInput('DO').appendField('fai')
      this.setColour(PAGE)
      this.setTooltip('Esegue i blocchi interni quando succede l’evento sull’elemento della pagina.')
    }
  }
  Blockly.Blocks['lab_on_load'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('quando la pagina è pronta')
      this.appendStatementInput('DO').appendField('fai')
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_every'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('ogni').appendField(new Blockly.FieldNumber(1000, 10), 'MS').appendField('millisecondi')
      this.appendStatementInput('DO').appendField('fai')
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_set_text'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('VALUE').appendField('imposta il testo di').appendField(elementField(), 'EL').appendField('a')
      this.setPreviousStatement(true)
      this.setNextStatement(true)
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_set_style'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('VALUE').appendField('imposta').appendField(new Blockly.FieldDropdown(STYLES), 'PROP').appendField('di').appendField(elementField(), 'EL').appendField('a')
      this.setPreviousStatement(true)
      this.setNextStatement(true)
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_class'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['alterna', 'toggle'], ['aggiungi', 'add'], ['togli', 'remove']]), 'ACTION')
        .appendField('la classe')
        .appendField(new Blockly.FieldTextInput('attivo'), 'CLASS')
        .appendField('su')
        .appendField(elementField(), 'EL')
      this.setPreviousStatement(true)
      this.setNextStatement(true)
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_get_text'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('testo di').appendField(elementField(), 'EL')
      this.setOutput(true, 'String')
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_get_value'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('valore del campo').appendField(elementField(), 'EL')
      this.setOutput(true, 'String')
      this.setColour(PAGE)
    }
  }
  Blockly.Blocks['lab_console'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('VALUE').appendField('scrivi in console')
      this.setPreviousStatement(true)
      this.setNextStatement(true)
      this.setColour(160)
    }
  }

  const el = (block: Blockly.Block) => `document.querySelector(${quote(String(block.getFieldValue('EL') ?? ''))})`
  const value = (block: Blockly.Block, generator: typeof javascriptGenerator, fallback = "''") => generator.valueToCode(block, 'VALUE', Order.NONE) || fallback
  javascriptGenerator.forBlock['lab_on_event'] = (block, generator) =>
    `${el(block)}.addEventListener(${JSON.stringify(block.getFieldValue('EVENT'))}, (event) => {\n${generator.statementToCode(block, 'DO')}});\n`
  javascriptGenerator.forBlock['lab_on_load'] = (block, generator) => `{\n${generator.statementToCode(block, 'DO')}}\n`
  javascriptGenerator.forBlock['lab_every'] = (block, generator) => `setInterval(() => {\n${generator.statementToCode(block, 'DO')}}, ${Number(block.getFieldValue('MS')) || 1000});\n`
  javascriptGenerator.forBlock['lab_set_text'] = (block, generator) => `${el(block)}.textContent = ${value(block, generator)};\n`
  javascriptGenerator.forBlock['lab_set_style'] = (block, generator) => `${el(block)}.style.${block.getFieldValue('PROP')} = ${value(block, generator)};\n`
  javascriptGenerator.forBlock['lab_class'] = (block) => `${el(block)}.classList.${block.getFieldValue('ACTION')}(${JSON.stringify(block.getFieldValue('CLASS') ?? '')});\n`
  javascriptGenerator.forBlock['lab_get_text'] = (block) => [`${el(block)}.textContent`, Order.MEMBER]
  javascriptGenerator.forBlock['lab_get_value'] = (block) => [`${el(block)}.value`, Order.MEMBER]
  javascriptGenerator.forBlock['lab_console'] = (block, generator) => `console.log(${value(block, generator)});\n`
  // "stampa" di Blockly: in console invece di alert (funziona sia nella pagina sia nel terminale).
  javascriptGenerator.forBlock['text_print'] = (block, generator) => `console.log(${generator.valueToCode(block, 'TEXT', Order.NONE) || "''"});\n`
}

export function setupBlockly(): typeof Blockly {
  if (configured) return Blockly
  configured = true
  Blockly.setLocale(It as unknown as Record<string, string>)
  defineBlocks()
  Blockly.Theme.defineTheme('lab-dark', {
    name: 'lab-dark',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#1c1f26',
      toolboxBackgroundColour: '#16181d',
      toolboxForegroundColour: '#e3e6ed',
      flyoutBackgroundColour: '#232731',
      flyoutForegroundColour: '#e3e6ed',
      flyoutOpacity: 1,
      scrollbarColour: '#3a4150',
      scrollbarOpacity: 0.7,
      insertionMarkerColour: '#ffffff',
      insertionMarkerOpacity: 0.3,
      cursorColour: '#d0d0d0'
    }
  })
  Blockly.Theme.defineTheme('lab-light', {
    name: 'lab-light',
    base: Blockly.Themes.Classic,
    componentStyles: { workspaceBackgroundColour: '#f8f9fb', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#1d2230', flyoutBackgroundColour: '#eef0f4', flyoutForegroundColour: '#1d2230', flyoutOpacity: 1 }
  })
  return Blockly
}

const shadowNumber = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
const shadowText = (t: string) => ({ shadow: { type: 'text', fields: { TEXT: t } } })

export function toolbox(target: VisualTarget): Blockly.utils.toolbox.ToolboxDefinition {
  const page = {
    kind: 'category',
    name: 'Pagina',
    colour: '20',
    contents: [
      { kind: 'block', type: 'lab_on_event' },
      { kind: 'block', type: 'lab_on_load' },
      { kind: 'block', type: 'lab_every' },
      { kind: 'block', type: 'lab_set_text', inputs: { VALUE: shadowText('Ciao!') } },
      { kind: 'block', type: 'lab_set_style', inputs: { VALUE: shadowText('tomato') } },
      { kind: 'block', type: 'lab_class' },
      { kind: 'block', type: 'lab_get_text' },
      { kind: 'block', type: 'lab_get_value' }
    ]
  }
  return {
    kind: 'categoryToolbox',
    contents: [
      ...(target === 'pagina' ? [page] : []),
      {
        kind: 'category',
        name: 'Logica',
        categorystyle: 'logic_category',
        contents: ['controls_if', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean'].map((type) => ({ kind: 'block', type }))
      },
      {
        kind: 'category',
        name: 'Cicli',
        categorystyle: 'loop_category',
        contents: [
          { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: shadowNumber(10) } },
          { kind: 'block', type: 'controls_whileUntil' },
          { kind: 'block', type: 'controls_for', inputs: { FROM: shadowNumber(1), TO: shadowNumber(10), BY: shadowNumber(1) } },
          { kind: 'block', type: 'controls_forEach' },
          { kind: 'block', type: 'controls_flow_statements' }
        ]
      },
      {
        kind: 'category',
        name: 'Matematica',
        categorystyle: 'math_category',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic', inputs: { A: shadowNumber(1), B: shadowNumber(1) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: shadowNumber(1), TO: shadowNumber(100) } },
          { kind: 'block', type: 'math_round' },
          { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: shadowNumber(10), DIVISOR: shadowNumber(3) } }
        ]
      },
      {
        kind: 'category',
        name: 'Testo',
        categorystyle: 'text_category',
        contents: [{ kind: 'block', type: 'text' }, { kind: 'block', type: 'text_join' }, { kind: 'block', type: 'text_length' }, { kind: 'block', type: 'lab_console', inputs: { VALUE: shadowText('ciao') } }]
      },
      {
        kind: 'category',
        name: 'Liste',
        categorystyle: 'list_category',
        contents: ['lists_create_with', 'lists_length', 'lists_getIndex', 'lists_isEmpty'].map((type) => ({ kind: 'block', type }))
      },
      { kind: 'category', name: 'Variabili', categorystyle: 'variable_category', custom: 'VARIABLE' },
      { kind: 'category', name: 'Funzioni', categorystyle: 'procedure_category', custom: 'PROCEDURE' }
    ]
  } as Blockly.utils.toolbox.ToolboxDefinition
}

/** Codice JavaScript del programma; con `step` ogni istruzione segnala il blocco all'IDE. */
export function generateBlocksCode(workspace: Blockly.Workspace, step: boolean): string {
  javascriptGenerator.STATEMENT_PREFIX = step ? '__labStep(%1);\n' : null
  javascriptGenerator.addReservedWords('__labStep')
  const code = javascriptGenerator.workspaceToCode(workspace)
  javascriptGenerator.STATEMENT_PREFIX = null
  return code
}

export { Blockly }
