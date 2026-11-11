// Esegue un file JS/TS strumentato (vedi shared/trace/instrument.ts) registrando ogni passo.
// Come la verifica degli esercizi: esbuild (bundle cjs) + node:vm con tempo massimo; `require` bloccato.
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { inspect } from "node:util";
import vm from "node:vm";
import {
  MAX_TRACE_STEPS,
  type TraceFrame,
  type TraceResult,
  type TraceStep,
} from "@shared/contracts/trace";
import { instrument } from "@shared/trace/instrument";
import { loadEsbuild } from "../esbuild-loader";

const TIMEOUT_MS = 4000;
const LIMIT = "__limite_passi__";

type Getter = [name: string, get: () => unknown, kind: 0 | 1];

function preview(value: unknown): string {
  if (typeof value === "function") return `ƒ ${value.name || "anonima"}`;
  if (typeof value === "string") return JSON.stringify(value);
  return inspect(value, {
    depth: 2,
    breakLength: Infinity,
    maxArrayLength: 25,
    maxStringLength: 200,
  });
}

function format(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "string" ? a : inspect(a, { depth: 4, breakLength: 100 }),
    )
    .join(" ");
}

export async function traceFile(
  root: string,
  path: string,
): Promise<TraceResult> {
  const absolute = join(root, path);
  const source = await readFile(absolute, "utf8");
  const typescript = /\.(ts|mts|cts|tsx)$/i.test(path);
  const result: TraceResult = { path, steps: [], output: [], truncated: false };

  let code: string;
  try {
    code = instrument(source, typescript).code;
  } catch (error) {
    const e = error as Error & { loc?: { line: number } };
    return {
      ...result,
      error: { message: `Errore di sintassi: ${e.message}`, line: e.loc?.line },
    };
  }
  try {
    const esbuild = await loadEsbuild();
    // Senza import basta trasformare (il bundle cambierebbe i const globali in var e nasconderebbe la "zona morta").
    if (!/^\s*import|require\s*\(/m.test(source)) {
      const transformed = await esbuild.transform(code, {
        loader: typescript ? "ts" : "js",
        format: "cjs",
        target: "es2022",
        sourcefile: basename(path),
      });
      code = transformed.code;
    } else {
      const built = await esbuild.build({
        stdin: {
          contents: code,
          resolveDir: dirname(absolute),
          sourcefile: basename(path),
          loader: typescript ? "ts" : "js",
        },
        bundle: true,
        write: false,
        format: "cjs",
        platform: "node",
        target: "es2022",
        treeShaking: false,
        logLevel: "silent",
      });
      code = built.outputFiles[0]!.text;
    }
  } catch (error) {
    const errors = (
      error as {
        errors?: { text: string; location?: { line: number } | null }[];
      }
    ).errors;
    return {
      ...result,
      error: {
        message: errors?.[0]?.text ?? (error as Error).message,
        line: errors?.[0]?.location?.line,
      },
    };
  }

  const stack: { name: string; line: number; vars: Map<string, string> }[] = [
    { name: "Globale", line: 0, vars: new Map() },
  ];
  const steps: TraceStep[] = result.steps;
  const output = result.output;
  const log = (...args: unknown[]) =>
    void output.push(...format(args).split("\n"));
  const timers = new Set<NodeJS.Timeout>();

  const __s = (line: number, getters: () => Getter[]) => {
    if (steps.length >= MAX_TRACE_STEPS) throw new Error(LIMIT);
    const top = stack[stack.length - 1]!;
    const global = stack[0]!;
    const locals = new Map<string, string>();
    const globals = new Map<string, string>();
    for (const [name, get, kind] of getters()) {
      let text: string;
      try {
        text = preview(get());
      } catch {
        text = "‹non ancora inizializzata›";
      }
      (kind === 1 || top === global ? globals : locals).set(name, text);
    }
    // Le funzioni dichiarate nel programma non sono "variabili" da guardare: in fondo all'elenco.
    const sorted = (vars: Map<string, string>) =>
      new Map(
        [...vars].sort(
          ([, a], [, b]) =>
            Number(a.startsWith("ƒ ")) - Number(b.startsWith("ƒ ")),
        ),
      );
    global.vars = sorted(globals);
    if (top !== global) top.vars = sorted(locals);
    top.line = line;
    const frames: TraceFrame[] = stack.map((f) => ({
      name: f.name,
      line: f.line,
      vars: [...f.vars],
    }));
    steps.push({ line, frames, output: output.length });
  };
  const __e = (name: string, line: number) =>
    void stack.push({ name, line, vars: new Map() });
  const __x = () => {
    if (stack.length > 1) stack.pop();
  };

  const module = { exports: {} as Record<string, unknown> };
  const context = vm.createContext({
    __s,
    __e,
    __x,
    console: { log, info: log, warn: log, error: log, debug: log, table: log },
    module,
    exports: module.exports,
    require: (name: string) => {
      throw new Error(
        `nell'esecuzione passo-passo non si possono caricare moduli di Node («${name}»)`,
      );
    },
    setTimeout: (fn: () => void, ms?: number) => {
      const handle = setTimeout(
        () => {
          timers.delete(handle);
          try {
            fn();
          } catch (error) {
            if ((error as Error).message !== LIMIT)
              result.error ??= {
                message: String(error),
                line: steps.at(-1)?.line,
              };
          }
        },
        Math.min(ms ?? 0, 1000),
      );
      timers.add(handle);
      return handle;
    },
    clearTimeout: (handle: NodeJS.Timeout) => {
      clearTimeout(handle);
      timers.delete(handle);
    },
    queueMicrotask,
    structuredClone,
  });
  try {
    vm.runInContext(code, context, { timeout: TIMEOUT_MS, filename: path });
    // Promesse e timer brevi: si lascia loro un attimo per finire.
    const deadline = Date.now() + 1500;
    while (timers.size > 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 20));
  } catch (error) {
    const e = error as Error & { code?: string };
    if (e.message === LIMIT) result.truncated = true;
    else if (e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT")
      result.error = {
        message: `Tempo scaduto (${TIMEOUT_MS / 1000} s): forse un ciclo infinito?`,
        line: steps.at(-1)?.line,
      };
    else
      result.error = {
        message:
          e?.name && e?.message ? `${e.name}: ${e.message}` : String(error),
        line: steps.at(-1)?.line,
      };
  } finally {
    timers.forEach(clearTimeout);
  }
  return result;
}
