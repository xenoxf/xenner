import assert from "node:assert/strict";
import test from "node:test";

import { resolveAssetReference } from "./asset-paths.ts";
import { loadNoteAssets, restoreNoteAssets } from "./markdown/assets.ts";
import type { NoteAssets } from "./markdown/assets.ts";
import { createNoteMarkdownManager } from "./markdown/manager.ts";
import type { AssetPayload } from "../types/workspace.ts";

const manager = createNoteMarkdownManager();

/** Un asset como lo devuelve el disco: bytes en base64 y su revisión. */
function asset(mime: string, dataBase64: string, revision: string): AssetPayload {
  return { mime, dataBase64, revision };
}

test("resuelve assets relativos a la carpeta de la nota", () => {
  assert.equal(resolveAssetReference("Tema/nota.md", "./.assets/dibujo.svg"), ".assets/dibujo.svg");
  assert.equal(resolveAssetReference("Tema/nota.md", ".assets/imagen.png"), ".assets/imagen.png");
  assert.equal(resolveAssetReference("nota.md", "../fuera/.assets/x.png"), null);
  assert.equal(resolveAssetReference("nota.md", "imagen.png"), null);
  assert.equal(resolveAssetReference("nota.md", "https://example.com/image.png"), null);
  assert.equal(resolveAssetReference("nota.md", "data:image/png;base64,abc"), null);
});

test("sustituye cada referencia de .assets por su data: URL", async () => {
  const nota = [
    "Una imagen:",
    "",
    "![cabeza](./.assets/cabeza.png \"El título\")",
    "",
    "Y otra:",
    "",
    "![mapa](.assets/mapa.png)",
  ].join("\n");

  const leidos: string[] = [];
  const assets = await loadNoteAssets("Tema/nota.md", nota, async (_nota, ruta) => {
    leidos.push(ruta);
    return ruta.endsWith("cabeza.png")
      ? asset("image/png", "QkFDQQ==", "rev-cabeza")
      : asset("image/png", "TUFCQQ==", "rev-mapa");
  });

  assert.deepEqual(leidos.sort(), [".assets/cabeza.png", ".assets/mapa.png"]);
  assert.match(assets.markdown, /!\[cabeza\]\(data:image\/png;base64,QkFDQQ== "El título"\)/);
  assert.match(assets.markdown, /!\[mapa\]\(data:image\/png;base64,TUFCQQ==\)/);
  // Y se puede volver atrás: la data: URL es la ruta dentro de .assets.
  assert.equal(assets.paths.get("data:image/png;base64,QkFDQQ=="), "./.assets/cabeza.png");
  assert.equal(assets.paths.get("data:image/png;base64,TUFCQQ=="), ".assets/mapa.png");
  assert.equal(assets.revisions.get("data:image/png;base64,QkFDQQ=="), "rev-cabeza");
  assert.equal(restoreNoteAssets(assets.markdown, assets.paths), nota);
});

test("un asset ilegible no rompe la apertura", async () => {
  const nota = "![rota](./.assets/rota.png)\n\ny sigue el texto";
  const assets = await loadNoteAssets("nota.md", nota, async () => {
    throw new Error("No se encontró el archivo");
  });
  // La referencia se queda como estaba: se ve la imagen que falta, no un error.
  assert.equal(assets.markdown, nota);
  assert.equal(assets.paths.size, 0);
  assert.equal(assets.revisions.size, 0);
});

test("lo que no es de .assets no se toca", async () => {
  const nota = [
    "![fuera](https://x.dev/a.png)",
    "![dentro](data:image/png;base64,QUJD)",
    "![suelta](imagen.png)",
    "![anidada](./.assets/sub/a.png)",
  ].join("\n");
  const assets = await loadNoteAssets("nota.md", nota, async () => {
    throw new Error("no debería llamarse");
  });
  assert.equal(assets.markdown, nota);
});

/**
 * El lector de assets tiene que entender **todo** lo que el serializador escribe.
 *
 * Cada caso de aquí es una forma que `noteImage` sí sabe leer y guardar, y que
 * antes se quedaba sin sustituir: la nota se abría con un hueco donde el propio
 * editor acababa de escribir una imagen, sin ningún aviso.
 */
test("lee las mismas formas de imagen que escribe el serializador", async () => {
  const DATA = "data:image/png;base64,QUJD";
  const casos = [
    "![a](./.assets/x.png)",
    "![a](.assets/x.png)",
    "![a](<.assets/x.png>)",
    "![a](<.assets/mi imagen.png>)",
    "![a](<.assets/captura (1).png>)",
    "![a\\] con corchete](./.assets/x.png)",
    "![con (paréntesis](./.assets/x.png)",
    "![a](./.assets/x.png \"el título\")",
    "![a](./.assets/x.png 'otro')",
    "![a](./.assets/x.png (tercero))",
    "![Pizarra](./.assets/dibujo.svg \"xenner:pizarra\")",
  ];
  for (const nota of casos) {
    const leidas: string[] = [];
    const assets = await loadNoteAssets("Tema/nota.md", nota, async (_n, ruta) => {
      leidas.push(ruta);
      return asset("image/png", "QUJD", "rev-1");
    });
    assert.ok(assets.markdown.includes(DATA), `no se sustituyó: ${JSON.stringify(nota)}`);
    // Y lo que sale vuelve a ser exactamente lo que entró, con los `<>` y las
    // barras de escape que tenía, y no una forma "normalizada".
    assert.equal(restoreNoteAssets(assets.markdown, assets.paths), nota);
    assert.equal(leidas.length, 1, `se leyó ${leidas.length} veces: ${JSON.stringify(nota)}`);
  }
});

test("un destino con espacios sin ángulos no es una imagen", () => {
  /**
   * Decisión: `![a](mi imagen.png)` sin `<>` **no** es Markdown —el destino no
   * puede llevar espacios— así que ni el gestor ni el lector de assets pueden
   * tratarlo como una imagen. Xenner nunca lo escribe: `noteImage` lo pone entre
   * ángulos. Se deja como texto escapado, que es lo que se ve.
   */
  const nota = "![a](./.assets/mi imagen.png)";
  return loadNoteAssets("nota.md", nota, async () => {
    throw new Error("no debería llamarse");
  }).then((assets) => {
    assert.equal(assets.markdown, nota);
    assert.equal(assets.paths.size, 0);
    assert.equal(manager.parse(nota).content?.[0]?.type, "paragraph");
  });
});

test("una ruta escapada se busca sin las barras y se devuelve con ellas", async () => {
  // El nombre del fichero en el disco es `x(1).png`; en el Markdown va con
  // `\(` porque si no el paréntesis se comería el cierre de la imagen.
  const nota = "![a](./.assets/x\\(1\\).png)";
  const leidas: string[] = [];
  const assets = await loadNoteAssets("nota.md", nota, async (_n, ruta) => {
    leidas.push(ruta);
    return asset("image/png", "QUJD", "rev-1");
  });
  assert.deepEqual(leidas, [".assets/x(1).png"]);
  assert.equal(restoreNoteAssets(assets.markdown, assets.paths), nota);
});

test("dos imágenes del mismo fichero se leen una vez y vuelven las dos", async () => {
  const nota = "![a](./.assets/x.png)\n\n![b](./.assets/x.png)\n\n![c](.assets/x.png)";
  let lecturas = 0;
  const assets = await loadNoteAssets("nota.md", nota, async () => {
    lecturas += 1;
    return asset("image/png", "QUJD", "rev-1");
  });
  assert.equal(lecturas, 1, "`./.assets/x.png` y `.assets/x.png` son el mismo fichero");
  assert.equal(
    assets.markdown.split("data:image/png;base64,QUJD").length - 1,
    3,
    "las tres referencias se sustituyen",
  );
  // Una `data:` URL solo puede volver a una ruta (es lo que dice el tipo de
  // `paths`), así que las tres vuelven con la misma forma. Apuntan al mismo
  // fichero, así que no se pierde nada.
  assert.equal(assets.paths.size, 1);
  const vuelta = restoreNoteAssets(assets.markdown, assets.paths);
  assert.equal(
    vuelta,
    "![a](.assets/x.png)\n\n![b](.assets/x.png)\n\n![c](.assets/x.png)",
  );
  // Y guardar otra vez no lo vuelve a mover.
  assert.equal(restoreNoteAssets(vuelta, assets.paths), vuelta);
});

test("una nota con muchas imágenes las carga todas", async () => {
  const total = 60;
  const nota = Array.from(
    { length: total },
    (_v, i) => `![imagen ${i}](./.assets/img-${i}.png)`,
  ).join("\n\n");
  const assets = await loadNoteAssets("nota.md", nota, async (_n, ruta) =>
    asset("image/png", Buffer.from(ruta).toString("base64"), "rev"),
  );
  assert.equal(assets.paths.size, total);
  assert.equal(restoreNoteAssets(assets.markdown, assets.paths), nota);
});

test("restaura la URL más larga antes que la más corta", () => {
  const corto = "data:image/png;base64,AAA";
  const largo = `${corto}BBB`;
  const markdown = `![a](${corto})\n\n![b](${largo})`;
  const assets: NoteAssets = {
    markdown,
    paths: new Map([
      [corto, ".assets/corto.png"],
      [largo, ".assets/largo.png"],
    ]),
    revisions: new Map(),
  };
  assert.equal(
    restoreNoteAssets(assets.markdown, assets.paths),
    "![a](.assets/corto.png)\n\n![b](.assets/largo.png)",
  );
});

test("restaurar sin nada que restaurar devuelve lo mismo", () => {
  assert.equal(restoreNoteAssets("texto", new Map()), "texto");
});