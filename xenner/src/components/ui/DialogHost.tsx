import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

import {
  acceptPendingDialog,
  cancelPendingDialog,
  getPendingDialog,
  type ConfirmRequest,
  type PendingDialog,
  type TextRequest,
} from "../../services/dialogs";
import styles from "../../styles/components/DialogHost.module.css";
import { Button } from "./Button";
import { ModalBackdrop } from "./ModalBackdrop";

/**
 * El único sitio donde se pinta una pregunta pendiente.
 *
 * No recibe props a propósito: pregunta a `services/dialogs` qué hay abierto y
 * se monta una vez en `App.tsx`. Así cualquier servicio puede preguntar sin que
 * haya que atravesar el árbol con callbacks.
 *
 * Sustituye a `window.prompt` y `window.confirm`, que en el WebView de Android
 * no sirven para nada: el anfitrión tendría que implementar `onJsPrompt` y
 * `onJsConfirm`, y si no lo hace la llamada vuelve como cancelada. Con esto,
 * renombrar y borrar funcionan igual en las dos plataformas.
 */

function ConfirmCard(props: { request: ConfirmRequest }) {
  return (
    <>
      <h2 class={styles.title}>{props.request.title}</h2>
      <p class={styles.message}>{props.request.message}</p>
      <div class={styles.actions}>
        <Button type="button" onClick={cancelPendingDialog}>
          {props.request.cancelLabel}
        </Button>
        <Button
          type="button"
          variant="primary"
          class={props.request.danger ? styles.danger : ""}
          onClick={() => acceptPendingDialog()}
        >
          {props.request.confirmLabel}
        </Button>
      </div>
    </>
  );
}

function TextCard(props: { request: TextRequest }) {
  const [value, setValue] = createSignal(props.request.value);
  let input: HTMLInputElement | undefined;

  function accept(): void {
    acceptPendingDialog(value());
  }

  // El campo entra con el foco y el texto seleccionado, que es lo que se espera
  // de un «renombrar» abierto con un nombre ya escrito.
  onMount(() => queueMicrotask(() => input?.select()));

  return (
    <>
      <h2 class={styles.title}>{props.request.title}</h2>
      <label class={styles.field}>
        <span class={styles.label}>{props.request.label}</span>
        <input
          ref={(element) => (input = element)}
          class={styles.input}
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            accept();
          }}
        />
        <Show when={props.request.hint}>
          <small class={styles.hint}>{props.request.hint}</small>
        </Show>
      </label>
      <div class={styles.actions}>
        <Button type="button" onClick={cancelPendingDialog}>
          {props.request.cancelLabel}
        </Button>
        <Button type="button" variant="primary" disabled={!value().trim()} onClick={accept}>
          {props.request.confirmLabel}
        </Button>
      </div>
    </>
  );
}

export function DialogHost() {
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !getPendingDialog()) return;
    event.preventDefault();
    event.stopPropagation();
    cancelPendingDialog();
  }

  // Escape cierra el diálogo abierto. Se escucha en fase de captura para ganarle
  // al menú contextual, que también lo escucha y se cierra antes.
  onMount(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown, true));
  });

  return (
    <Show when={getPendingDialog()} keyed>
      {(current: PendingDialog) => (
        <Portal>
          <ModalBackdrop onBackdropPointerDown={cancelPendingDialog}>
            <div
              class={styles.card}
              role="alertdialog"
              aria-modal="true"
              aria-label={current.title}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {current.kind === "confirm" ? (
                <ConfirmCard request={current} />
              ) : (
                <TextCard request={current} />
              )}
            </div>
          </ModalBackdrop>
        </Portal>
      )}
    </Show>
  );
}
