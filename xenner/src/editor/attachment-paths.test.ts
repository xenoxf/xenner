import assert from "node:assert/strict";
import test from "node:test";

import { attachmentExtension, base64ByteLength } from "./attachment-paths.ts";

/**
 * Cómo se nombra un adjunto dentro de `.assets`.
 *
 * La regla vive en dos sitios porque el archivo tiene dos autores: Rust lo
 * escribe (`attachment_extension` en `vault.rs`) y el frontend tiene que saber
 * qué nombre va a llevar para escribir el enlace en la nota. Si los dos no dicen
 * lo mismo, el enlace que se ve en el editor no apunta al archivo que se
 * guardó, y eso no aparece hasta que alguien intenta abrir el adjunto.
 *
 * Estos tests fijan los casos raros, que son los que se olvidan: un nombre que
 * empieza por punto no tiene extensión para Rust, y uno que termina en punto
 * tampoco.
 */

test("la extensión es la del archivo, en minúsculas", () => {
  assert.equal(attachmentExtension("Informe.PDF"), "pdf");
  assert.equal(attachmentExtension("datos.CSV"), "csv");
  assert.equal(attachmentExtension("hoja.XLSX"), "xlsx");
  // Solo la última: un `.tar.gz` se guarda con la del final.
  assert.equal(attachmentExtension("archivo.tar.gz"), "gz");
  assert.equal(attachmentExtension("notas-2026_01.md"), "md");
});

test("un nombre sin extensión utilizable se guarda como `bin`", () => {
  assert.equal(attachmentExtension("sin-extension"), "bin");
  assert.equal(attachmentExtension("LICENSE"), "bin");
  // Un punto al final no hace extensión, igual que en `Path::extension` de Rust.
  assert.equal(attachmentExtension("informe."), "bin");
  // Y un punto al principio tampoco: `.gitignore` es un archivo entero.
  assert.equal(attachmentExtension(".gitignore"), "bin");
});

test("una extensión con separadores o demasiado larga cae a `bin`", () => {
  // La extensión acaba formando parte de la ruta dentro de `.assets`. Una barra
  // ahí se saldría de la carpeta, y treinta caracteres es ruido.
  assert.equal(attachmentExtension("trampa.p/d"), "bin");
  assert.equal(attachmentExtension("larga.abcdefghijklmnopqrstuvwxyz"), "bin");
  assert.equal(attachmentExtension("raro.extension con espacio"), "bin");
  // Lo que no es alfanumérico se descarta en vez de acabar en la ruta: la nota
  // tiene que poder abrirse en cualquier sistema donde esté la biblioteca.
  assert.equal(attachmentExtension("informe.PDF"), "pdf");
});

test("el tamaño de un adjunto se calcula sin decodificarlo", () => {
  // Tres bytes por cada cuatro caracteres de base64, menos el relleno.
  assert.equal(base64ByteLength(""), 0);
  assert.equal(base64ByteLength("YQ=="), 1);
  assert.equal(base64ByteLength("YWI="), 2);
  assert.equal(base64ByteLength("YWJj"), 3);
  assert.equal(base64ByteLength("YWJjZGVm"), 6);
});