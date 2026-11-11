// Script ponte iniettato in ogni pagina dell'anteprima, PRIMA del codice dell'utente.
// Cattura console, errori e promesse rifiutate e li invia all'IDE con postMessage.
// È JavaScript semplice (ES2017) perché gira così com'è nel browser dell'anteprima.
;(function () {
  if (window.__ideBridge) return
  window.__ideBridge = true
  var SCHEME = 'ide-preview://'
  var BRIDGE = '/__ide__/'
  var MAX_DEPTH = 3
  var MAX_ITEMS = 50
  var MAX_STRING = 5000
  var groupDepth = 0

  function post(message) {
    message.__ide = 1
    try {
      window.parent.postMessage(message, '*')
    } catch (e) {
      /* anteprima staccata */
    }
  }

  function caller() {
    var stack = new Error().stack || ''
    var lines = stack.split('\n')
    for (var i = 0; i < lines.length; i++) {
      var m = /\(?((?:[a-z][a-z0-9+.-]*):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/i.exec(lines[i].trim())
      if (m && m[1].indexOf(SCHEME) === 0 && m[1].indexOf(BRIDGE) < 0) {
        return { url: m[1], line: Number(m[2]), column: Number(m[3]) }
      }
    }
    return {}
  }

  function ctorName(value) {
    try {
      var proto = Object.getPrototypeOf(value)
      if (proto === null) return 'Object'
      return (proto.constructor && proto.constructor.name) || 'Object'
    } catch (e) {
      return 'Object'
    }
  }

  function ser(value, depth, seen) {
    var type = typeof value
    if (value === null) return { t: 'null' }
    if (type === 'undefined') return { t: 'undefined' }
    if (type === 'string') return { t: 'string', v: value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value }
    if (type === 'number') return { t: 'number', v: Object.is(value, -0) ? '-0' : String(value) }
    if (type === 'bigint') return { t: 'bigint', v: String(value) + 'n' }
    if (type === 'boolean') return { t: 'boolean', v: value }
    if (type === 'symbol') return { t: 'symbol', v: String(value) }
    if (type === 'function') return { t: 'function', name: value.name || '(anonima)' }
    if (seen.indexOf(value) >= 0) return { t: 'circular' }
    if (value instanceof Error) return { t: 'error', name: value.name, message: value.message, stack: value.stack }
    if (value instanceof Date) return { t: 'date', v: isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString() }
    if (value instanceof RegExp) return { t: 'regexp', v: String(value) }
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return { t: 'element', tag: value.tagName.toLowerCase(), id: value.id || undefined, className: typeof value.className === 'string' && value.className ? value.className : undefined }
    }
    if (depth >= MAX_DEPTH) return { t: 'truncated' }
    var next = seen.concat([value])
    if (Array.isArray(value)) {
      var items = []
      for (var i = 0; i < Math.min(value.length, MAX_ITEMS); i++) items.push(ser(value[i], depth + 1, next))
      return { t: 'array', items: items, length: value.length }
    }
    if (value instanceof Map) {
      var entries = []
      value.forEach(function (v, k) {
        if (entries.length < MAX_ITEMS) entries.push([ser(k, depth + 1, next), ser(v, depth + 1, next)])
      })
      return { t: 'map', entries: entries }
    }
    if (value instanceof Set) {
      var setItems = []
      value.forEach(function (v) {
        if (setItems.length < MAX_ITEMS) setItems.push(ser(v, depth + 1, next))
      })
      return { t: 'set', items: setItems }
    }
    var keys
    try {
      keys = Object.keys(value)
    } catch (e) {
      keys = []
    }
    var objectEntries = []
    for (var j = 0; j < Math.min(keys.length, MAX_ITEMS); j++) {
      var item
      try {
        item = ser(value[keys[j]], depth + 1, next)
      } catch (e) {
        item = { t: 'string', v: '<non leggibile>' }
      }
      objectEntries.push([keys[j], item])
    }
    return { t: 'object', ctor: ctorName(value), entries: objectEntries, more: keys.length > MAX_ITEMS }
  }

  function serAll(args) {
    var out = []
    for (var i = 0; i < args.length; i++) out.push(ser(args[i], 0, []))
    return out
  }

  function send(level, args) {
    var where = caller()
    post({ kind: 'console', level: level, args: serAll(args), url: where.url, line: where.line, column: where.column, group: groupDepth })
  }

  var original = {}
  ;['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    original[level] = console[level]
    console[level] = function () {
      send(level, arguments)
      return original[level].apply(console, arguments)
    }
  })
  var counters = {}
  var timers = {}
  console.count = function (label) {
    label = label === undefined ? 'default' : String(label)
    counters[label] = (counters[label] || 0) + 1
    send('log', [label + ': ' + counters[label]])
  }
  console.countReset = function (label) {
    counters[label === undefined ? 'default' : String(label)] = 0
  }
  console.time = function (label) {
    timers[label === undefined ? 'default' : String(label)] = performance.now()
  }
  console.timeEnd = function (label) {
    label = label === undefined ? 'default' : String(label)
    if (timers[label] === undefined) return send('warn', ['Timer "' + label + '" inesistente'])
    send('log', [label + ': ' + (performance.now() - timers[label]).toFixed(2) + ' ms'])
    delete timers[label]
  }
  console.timeLog = function (label) {
    label = label === undefined ? 'default' : String(label)
    if (timers[label] === undefined) return send('warn', ['Timer "' + label + '" inesistente'])
    send('log', [label + ': ' + (performance.now() - timers[label]).toFixed(2) + ' ms'])
  }
  console.assert = function (condition) {
    if (!condition) send('error', ['Asserzione fallita'].concat([].slice.call(arguments, 1)))
  }
  console.trace = function () {
    send('log', [].slice.call(arguments).concat([new Error('console.trace').stack || '']))
  }
  console.group = console.groupCollapsed = function () {
    if (arguments.length) send('log', arguments)
    groupDepth++
  }
  console.groupEnd = function () {
    groupDepth = Math.max(0, groupDepth - 1)
  }
  console.table = function (data) {
    var where = caller()
    post({ kind: 'table', rows: ser(data, 0, []), url: where.url, line: where.line, column: where.column })
  }
  console.clear = function () {
    post({ kind: 'clear' })
  }

  window.addEventListener(
    'error',
    function (event) {
      var target = event.target
      if (target && target !== window && target.tagName) {
        var src = target.src || target.href || ''
        post({ kind: 'error', message: 'Risorsa non trovata: <' + target.tagName.toLowerCase() + '> ' + src })
        return
      }
      // Errore già riportato come "errore di compilazione" dal modulo sostitutivo.
      if (String(event.message).indexOf('[errore di compilazione]') >= 0) return
      post({
        kind: 'error',
        message: event.message,
        stack: event.error && event.error.stack,
        url: event.filename,
        line: event.lineno,
        column: event.colno
      })
    },
    true
  )
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason
    post({
      kind: 'error',
      message: 'Promessa rifiutata senza gestione: ' + (reason && reason.message ? reason.message : String(reason)),
      stack: reason && reason.stack
    })
  })

  // Scorciatoie dell'IDE (Ctrl+…, F5…) anche quando il focus è dentro la pagina dell'anteprima.
  window.addEventListener(
    'keydown',
    function (event) {
      if (!(event.ctrlKey || event.metaKey || /^F\d{1,2}$/.test(event.key))) return
      if (/^(Control|Shift|Alt|Meta)$/.test(event.key)) return
      post({ kind: 'key', key: event.key, code: event.code, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey })
    },
    true
  )

  // Espressioni scritte nella riga di comando della console dell'IDE.
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return
    var data = event.data
    if (!data || typeof data.__ideEval !== 'string') return
    try {
      var result = (0, eval)(data.__ideEval)
      post({ kind: 'console', level: 'log', args: [ser(result, 0, [])], group: 0, result: true })
    } catch (error) {
      post({ kind: 'error', message: error && error.message ? error.name + ': ' + error.message : String(error) })
    }
  })

  window.__ideCompileError = function (info) {
    post({ kind: 'compile-error', path: info.path, message: info.message, line: info.line, column: info.column })
  }

  post({ kind: 'ready', href: location.href })
})()
