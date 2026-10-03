/**
 * El Markdown que se guarda, con retardo.
 *
 * Serializar en cada pulsación es lo que hace lento un editor de texto: la nota
 * entera pasa por el analizador de Markdown mientras se escribe, y eso se nota
 * en cuanto la nota tiene unos cuantos miles de palabras. Aquí se serializa con
 * un **debounce**: cada cambio rearma el temporizador y solo sale cuando se para
 * uno a escribir.
 *
 * El retardo por sí solo no basta, porque hay dos momentos en los que el
 * temporizador se pierde en el camino —cambiar de nota o cerrar la app— y en los
 * dos hace falta el Markdown: al perder el foco y al destruirse el editor. Por eso
 * el mismo objeto tiene `flush()` (suelta lo pendiente sin esperar) y `dispose()`
 * (suelta lo pendiente y limpia), y los dos entregan el estado real del documento.
 */

export interface SerializadorDeNota {
  /** Marca que el documento cambió: entrega el Markdown con retardo. */
  schedule(): void;
  /** Suelta lo pendiente ahora mismo, si algo quedó pendiente. */
  flush(): void;
  /** El Markdown de ahora mismo, aunque no haya cambios: lo que pide el handle. */
  current(): string;
  /**
   * **Olvida** lo pendiente sin entregarlo, y limpia el temporizador.
   *
   * Es lo que se usa al recargar la nota desde el disco: lo que había en el
   * editor pasa a estar desfasado a propósito y no puede volver a escribirse. Con
   * `flush()` el orden sería justo el contrario del que se quiere —primero se
   * escribe el contenido viejo en el disco y después se carga el nuevo—, así que
   * recargar para traerse un cambio externo se acabaría revirtiendo ese cambio.
   */
  cancel(): void;
  /**
   * Suelta lo último pendiente y limpia el temporizador.
   *
   * Para `onDestroy`. Es idempotente: si no queda nada por entregar, no entrega
   * nada, porque un `onChange` con el mismo Markdown al destruirse el editor
   * guardaría la nota otra vez sin motivo.
   */
  dispose(): void;
}

export interface SerializadorOptions {
  /** El Markdown del documento ahora mismo, ya con las rutas de `.assets` restauradas. */
  read(): string;
  /** Entrega el Markdown a quien guarda la nota. */
  write(markdown: string): void;
  /** Cuánto se espera a que se pare uno a escribir. */
  delayMs?: number;
}

/**
 * Cuánto se espera a que se pare uno a escribir.
 *
 * 250 ms es lo que notan los dedos: más corto y se serializa mientras se sigue
 * escribiendo —que es justo lo que se quiere evitar—, más largo y al guardar a
 * mano hay una espera que se nota.
 */
const RETARDO_POR_DEFECTO = 250;

export function createNoteSerializer(options: SerializadorOptions): SerializadorDeNota {
  const retardo = options.delayMs ?? RETARDO_POR_DEFECTO;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let pendiente = false;

  const soltar = (): void => {
    limpiar();
    if (!pendiente) return;
    pendiente = false;
    options.write(options.read());
  };

  const limpiar = (): void => {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  };

  return {
    schedule() {
      pendiente = true;
      limpiar();
      temporizador = setTimeout(soltar, retardo);
    },
    flush: soltar,
    current: () => options.read(),
    cancel() {
      limpiar();
      pendiente = false;
    },
    dispose: soltar,
  };
}