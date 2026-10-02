import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  acceptPendingDialog,
  cancelPendingDialog,
  confirmDialog,
  getPendingDialog,
  hasPendingDialog,
  promptDialog,
  resetDialogs,
} from "./dialogs.ts";

/**
 * Lo que se prueba aquí es la mecánica, no el texto: que lo que se pregunta se
 * conteste una vez, que cancelar sea siempre `false`/`null` y que dos preguntas
 * seguidas no se pisen.
 *
 * Lo que motivó este módulo —que en el WebView de Android `window.prompt` y
 * `window.confirm` no hacen nada— no se puede probar desde aquí: es el anfitrión
 * el que decide no implementarlos. Lo que sí se comprueba es que ya no depende
 * de ellos: estas funciones son las únicas que se usan y son siempre nuestras.
 */

afterEach(() => {
  resetDialogs();
});

test("una confirmación devuelve true al aceptar", async () => {
  const respuesta = confirmDialog({ title: "¿Seguir?", message: "Se puede deshacer." });
  const pendiente = getPendingDialog();
  assert.equal(pendiente?.kind, "confirm");
  assert.equal(pendiente?.confirmLabel, "Continuar", "la etiqueta por defecto");

  acceptPendingDialog();
  assert.equal(await respuesta, true);
  assert.equal(getPendingDialog(), null, "no queda nada abierto");
});

test("cancelar una confirmación devuelve false", async () => {
  const respuesta = confirmDialog({ title: "¿Eliminar?", message: "No se puede deshacer." });
  cancelPendingDialog();
  assert.equal(await respuesta, false);
  assert.equal(getPendingDialog(), null);
});

test("las etiquetas y el peligro se pueden cambiar", async () => {
  confirmDialog({
    title: "¿Eliminar la nota?",
    message: "No hay vuelta atrás.",
    confirmLabel: "Eliminar",
    cancelLabel: "Mejor no",
    danger: true,
  });
  const pendiente = getPendingDialog();
  assert.equal(pendiente?.confirmLabel, "Eliminar");
  assert.equal(pendiente?.cancelLabel, "Mejor no");
  assert.equal(pendiente?.kind === "confirm" && pendiente.danger, true);
  acceptPendingDialog();
});

test("un campo de texto devuelve lo escrito, sin espacios alrededor", async () => {
  const respuesta = promptDialog({ title: "Renombrar", value: "nota.md" });
  const pendiente = getPendingDialog();
  assert.equal(pendiente?.kind, "text");
  assert.equal(pendiente?.kind === "text" && pendiente.value, "nota.md");

  acceptPendingDialog("  Otro nombre  ");
  assert.equal(await respuesta, "Otro nombre");
});

test("cancelar un campo de texto devuelve null", async () => {
  const respuesta = promptDialog({ title: "Renombrar", value: "nota.md" });
  cancelPendingDialog();
  assert.equal(await respuesta, null);
});

test("aceptar sin texto devuelve el valor con el que se abrió", async () => {
  const respuesta = promptDialog({ title: "Renombrar", value: "  nota.md  " });
  acceptPendingDialog();
  assert.equal(await respuesta, "nota.md", "se recorta igual");
});

test("cerrar y volver a preguntar funciona", async () => {
  const primera = confirmDialog({ title: "Primera", message: "…" });
  cancelPendingDialog();
  assert.equal(await primera, false);

  const segunda = confirmDialog({ title: "Segunda", message: "…" });
  assert.equal(
    getPendingDialog()?.kind === "confirm" && getPendingDialog()?.title,
    "Segunda",
  );
  acceptPendingDialog();
  assert.equal(await segunda, true);
});

test("dos preguntas seguidas no se pisan: la segunda espera turno", async () => {
  const primera = confirmDialog({ title: "Primera", message: "…" });
  const segunda = confirmDialog({ title: "Segunda", message: "…" });

  // La segunda no replaces a la primera: sigue siendo la que está en pantalla.
  assert.equal(
    getPendingDialog()?.kind === "confirm" && getPendingDialog()?.title,
    "Primera",
    "la que estaba primero se contesta primero",
  );

  acceptPendingDialog();
  assert.equal(await primera, true);

  // Y al contestarla aparece la que estaba en cola.
  assert.equal(
    getPendingDialog()?.kind === "confirm" && getPendingDialog()?.title,
    "Segunda",
    "la segunda entra después",
  );
  acceptPendingDialog();
  assert.equal(await segunda, true);
  assert.equal(getPendingDialog(), null);
});

test("cancelar lo que está en cola no deja respuestas colgadas", async () => {
  const primera = confirmDialog({ title: "Primera", message: "…" });
  const segunda = confirmDialog({ title: "Segunda", message: "…" });

  acceptPendingDialog();
  await primera;
  // La de en cola se cancela en vez de quedarse esperando para siempre.
  cancelPendingDialog();
  assert.equal(await segunda, false);
  assert.equal(hasPendingDialog(), false);
});

test("no hay diálogo abierto, no hay diálogo pendiente", () => {
  assert.equal(getPendingDialog(), null);
  assert.equal(hasPendingDialog(), false);
  // Y no rompe nada si se contesta a la nada.
  acceptPendingDialog();
  cancelPendingDialog();
  assert.equal(hasPendingDialog(), false);
});
