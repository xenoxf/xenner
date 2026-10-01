import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { COMPONENT_KEYS } from "./keys.ts";
import { defaultValue } from "./editor.ts";
import { COMPONENTES } from "./editor.ts";
import { resolverAssets, unusedAssetPaths, usedAssetPaths, valuesWithAssets } from "./editor.ts";
import { emptyEditor, setValue } from "./editor.ts";
import type { SkinAsset } from "../types/skin";

test("todas las claves tienen un valor por defecto, y ninguna de más", () => {
  // El botón «Usar el de Xenner» pone este valor. Si una clave no lo tuviera, el
  // botón saldría vacío y alguien acabaría escribiendo el valor equivocado
  // confiándose. Si el valor no estuviera en `global.css`, el botón mentiría.
  for (const component of COMPONENTES) {
    for (const clave of COMPONENT_KEYS[component]) {
      const valor = defaultValue(component, clave);
      assert.notEqual(
        valor,
        "",
        `${component}.${clave} no tiene valor por defecto: el botón saldría vacío`,
      );
    }
  }
});

/**
 * Las únicas claves que `global.css` no declara y aquí sí.
 *
 * `font` solo se declara en `background`, y es un grupo de tres variables que
 * tienen que ir juntas: `--skin-ui-font`, `--skin-editor-font` y
 * `--skin-background-font`. Las otras cinco la heredan, y su ejemplo sale de la
 * de `background`.
 *
 * Está en una lista y no en un comentario porque la lista es lo que el test
 * comprueba: añadir una más sin que la declare `global.css` tiene que salir
 * aquí, y no verse meses después en un botón que pone un valor inventado.
 */
const HEREDADAS = new Set([
  "button.font",
  "note.font",
  "sidebar.font",
  "input.font",
  "toolbar.font",
]);

test("los valores por defecto son los que pone el tema de fábrica", () => {
  // La lista de `editor.ts` y `styles/global.css` son el mismo dato escrito dos
  // veces. Este test las compara para que no se separen: si mañana se cambia un
  // color de fábrica, salta aquí en lugar de hacer que «restablecer» ponga un
  // color que ya no existe.
  const global = readFileSync(new URL("../styles/global.css", import.meta.url), "utf-8");
  const claro = global.split(':root[data-color-scheme="dark"]')[0] ?? global;

  let comparadas = 0;
  for (const component of COMPONENTES) {
    for (const clave of COMPONENT_KEYS[component]) {
      const esperado = readToken(claro, `--skin-${component}-${clave}:`);
      if (esperado === null) {
        assert.ok(
          HEREDADAS.has(`${component}.${clave}`),
          `${component}.${clave}: editor.ts tiene un valor y global.css no declara ` +
            `la variable. Si es heredada, añádela a HEREDADAS; si no, ` +
            `FALTA la declaración en styles/global.css.`,
        );
        continue;
      }
      comparadas += 1;
      assert.equal(
        defaultValue(component, clave),
        esperado,
        `${component}.${clave}: editor.ts dice una cosa y global.css otra`,
      );
    }
  }

  // Si no se comparó casi nada, el test pasa por no hacer nada. Mejor que falle.
  assert.ok(
    comparadas >= 30,
    `solo se compararon ${comparadas} claves: el test no está vigilando nada`,
  );
});

function readToken(css: string, token: string): string | null {
  const at = css.indexOf(token);
  if (at === -1) return null;
  const hasta = css.indexOf(";", at);
  return css.slice(at + token.length, hasta === -1 ? undefined : hasta).trim();
}

test("las referencias a imágenes se resuelven para la previsualización", () => {
  // Antes de guardar, `assets/fondo.svg` no existe en ningún sitio. La
  // previsualización tiene que poner el contenido en su lugar o el panel
  // enseñaría un fondo vacío justo cuando se está eligiendo.
  const asset: SkinAsset = {
    path: "assets/fondo.svg",
    name: "fondo.svg",
    dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    dataBase64: "PHN2Zy8+",
    bytes: 6,
  };

  const editor = setValue(
    { ...emptyEditor(), assets: [asset] },
    "button",
    "background",
    "url(assets/fondo.svg)",
  );
  const conImagen = valuesWithAssets(editor, "button");
  assert.equal(conImagen.background, 'url("data:image/svg+xml;base64,PHN2Zy8+")');

  // Y lo que se guarda sigue siendo la ruta, no el contenido: una ruta sobrevive
  // a que la imagen se mueva, un `data:` de 400 KB no.
  assert.equal(editor.files.button, 'background="url(assets/fondo.svg)"');
});

test("resolver imágenes no toca lo que no es una imagen", () => {
  const salida = resolverAssets(
    { text: "#fff", background: "linear-gradient(red, blue)", border: "1px solid #333" },
    [],
  );
  assert.deepEqual(salida, {
    text: "#fff",
    background: "linear-gradient(red, blue)",
    border: "1px solid #333",
  });
});

test("se avisa de las imágenes que ya no usa nadie", () => {
  const assets: SkinAsset[] = [
    { path: "assets/uso.svg", name: "uso.svg", dataUrl: "x", dataBase64: "eA==", bytes: 1 },
    { path: "assets/suelta.png", name: "suelta.png", dataUrl: "x", dataBase64: "eA==", bytes: 1 },
  ];
  const editor = setValue(
    { ...emptyEditor(), assets },
    "button",
    "background",
    "url(assets/uso.svg)",
  );

  assert.deepEqual(usedAssetPaths(editor), ["assets/uso.svg"]);
  assert.deepEqual(unusedAssetPaths(editor), ["assets/suelta.png"]);
});
