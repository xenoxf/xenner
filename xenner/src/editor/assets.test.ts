import assert from "node:assert/strict";
import test from "node:test";

import { resolveAssetReference } from "./asset-paths.ts";

test("resuelve assets relativos a la carpeta de la nota", () => {
  assert.equal(resolveAssetReference("Tema/nota.md", "./.assets/dibujo.svg"), ".assets/dibujo.svg");
  assert.equal(resolveAssetReference("Tema/nota.md", ".assets/imagen.png"), ".assets/imagen.png");
  assert.equal(resolveAssetReference("nota.md", "../fuera/.assets/x.png"), null);
  assert.equal(resolveAssetReference("nota.md", "imagen.png"), null);
  assert.equal(resolveAssetReference("nota.md", "https://example.com/image.png"), null);
  assert.equal(resolveAssetReference("nota.md", "data:image/png;base64,abc"), null);
});
