import { createSignal } from "solid-js";

/**
 * Preguntas que se hacen desde cualquier sitio y se contestan en un modal de la
 * propia app.
 *
 * Antes esto se resolvía con `window.prompt` y `window.confirm`. En un WebView
 * de Android esos dos no existen de forma utilizable: el anfitrión tiene que
 * implementar `onJsPrompt` y `onJsConfirm`, y si no lo hace la llamada se
 * devuelve como cancelada. Es decir, en Android no se podía renombrar ni
 * borrar nada. Un solo camino para las dos plataformas quita el problema de
 * raíz y de paso el diálogo pasa a parecerse al resto de la app.
 *
 * El estado vive aquí, fuera de los componentes, para que cualquier servicio
 * pueda preguntar sin tener que recibir un `ref` del árbol. `DialogHost` es el
 * único que pinta lo que hay pendiente.
 */

export interface ConfirmOptions {
  /** Lo que se pregunta, en una línea. Va en el título del modal. */
  title: string;
  /** La explicación de qué va a pasar al aceptar. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta el botón de aceptar como destructivo. */
  danger?: boolean;
}

export interface TextOptions {
  title: string;
  /** La etiqueta del campo. Si no se pasa se usa el título. */
  label?: string;
  /** Una línea de ayuda bajo el campo. */
  hint?: string;
  /** El valor con el que se abre el campo. */
  value?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** Una pregunta de sí o no, ya normalizada con sus etiquetas por defecto. */
export interface ConfirmRequest {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  settle(value: boolean): void;
}

/** Una pregunta que pide escribir un valor, ya normalizada. */
export interface TextRequest {
  kind: "text";
  title: string;
  label: string;
  hint: string;
  value: string;
  confirmLabel: string;
  cancelLabel: string;
  settle(value: string | null): void;
}

export type PendingDialog = ConfirmRequest | TextRequest;

const [pending, setPending] = createSignal<PendingDialog | null>(null);
const waiting: PendingDialog[] = [];

/** Lo que hay en pantalla ahora mismo, o `null`. Lo lee `DialogHost`. */
export function getPendingDialog(): PendingDialog | null {
  return pending();
}

/** Si hay algo esperando que se conteste. */
export function hasPendingDialog(): boolean {
  return pending() !== null || waiting.length > 0;
}

function open(request: PendingDialog): void {
  if (pending()) {
    // Solo se pregunta una cosa a la vez. Lo que llega detrás espera su turno en
    // vez de pisar a la pregunta anterior, que si no se quedaría sin respuesta.
    waiting.push(request);
    return;
  }
  setPending(request);
}

function next(): void {
  const upcoming = waiting.shift();
  if (!upcoming) return;
  // En el siguiente turno, para que el modal saliente se desmonte antes de que
  // entre el entrante.
  queueMicrotask(() => setPending(upcoming));
}

/**
 * Cancela lo que haya abierto. Es la respuesta que significa «nada»: `false`
 * para un sí o no y `null` para un campo de texto.
 *
 * El `if` con dos ramas es a propósito: narroweando primero, TypeScript sabe
 * qué `settle` está calling. En una línea con ternario no lo sabe, porque los
 * dos métodos de la unión se intersecan y el parámetro acaba siendo `never`.
 */
function cancel(current: PendingDialog): void {
  if (current.kind === "confirm") current.settle(false);
  else current.settle(null);
}

/** Cierra lo que haya abierto sin contestarlo: Escape, fondo o el botón de cancelar. */
export function cancelPendingDialog(): void {
  const current = pending();
  if (!current) return;
  setPending(null);
  cancel(current);
  next();
}

/**
 * Contesta afirmativamente. En un diálogo de texto, `text` es lo que había
 * escrito la persona; si no se pasa, se usa el valor con el que se abrió.
 */
export function acceptPendingDialog(text?: string): void {
  const current = pending();
  if (!current) return;
  setPending(null);
  if (current.kind === "confirm") current.settle(true);
  else current.settle((text ?? current.value).trim());
  next();
}

/** Vacía la cola y cancela lo pendiente. Solo lo usan los tests. */
export function resetDialogs(): void {
  waiting.length = 0;
  const current = pending();
  if (!current) return;
  setPending(null);
  cancel(current);
}

/** «¿Seguro?» con los botones que se pueden cambiar. Resuelve `false` si se cancela. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    open({
      kind: "confirm",
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Continuar",
      cancelLabel: options.cancelLabel ?? "Cancelar",
      danger: options.danger ?? false,
      settle: resolve,
    });
  });
}

/** Una pregunta que pide escribir un valor. Resuelve `null` si se cancela. */
export function promptDialog(options: TextOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    open({
      kind: "text",
      title: options.title,
      label: options.label ?? options.title,
      hint: options.hint ?? "",
      value: options.value ?? "",
      confirmLabel: options.confirmLabel ?? "Guardar",
      cancelLabel: options.cancelLabel ?? "Cancelar",
      settle: resolve,
    });
  });
}
