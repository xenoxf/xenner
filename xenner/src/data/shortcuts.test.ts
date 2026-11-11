import assert from "node:assert/strict";
import test from "node:test";

import { TECLAS_DE_OTROS } from "../editor/keyboard.ts";
import { isMacPlatform } from "../services/platform.ts";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  comboFromEvent,
  defaultShortcutMap,
  duplicatesOf,
  formatCombo,
  isSafeCombo,
  matchCombo,
  normalizeCombo,
  normalizeKeyToken,
  parseCombo,
  resolveShortcuts,
  sanitizeOverrides,
  type ShortcutMap,
} from "./shortcuts.ts";

/**
 * Las combinaciones de teclado, como datos.
 *
 * Aquí se comprueba el contrato entero del catálogo: que no haya teclas repetidas
 * por defecto, que ninguna pise una tecla que ya tenía dueño, que grabar una
 * combinación con un `keyCode` honesto —el de un teclado que con Shift entrega
 * «&» en vez de «7»— la reconozca, y que lo que se guarda en `localStorage` no
 * pueda colar algo que rompa el teclado.
 *
 * `Mod` significa Ctrl aquí y ⌘ en un Mac, así que los eventos sintetizados se
 * construyen con el modificador que toca en esta máquina.
 */

const ES_MAC = isMacPlatform();

/** El `keyCode` de cada tecla que usan los valores por defecto. */
const KEYCODE: Record<string, number> = {
  "0": 48, "1": 49, "2": 50, "3": 51, "4": 52, "5": 53, "6": 54, "7": 55, "8": 56, "9": 57,
  a: 65, b: 66, c: 67, e: 69, i: 73, k: 75, m: 77, p: 80, r: 82, s: 83, t: 84,
  "-": 189, ".": 190, "/": 191,
};

interface EventoPrueba {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  keyCode?: number;
}

/** El evento que produciría esta combinación en esta máquina. */
function eventoDe(combo: string, keyOverride?: string, keyCode?: number): EventoPrueba {
  const parseada = parseCombo(combo);
  assert.ok(parseada, `«${combo}» tiene que parsearse`);
  const mod = parseada.mod;
  return {
    key: keyOverride ?? (parseada.key.length === 1 ? parseada.key.toUpperCase() : parseada.key),
    ctrlKey: ES_MAC ? parseada.ctrl : mod || parseada.ctrl,
    metaKey: ES_MAC ? mod : false,
    altKey: parseada.alt,
    shiftKey: parseada.shift,
    keyCode: keyCode ?? KEYCODE[parseada.key],
  };
}

test("el catálogo no repite identificadores ni grupos desconocidos", () => {
  const ids = SHORTCUT_ACTIONS.map((accion) => accion.id);
  assert.equal(new Set(ids).size, ids.length, "hay identificadores repetidos");
  const grupos = new Set(SHORTCUT_GROUPS.map((grupo) => grupo.id));
  for (const accion of SHORTCUT_ACTIONS) {
    assert.ok(grupos.has(accion.group), `${accion.id}: el grupo «${accion.group}» no existe`);
    assert.ok(accion.label.length > 0, `${accion.id}: sin nombre`);
  }
});

test("los valores por defecto no se pisan entre sí ni pisan teclas de otros", () => {
  const map = defaultShortcutMap();
  const ids = Object.keys(map);
  assert.equal(new Set(Object.values(map)).size, ids.length, "hay combinaciones repetidas por defecto");
  const deOtros = new Set(TECLAS_DE_OTROS.map((otro) => normalizeCombo(otro.shortcut)));
  for (const [id, combo] of Object.entries(map)) {
    assert.equal(normalizeCombo(combo), combo, `${id}: la combinación por defecto no está en forma canónica`);
    assert.ok(isSafeCombo(combo), `${id}: la combinación por defecto no es segura`);
    assert.ok(!deOtros.has(combo), `${id}: «${combo}» ya es de otro`);
  }
});

test("toda combinación por defecto se reconoce al pulsarla", () => {
  for (const accion of SHORTCUT_ACTIONS) {
    const parseada = parseCombo(accion.defaultCombo);
    assert.ok(parseada, accion.defaultCombo);
    const evento = eventoDe(accion.defaultCombo);
    assert.ok(matchCombo(accion.defaultCombo, evento), `${accion.defaultCombo} no se reconoce al pulsarla`);
    // Y no se reconoce sin su modificador principal.
    const sinMod = { ...evento, ctrlKey: false, metaKey: false };
    assert.equal(matchCombo(accion.defaultCombo, sinMod), false);
  }
});

test("con Shift, el carácter que llega es el que haya en la tecla, no la tecla", () => {
  // Un teclado US con Shift entrega «&» para la tecla 7. El `keyCode` dice cuál
  // era la tecla física, que es lo único que no miente.
  const evento = eventoDe("Mod-Shift-7", "&", 55);
  assert.ok(matchCombo("Mod-Shift-7", evento));
  // Y no se confunde con otra tecla.
  assert.equal(matchCombo("Mod-Shift-8", evento), false);
});

test("`parseCombo` acepta cualquier orden de modificadores y devuelve el canónico", () => {
  assert.equal(normalizeCombo("ALT-mod-1".toLowerCase()), "Mod-Alt-1");
  assert.equal(normalizeCombo("Shift-Mod-Alt-7"), "Mod-Alt-Shift-7");
  // La tecla puede ser un guion: «Mod-Alt--» es Mod+Alt+«-».
  const guion = parseCombo("Mod-Alt--");
  assert.ok(guion);
  assert.equal(guion.key, "-");
  assert.equal(guion.mod && guion.alt, true);
  // Y lo que no es una combinación no lo es.
  assert.equal(parseCombo("Mod"), null);
  assert.equal(parseCombo("Mod-Mod-1"), null);
  assert.equal(parseCombo("Mod-Qwark-1"), null);
  assert.equal(parseCombo(""), null);
});

test("`normalizeKeyToken` solo nombra lo que hay en un teclado", () => {
  assert.equal(normalizeKeyToken(" "), "Space");
  assert.equal(normalizeKeyToken("A"), "a");
  assert.equal(normalizeKeyToken("Enter"), "Enter");
  assert.equal(normalizeKeyToken("ArrowLeft"), "ArrowLeft");
  assert.equal(normalizeKeyToken("F12"), "F12");
  assert.equal(normalizeKeyToken("Hyper-Saber-Keyboard"), null);
  assert.equal(normalizeKeyToken(""), null);
});

test("`isSafeCombo`: una letra suelta no es una combinación, una tecla de función sí", () => {
  assert.equal(isSafeCombo("a"), false);
  assert.equal(isSafeCombo("Shift-a"), false);
  assert.equal(isSafeCombo("Mod-Shift-a"), true);
  assert.equal(isSafeCombo("Mod-s"), true);
  assert.equal(isSafeCombo("F5"), true);
  assert.equal(isSafeCombo("Mod-F5"), true);
  assert.equal(isSafeCombo("Escape"), false);
  assert.equal(isSafeCombo("Mod-Escape"), true);
});

test("grabar una combinación exige modificador, salvo teclas de función", () => {
  const mods = ES_MAC ? { ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }
                      : { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(comboFromEvent({ key: "s", ...mods }), "Mod-s");
  assert.equal(comboFromEvent({ key: "F5", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), "F5");
  assert.equal(comboFromEvent({ key: "Escape", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), null);
  // Solo Shift + letra: se comería cada «A» mayúscula de la nota.
  assert.equal(comboFromEvent({ key: "A", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }), null);
  // Solo modificadores: aún no hay combinación.
  assert.equal(comboFromEvent({ key: "Shift", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }), null);
});

test("las combinaciones repetidas se avisan, no se prohíben", () => {
  const map = defaultShortcutMap();
  map["nota.save"] = "Mod-k"; // la que usa buscar una nota
  map["app.palette"] = "Mod-k";
  const repetidas = duplicatesOf(map);
  assert.deepEqual(repetidas.get("Mod-k")?.sort(), ["app.palette", "nota.save"]);
  // Y sin repetidas, el mapa por defecto está limpio.
  assert.deepEqual([...duplicatesOf(defaultShortcutMap()).keys()], []);
});

test("`sanitizeOverrides` descarta lo que no vale y no guarda lo que ya es el defecto", () => {
  const limpio = sanitizeOverrides({
    "nota.save": "Mod-Alt-s",
    "app.palette": "Mod-k", // es el valor de fábrica: no se guarda
    "app.sidebar": "no es una combinación",
    "insert.image": 42,
    accionQueNoExiste: "Mod-x",
  });
  assert.deepEqual(limpio, { "nota.save": "Mod-Alt-s" });
});

test("`resolveShortcuts` aplica las diferencias y respeta los inválidos", () => {
  const map = resolveShortcuts({ "nota.save": "Mod-Alt-p", "app.palette": "basura" } as never);
  assert.equal(map["nota.save"], "Mod-Alt-p");
  assert.equal(map["app.palette"], defaultShortcutMap()["app.palette"]);
  // Toda acción tiene combinación en el mapa resuelto.
  for (const accion of SHORTCUT_ACTIONS) {
    assert.ok(map[accion.id].length > 0);
  }
});

test("`formatCombo` enseña símbolos en Mac y palabras fuera", () => {
  const enMac = formatCombo("Mod-Shift-7", true);
  const fuera = formatCombo("Mod-Shift-7", false);
  assert.equal(fuera, "Ctrl + Shift + 7");
  assert.ok(enMac.includes("⇧"), enMac);
  // El guion se enseña como tecla, no como separador.
  assert.equal(formatCombo("Mod-Alt--", false), "Ctrl + Alt + -");
  // Las teclas con nombre se leen en español.
  assert.equal(formatCombo("Mod-Enter", false), "Ctrl + Intro");
});

test("un mapa completo de teclas se enseña sin `undefined`", () => {
  // Si el catálogo y el mapa se desalinean, aquí sale `undefined` en pantalla.
  const map: ShortcutMap = defaultShortcutMap();
  for (const accion of SHORTCUT_ACTIONS) {
    assert.equal(typeof map[accion.id], "string");
    assert.ok(map[accion.id].length > 0);
  }
});
