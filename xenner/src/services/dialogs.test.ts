import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  acceptPendingDialog,
  cancelPendingDialog,
  confirmDialog,
  getPendingDialog,
  hasPendingDialog,
  isDialogPending,
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

/** Deja correr los turnos pendientes: el relevo de la cola va en microtask. */
const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

test("preguntar al despertar no tira la de la cola", async () => {
  // El `settle` reanuma a quien esperaba, y ese codigo puede abrir ya la
  // siguiente pregunta. Ahi es donde se perdia una promesa entera.
  const primera = confirmDialog({ title: "Primera", message: "…" });
  const encolada = confirmDialog({ title: "En cola", message: "…" });
  acceptPendingDialog();

  assert.equal(await primera, true);

  // Esto es lo que hace el codigo que se desperto: pregunta otra vez. Ojo, sin
  // `await`: la promesa no se resuelve sola, hay que contestarla.
  const nueva = promptDialog({ title: "Nueva", value: "x" });
  await turn();

  // Lo que importa no es cual se ve primero -si lo de la cola ya se habia
  // pintado, la nueva se encola detras-, sino que **nada se pierde**: las dos
  // llegan a pintarse y sus dos promesas se resuelven.
  const vistas: string[] = [];
  for (let i = 0; i < 3 && getPendingDialog(); i += 1) {
    const actual = getPendingDialog();
    if (!actual) break;
    vistas.push(actual.title);
    if (actual.kind === "text") acceptPendingDialog("x");
    else acceptPendingDialog();
    await turn();
  }

  assert.deepEqual(vistas.sort(), ["En cola", "Nueva"], "las dos se contestaron");
  assert.equal(await nueva, "x");
  assert.equal(await encolada, true);
  assert.equal(getPendingDialog(), null, "la cola se vacia: nadie se queda colgado");
});

test("contestar dos veces no contesta la siguiente", async () => {
  const primera = confirmDialog({ title: "Primera", message: "…" });
  const segunda = confirmDialog({ title: "Segunda", message: "…" });

  acceptPendingDialog();
  acceptPendingDialog(); // doble clic o Enter repetido
  assert.equal(await primera, true);

  // La segunda sigue esperando su turno, no se ha contestado por error.
  assert.equal(
    getPendingDialog()?.kind === "confirm" && getPendingDialog()?.title,
    "Segunda",
  );
  acceptPendingDialog();
  assert.equal(await segunda, true);
});

test("isDialogPending avisa de lo que esta a la espera", async () => {
  assert.equal(isDialogPending(), false, "nada abierto al empezar");

  // Primero la de pantalla, despues la que se encola. Al reves, la segunda se
  // queda en pantalla y la primera en la cola, que no es lo que se quiere probar.
  const enPantalla = confirmDialog({ title: "Primera", message: "..." });
  const encolada = promptDialog({ title: "Segunda", value: "b" });
  assert.equal(isDialogPending(), true, "con una en pantalla si hay dialogo");

  acceptPendingDialog();
  assert.equal(await enPantalla, true);

  await turn();
  assert.equal(
    getPendingDialog()?.kind === "text" && getPendingDialog()?.title,
    "Segunda",
    "la de la cola entra cuando se contesta la anterior",
  );
  assert.equal(isDialogPending(), true);

  cancelPendingDialog();
  assert.equal(await encolada, null, "cancelar devuelve null");
  assert.equal(isDialogPending(), false, "la cola se vacia al contestarla");
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
