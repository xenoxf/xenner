import { createMemo, createSignal, For, Show } from "solid-js";

import { defaultValue, keysOf } from "../../skin/editor";
import styles from "../../styles/components/SkinCreator.module.css";
import type { ParsedSkinComponent } from "../../skin/parse";

export interface SkinFilesEditorProps {
  component: ParsedSkinComponent;
  /** Los valores del archivo, con las imágenes ya resueltas para el color. */
  values: Record<string, string>;
  /** Cómo se llama esta parte, para el título. */
  label: string;
  onSet(key: string, value: string): void;
  onRaw(text: string): void;
}

/**
 * Una fila por clave, con el valor escrito a mano.
 *
 * Aquí no hay límites de valor. Un color, un degradado, una sombra con siete
 * cifras, un `url()` con una imagen, un `calc()`. La lista de claves sí es
 * cerrada, y a propósito: una clave que no existe no hace nada, y una lista
 * cerrada es lo que permite decir «esto es todo lo que hay» sin mentir.
 *
 * Cada fila trae tres cosas que son la diferencia entre esto y un formulario:
 *
 *   - **Un ejemplo**, que se escribe solo la primera vez. Es lo que hace que no
 *     haga falta saber CSS para cambiar el grosor de un borde.
 *   - **«Poner el valor de Xenner»**, para volver atrás sin acordarse de qué era.
 *   - **El valor entero a la vista**, porque un campo de texto estrecho esconde
 *     justo lo que uno quiere comprobar.
 *
 * Y debajo, el archivo entero como texto, con sus comentarios y su orden. Es la
 * misma puerta por donde entra quien edita con el Bloc de notas abierto al lado,
 * y por eso escribir aquí y escribir fuera llevan al mismo sitio.
 */
export function SkinFilesEditor(props: SkinFilesEditorProps) {
  const [verTexto, setVerTexto] = createSignal(false);
  const [nuevaClave, setNuevaClave] = createSignal("");
  const [texto, setTexto] = createSignal("");
  const [errorClave, setErrorClave] = createSignal<string | null>(null);

  const claves = createMemo(() => keysOf(props.component));
  const permitidas = createMemo(() => new Set<string>(claves()));

  // Al cambiar de parte, el editor de texto tiene que quedarse vacío. Sin esto
  // se vería el archivo anterior con otro título encima, que es la forma más
  // rápida de escribir en el archivo que no es. Y vacío a propósito aunque no se
  // cambie de parte: si se llenara con los valores actuales, guardar sin tocar
  // nada reescribiría el archivo y se perderían los comentarios.
  let anterior: string | null = null;
  const actual = () => props.component;
  if (actual() !== anterior) {
    anterior = actual();
    setTexto("");
    setVerTexto(false);
    setNuevaClave("");
    setErrorClave(null);
  }

  function escribir(clave: string, valor: string): void {
    props.onSet(clave, valor);
  }

  function añadirClave(): void {
    const clave = nuevaClave().trim();
    if (!clave) return;
    if (!permitidas().has(clave)) {
      setErrorClave(`«${clave}» no es una clave de esta parte.`);
      return;
    }
    setErrorClave(null);
    setNuevaClave("");
    escribir(clave, "");
  }

  function conImagen(valor: string): boolean {
    return valor.includes("url(");
  }

  return (
    <div class={styles.filesEditor}>
      <ul class={styles.keyList}>
        <For each={claves()}>
          {(clave) => {
            const valor = () => props.values[clave] ?? "";
            const ejemplo = () => defaultValue(props.component, clave);
            return (
              <li class={styles.keyRow}>
                <div class={styles.keyHead}>
                  <code class={styles.keyName}>{clave}</code>
                  <Show when={valor() === ""}>
                    <span class={styles.keyVacio}>sin cambiar</span>
                  </Show>
                  <Show when={conImagen(valor())}>
                    <span class={styles.keyImage}>con imagen</span>
                  </Show>
                  <span class={styles.keyActions}>
                    <Show when={valor() !== ""}>
                      <button
                        type="button"
                        class={styles.keyMini}
                        title={`Volver al valor de Xenner: ${ejemplo() || "el de fábrica"}`}
                        onClick={() => escribir(clave, "")}
                      >
                        Valor de Xenner
                      </button>
                    </Show>
                    <Show when={valor() === "" && ejemplo() !== ""}>
                      <button
                        type="button"
                        class={styles.keyMini}
                        onClick={() => escribir(clave, ejemplo())}
                      >
                        Usar el de Xenner
                      </button>
                    </Show>
                  </span>
                </div>
                <input
                  class={styles.keyValue}
                  value={valor()}
                  spellcheck={false}
                  placeholder={ejemplo() || "vacío"}
                  aria-label={`${clave} de ${props.label}`}
                  onInput={(evento) => escribir(clave, evento.currentTarget.value)}
                />
                <Show when={ejemplo() !== "" && valor() === ""}>
                  <p class={styles.keyHint}>
                    Ejemplo: <code>{ejemplo()}</code>
                  </p>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>

      <div class={styles.newKey}>
        <input
          class={styles.newKeyInput}
          value={nuevaClave()}
          spellcheck={false}
          placeholder="nombreDeUnaClave"
          aria-label="Nombre de una clave nueva"
          list="skin-claves-conocidas"
          onInput={(evento) => setNuevaClave(evento.currentTarget.value)}
        />
        <datalist id="skin-claves-conocidas">
          <For each={claves()}>{(clave) => <option value={clave} />}</For>
        </datalist>
        <button type="button" class={styles.newKeyButton} onClick={añadirClave}>
          Añadir
        </button>
        <Show when={errorClave()}>
          {(motivo) => (
            <p class={styles.formError} role="alert">
              {motivo()}
            </p>
          )}
        </Show>
      </div>

      <div class={styles.rawToggle}>
        <button
          type="button"
          class={styles.linkish}
          aria-expanded={verTexto()}
          onClick={() => setVerTexto(!verTexto())}
        >
          {verTexto() ? "Ocultar el archivo" : "Ver el archivo entero tal cual"}
        </button>
        <p class={styles.quickNote}>
          Lo de arriba escribe este mismo archivo. Si lo prefieres escribir a mano —
          con comentarios y todo—, aquí está, y es el mismo archivo que verás si
          abres la carpeta de Xenner.
        </p>
      </div>
      <Show when={verTexto()}>
        <textarea
          class={styles.rawArea}
          spellcheck={false}
          wrap="off"
          aria-label={`El archivo ${props.component}.txt`}
          value={texto()}
          onInput={(evento) => setTexto(evento.currentTarget.value)}
          onBlur={() => {
            const escrito = texto();
            if (escrito === "") return;
            props.onRaw(escrito);
          }}
        />
      </Show>
    </div>
  );
}
