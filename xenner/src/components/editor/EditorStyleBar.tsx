import type { CommandProps, Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import {
  leaveCaretBehind,
  setBlockType,
  setTextStyle,
  type ReportFailure,
} from "../../editor/commands.ts";
import {
  EDITOR_BLOCK_TYPES,
  EDITOR_BUTTON_LABELS,
  EDITOR_COLOR_ICONS,
  normalizeLinkHref,
  STYLE_BLOCKS,
  stylesInSelection,
  type StyleBlockId,
  type StyleBlockItem,
} from "../../editor/menu-content.ts";
import styles from "../../styles/components/NoteEditor.module.css";

export interface EditorStyleBarProps {
  /** El editor, o `null` mientras se lee la nota: la barra se pinta igualmente. */
  editor: Editor | null;
  /**
   * Sube en cada transacción del editor.
   *
   * Los botones **no** guardan el estado: leen del editor vivo cada vez que este
   * número cambia. Si guardaran una copia, cualquier cosa —escribir una letra,
   * mover el cursor, deshacer— los dejaría enseñando lo que ya no es.
   */
  version: () => number;
  /** Quién avisa de un fallo, para que no se quede en la consola. */
  report: ReportFailure;
}

/** Un tramo de texto del documento. */
type Rango = { from: number; to: number };

/**
 * La barra de formato: **siempre visible**, encima de la nota.
 *
 * Es la decisión que hace que quien escribe no tenga que saber qué es Markdown:
 * el tipo de bloque se elige con su nombre («Título 2», «Viñetas», «Separador») y
 * quien no sabe qué es Markdown no tiene por qué tener un atajo que se lo ahorre.
 *
 * Tres cosas de aquí son bugs ya pagados y no se pueden romper:
 *
 * - **Vive fuera del `contenteditable`.** Si un botón recibiera el foco al
 *   pulsarlo, el editor perdería la selección justo antes de aplicar el formato.
 *   Por eso el `preventDefault` va en la barra entera y no en cada botón.
 * - **El estado se lee del editor vivo**, con el número de transacción, y no de
 *   una señal propia que se pueda desincronizar.
 * - **Nada de diálogos del sistema** para preguntar texto: un `prompt` en Tauri es
 *   un diálogo que no aparece. El enlace se escribe en la propia barra.
 */
export function EditorStyleBar(props: EditorStyleBarProps) {
  let barra: HTMLDivElement | undefined;
  let botonEstilo: HTMLButtonElement | undefined;
  let menuEstilo: HTMLDivElement | undefined;
  let enlaceInput: HTMLInputElement | undefined;
  let colorInput: HTMLInputElement | undefined;
  let fondoInput: HTMLInputElement | undefined;

  const [estiloAbierto, setEstiloAbierto] = createSignal(false);
  /** Qué entrada del desplegable está resaltada, para recorrerlo con las flechas. */
  const [estiloResaltado, setEstiloResaltado] = createSignal(0);
  const [enlaceAbierto, setEnlaceAbierto] = createSignal(false);
  const [enlaceUrl, setEnlaceUrl] = createSignal("");

  /**
   * Dónde está el puntero, la última vez que se movió.
   *
   * Se guarda porque **el gesto de seleccionar termina sin mover el ratón**: el
   * último `pointermove` ocurre con la selección a medio hacer, y al soltar ya no
   * llega ningún evento más. Comprobar solo en `pointermove` era mirar el sitio
   * equivocado: la píldora no salía nunca justo después de seleccionar, que es
   * justo cuando tiene que salir.
   */
  let puntero: { x: number; y: number } | null = null;

  /**
   * Si el puntero está encima del texto seleccionado, ahora mismo.
   *
   * Se compara con el rectángulo que la selección ocupa, con unos píxeles de
   * margen: preguntar a ProseMirror qué hay bajo el puntero (`posAtCoords`) es más
   * exacto, pero falla en los bordes de las letras y aquí lo que importa es que
   * la píldora aparezca cuando se va a usar.
   */
  function punteroSobreSeleccion(): boolean {
    const editor = props.editor;
    if (!editor || editor.isDestroyed || !puntero) return false;
    const { from, to } = editor.state.selection;
    if (from === to) return false;
    const inicio = editor.view.coordsAtPos(from);
    const fin = editor.view.coordsAtPos(to);
    if (!inicio || !fin) return false;
    return (
      puntero.x >= inicio.left - 8 &&
      puntero.x <= fin.right + 8 &&
      puntero.y >= inicio.top - 6 &&
      puntero.y <= fin.bottom + 6
    );
  }

  /** Vuelve a mirar si el puntero está sobre la selección, y recoloca la píldora. */
  function evaluar(): void {
    if (punteroSobreSeleccion()) {
      cancelarOcultar();
      setSobreSeleccion(true);
    } else {
      programarOcultar();
    }
    reposicionar();
  }

  /**
   * Ocultar **no** es inmediato: se espera un instante.
   *
   * Este era el fallo que hacía la píldora «funcionar unas veces y otras no». La
   * píldora está 8 px encima del texto, así que para llegar a ella hay un hueco, y
   * al cruzarlo el puntero sale del editor (`pointerleave`) y entraba en la píldora
   * sin que hubiera tiempo de ninguna de las dos cosas: se escondía justo
   * cuando ya casi se podía pulsar. Con la espera, hay tiempo de llegar; y si se
   * entra, se cancela.
   */
  let ocultar: ReturnType<typeof setTimeout> | null = null;
  const ESPERA_PARA_OCULTAR = 220;

  function programarOcultar(): void {
    if (ocultar) return;
    ocultar = setTimeout(() => {
      ocultar = null;
      setSobreSeleccion(false);
    }, ESPERA_PARA_OCULTAR);
  }

  function cancelarOcultar(): void {
    if (!ocultar) return;
    clearTimeout(ocultar);
    ocultar = null;
  }

  /**
   * Si la barra se ve, y por qué.
   *
   * La barra aparece cuando **el puntero está encima del texto seleccionado**, y
   * se queda mientras el puntero esté encima de ella misma. Lo segundo no es un
   * detalle: si solo mirara el texto, en cuanto el ratón subiera a la barra para
   * pulsar «Negrita» se escondería por debajo del puntero y el clic no llegaría.
   * Ese fallo —una interfaz que se esconde justo cuando la vas a usar— salía
   * antes, y por eso está escrito aquí y no repartido por el componente.
   *
   * Con el teclado no hace falta puntero: la selección se hizo con las flechas o
   * con Mayúsculas, así que se enseña siempre que haya algo seleccionado.
   */
  const [sobreSeleccion, setSobreSeleccion] = createSignal(false);
  const [sobreLaBarra, setSobreLaBarra] = createSignal(false);
  /**
   * Cómo se hizo la última selección: con el puntero o con el teclado.
   *
   * Es lo que evita tener que decidir entre dos fallos. Si solo contara el
   * puntero, quien selecciona con `Mayúsculas` o con las flechas no vería nunca la
   * barra; si la barra saliera siempre que hay selección, dejaría de ser flotante
   * y sería un adorno fijo. Con esto sale en los dos casos en que tiene sentido.
   */
  const [gesto, setGesto] = createSignal<"teclado" | "puntero">("puntero");

  /**
   * Hay algo seleccionado y el editor está editable.
   *
   * El `props.version()` de la primera línea es lo que hace que esto pueda
   * cambiar: leer la selección no engancha nada a Solid, así que sin él el memo se
   * guardaba la respuesta de cuando se montó la barra —que era que no había nada
   * seleccionado— y la píldora no salía nunca, ni con el ratón ni con el teclado.
   * Es el mismo contrato que `leerEstiloActual` y `marcaPuesta`.
   */
  const haySeleccion = createMemo(() => {
    props.version();
    const instance = props.editor;
    if (!instance || instance.isDestroyed || !instance.isEditable) return false;
    return instance.state.selection.from !== instance.state.selection.to;
  });

  /** Visible si hay selección y el puntero está en el texto o en la propia barra. */
  const visible = createMemo(
    () => haySeleccion() && (sobreSeleccion() || sobreLaBarra() || gesto() === "teclado"),
  );

  /**
   * Dónde va la píldora, en coordenadas de la **ventana**.
   *
   * Se mide el rectángulo que la selección ocupa de verdad —con `coordsAtPos`— y la
   * píldora se coloca encima, centrada y con un hueco. `position: fixed` y no
   * `absolute` porque el editor vive dentro de dos contenedores con scroll, y con
   * coordenadas de ventana no hay que hacer cuentas con ninguno de los dos.
   *
   * Si arriba no cabe —la selección está en la primera línea de la nota— se
   * coloca **debajo**: un menú flotante que se sale de la pantalla no es flotante,
   * es un menú que no está.
   */
  const [posicion, setPosicion] = createSignal<{ top: number; left: number } | null>(null);

  /** El hueco que se deja entre la píldora y el texto. */
  const HUECO = 8;
  /** Lo mínimo que hay que dejar contra el borde de la ventana. */
  const MARGEN = 8;

  function reposicionar(): void {
    const editor = props.editor;
    if (!editor || editor.isDestroyed) {
      setPosicion(null);
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) {
      setPosicion(null);
      return;
    }
    const inicio = editor.view.coordsAtPos(from);
    const fin = editor.view.coordsAtPos(to);
    if (!inicio || !fin) {
      setPosicion(null);
      return;
    }
    // Se mide la píldora ya montada: sin esto solo se conoce el ancho aproximado
    // y se centraría por la mitad de un número inventado.
    const caja = barra?.getBoundingClientRect();
    const ancho = caja?.width || 320;
    const alto = caja?.height || 36;
    const centro = (inicio.left + fin.right) / 2 - ancho / 2;
    const limite = Math.max(MARGEN, window.innerWidth - ancho - MARGEN);
    const arriba = inicio.top - alto - HUECO;
    setPosicion({
      left: Math.min(Math.max(MARGEN, centro), limite),
      top: arriba >= MARGEN ? arriba : fin.bottom + HUECO,
    });
  }

  /**
   * Lo que había seleccionado al abrir algo que **se lleva el foco**.
   *
   * El desplegable de estilos con el teclado y los diálogos de color del sistema
   * se lo llevan, y con él la selección del editor. Se guarda **antes** de
   * abrirlos, que es lo único que hay que hacer: para cuando se cierra, la
   * selección ya no está donde estaba.
   */
  let rangoGuardado: Rango | null = null;

  // Las marcas de texto, en el orden en que las pone Word: negrita, cursiva,
  // subrayado, tachado y código.
  const marcas = [
    { name: "bold", label: EDITOR_BUTTON_LABELS.bold, glifo: "B", clase: styles.glyphBold },
    { name: "italic", label: EDITOR_BUTTON_LABELS.italic, glifo: "I", clase: styles.glyphItalic },
    {
      name: "underline",
      label: EDITOR_BUTTON_LABELS.underline,
      glifo: "U",
      clase: styles.glyphUnderline,
    },
    { name: "strike", label: EDITOR_BUTTON_LABELS.strikethrough, glifo: "S", clase: styles.glyphStrike },
    { name: "code", label: EDITOR_BUTTON_LABELS.code, glifo: "</>", clase: styles.glyphCode },
  ] as const;

  /**
   * La barra vive fuera del `contenteditable`: si un botón recibiera el foco al
   * pulsarlo, el editor perdería la selección justo antes de aplicar el formato.
   *
   * El `preventDefault` va en el **contenedor** de la barra —la fila y su
   * desplegable— y no en cada botón, para que un botón nuevo no se pueda olvidar.
   * La única excepción es el input del enlace: ahí el clic natural es justo lo que
   * hace falta, porque se escribe dentro.
   */
  onMount(() => {
    const conservarLaSeleccion = (event: Event): void => {
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
    };
    barra?.addEventListener("pointerdown", conservarLaSeleccion);
    barra?.addEventListener("mousedown", conservarLaSeleccion);

    /**
     * Si el puntero está **encima del texto seleccionado**.
     *
     * Se pregunta al propio ProseMirror qué hay bajo el puntero
     * (`posAtCoords`), en vez de mirar si el evento viene del editor: eso
     * distingue «está encima de las letras que elegí» de «está en el margen, en el
     * botón de al lado o en la propia barra», que es justo lo que hay que
     * distinguir.
     */
    const seguirElPuntero = (event: PointerEvent): void => {
      puntero = { x: event.clientX, y: event.clientY };
      setGesto("puntero");
      evaluar();
    };
    const salir = (): void => {
      // No se esconde aquí: se programa. Ver `programarOcultar`.
      programarOcultar();
    };
    const entrarEnLaBarra = (): void => {
      cancelarOcultar();
      setSobreLaBarra(true);
    };
    const salirDeLaBarra = (): void => {
      setSobreLaBarra(false);
      programarOcultar();
    };

    barra?.addEventListener("pointerenter", entrarEnLaBarra);
    barra?.addEventListener("pointerleave", salirDeLaBarra);

    /**
     * El puntero se sigue en el editor, que **aparece después** que la barra.
     *
     * Por eso está en un `createEffect` y no en el `onMount`: cuando la barra se
     * monta el editor todavía no existe —se están leyendo los assets— y un
     * `onMount` se quedaría sin escuchar nada para siempre.
     */
    createEffect(() => {
      const editor = props.editor;
      const dom = editor?.view?.dom;
      if (!dom) return;
      /**
       * Con el teclado la selección no la hizo el ratón, así que no hay «hover» que
       * mirar: la píldora sale porque el gesto fue de teclado. Una sola tecla
       * pulsada sobre el editor vuelve a dejarla en modo puntero.
       */
      const porTeclado = (): void => {
        setGesto("teclado");
        reposicionar();
      };
      /**
       * Al pulsar y al soltar, la selección ya es la buena.
       *
       * Sin mirar en estos dos momentos, la píldora dependería de que el puntero se
       * moviera **después** de seleccionar, y seleccionar con el ratón es justo lo
       * contrario: se elige y se suelta. Con doble clic no hay ni un solo
       * `pointermove`, así que el puntero se guarda también al pulsar.
       */
      const apuntar = (event: PointerEvent): void => {
        puntero = { x: event.clientX, y: event.clientY };
        setGesto("puntero");
      };
      const alSoltar = (): void => {
        if (gesto() === "puntero") evaluar();
      };
      dom.addEventListener("pointermove", seguirElPuntero);
      dom.addEventListener("pointerdown", apuntar);
      dom.addEventListener("pointerleave", salir);
      dom.addEventListener("pointerup", alSoltar);
      // Un gesto cancelado no es un gesto: con el dedo, el navegador cancela el
      // puntero en cuanto el dedo se pone a desplazar, y sin esto la píldora se
      // quedaba encima de la nota con el texto ya movido de sitio.
      dom.addEventListener("pointercancel", salir);
      dom.addEventListener("keydown", porTeclado);
      /**
       * La píldora va anclada a la selección, así que tiene que moverse con ella:
       * al hacer scroll, al redimensionar la ventana y al cambiar el tamaño de la
       * propia píldora —que envuelve a dos filas si no caben todos los botones—.
       *
       * El scroll se escucha en fase de captura porque el editor está dentro de dos
       * contenedores con scroll y solo así se pilla el de cualquiera de los dos.
       */
      const alMover = (): void => reposicionar();
      window.addEventListener("scroll", alMover, true);
      window.addEventListener("resize", alMover);
      onCleanup(() => {
        dom.removeEventListener("pointermove", seguirElPuntero);
        dom.removeEventListener("pointerdown", apuntar);
        dom.removeEventListener("pointerleave", salir);
        dom.removeEventListener("pointerup", alSoltar);
        dom.removeEventListener("pointercancel", salir);
        dom.removeEventListener("keydown", porTeclado);
        window.removeEventListener("scroll", alMover, true);
        window.removeEventListener("resize", alMover);
      });
    });

    // Cada transacción mueve el cursor o la selección, así que la comprobación se
    // repite: seleccionar con el ratón, con doble clic o arrastrar desde el asa
    // termina sin que el puntero se mueva una sola vez más.
    createEffect(() => {
      props.version();
      if (gesto() === "puntero") evaluar();
      else reposicionar();
    });

    /**
     * Lo que estaba abierto se cierra al esconderse la píldora.
     *
     * Si no, el desplegable de estilos se quedaría abierto y volvería a salir
     * abierto en la siguiente selección, con la lista de estilos pendurada sobre
     * un texto que no es el que se eligió.
     */
    createEffect(() => {
      if (visible()) return;
      cancelarOcultar();
      setEstiloAbierto(false);
      setEnlaceAbierto(false);
      setEstiloResaltado(0);
    });

    onCleanup(() => {
      cancelarOcultar();
      barra?.removeEventListener("pointerdown", conservarLaSeleccion);
      barra?.removeEventListener("mousedown", conservarLaSeleccion);
      barra?.removeEventListener("pointerenter", entrarEnLaBarra);
      barra?.removeEventListener("pointerleave", salirDeLaBarra);
    });
  });

  /** Lo que hay seleccionado ahora mismo, o `null` si el cursor está suelto. */
  function rangoVivo(): Rango | null {
    const editor = props.editor;
    if (!editor || editor.isDestroyed) return null;
    const { from, to } = editor.state.selection;
    return from === to ? null : { from, to };
  }

  /**
   * El rango con el que hay que aplicar el cambio.
   *
   * Si el editor sigue enfocado, su selección es la buena: lo guardado se quedó
   * viejo en cuanto se escribió algo con el desplegable abierto. Si ya no lo
   * está —porque el foco se fue al desplegable o al diálogo del sistema— entonces
   * vale lo que había al abrirlo.
   */
  function rangoParaAplicar(): Rango | null {
    const editor = props.editor;
    if (!editor || editor.isDestroyed) return null;
    if (editor.view.hasFocus()) return rangoVivo();
    return rangoGuardado ?? rangoVivo();
  }

  /**
   * Repone un rango dentro de la transacción que se está montando.
   *
   * Después de cambiar la selección hay que **leer la transacción**: el estado que
   * llevan los comandos de Tiptap es una foto del anterior y solo se actualiza
   * cuando alguien lee `state.tr`. Sin esa lectura, un comando que pregunta a
   * `state.selection` —que es como funcionan `setBlockType` y `setTextStyle`— vería
   * la selección de antes del diálogo y el formato caería donde no toca. Está
   * leído del código de Tiptap, no es un truco: es lo que separa «se repuso el
   * rango» de «el rango repuesto lo ve quien lo usa».
   */
  function reponerRango(commandProps: CommandProps, rango: Rango): boolean {
    const tr = commandProps.tr;
    try {
      tr.setSelection(TextSelection.create(tr.doc, rango.from, rango.to));
    } catch (error) {
      props.report("no hay texto donde aplicar el cambio", error);
      return false;
    }
    // Esta línea existe por su efecto secundario, no por su valor.
    void commandProps.state.tr;
    return true;
  }

  /**
   * Repone el rango y aplica el cambio en la **misma** transacción.
   *
   * Dos despachos dejan la vista a medias si el segundo ya no puede correr, que
   * es justo la forma de fallo que el motor pelea para que no pase. Con el rango
   * dentro de la misma transacción, un deshacer devuelve la nota tal y como
   * estaba —selección incluida— y no a medio camino.
   */
  function conRango(
    rango: Rango | null,
    cambio: (commandProps: CommandProps) => boolean,
  ): void {
    const editor = props.editor;
    if (!editor || editor.isDestroyed) return;
    editor.commands.command((commandProps) => {
      if (rango && !reponerRango(commandProps, rango)) return false;
      return cambio(commandProps);
    });
    // Sin esto, lo que se escriba después del gesto va al sitio de antes: el foco
    // se quedó en el desplegable o en el diálogo del sistema.
    editor.view.focus();
  }

  /** El estilo del cursor, o `null` si en lo seleccionado hay más de uno. */
  function leerEstiloActual(): StyleBlockId | null {
    props.version();
    const editor = props.editor;
    if (!editor || editor.isDestroyed) return null;
    const { doc, selection } = editor.state;
    const estilos = stylesInSelection(doc, selection.from, selection.to);
    return estilos.size === 1 ? [...estilos][0] : null;
  }

  /**
   * El estilo que se ve en el botón.
   *
   * Es una cuenta perezosa y no una variable: depende de `version`, así que sola
   * se vuelve a calcular cuando el editor ha cambiado. Guardarla en un `let` sería
   * dejar de enseñar el estilo en cuanto el cursor se moviera.
   */
  const activo = createMemo(leerEstiloActual);

  /** Si una marca está puesta en lo seleccionado. */
  function marcaPuesta(nombre: string): boolean {
    props.version();
    return props.editor?.isActive(nombre) ?? false;
  }

  /** La entrada del desplegable que toca, para poderle dar el foco. */
  function entradaDeEstilo(indice: number): HTMLButtonElement | null {
    const botones = menuEstilo?.querySelectorAll<HTMLButtonElement>("[role='menuitem']");
    return botones?.[indice] ?? null;
  }

  /**
   * Devolver el foco al editor, si es que todavía está vivo.
   *
   * Se llama al cerrar el desplegable y el enlace, y a veces ya no queda editor:
   * la nota se puede cambiar con el menú de estilos abierto.
   */
  function focoDelEditor(): void {
    const editor = props.editor;
    if (editor && !editor.isDestroyed) editor.view.focus();
  }

  // --- El estilo de bloque -------------------------------------------------

  function abrirEstilos(conTeclado: boolean): void {
    const resaltado = Math.max(
      0,
      STYLE_BLOCKS.findIndex((item) => item.id === activo()),
    );
    setEstiloResaltado(resaltado);
    rangoGuardado = rangoVivo();
    // El enlace y los estilos son dos sitios donde escribir de golpe: abrir uno
    // cierra el otro.
    setEnlaceAbierto(false);
    setEstiloAbierto(true);
    // Con el ratón el foco se queda en el editor —la barra cancela el
    // `pointerdown`— y no hay que tocar nada. Con el teclado hay que llevar el foco
    // al desplegable, o los botones no se pueden recorrer con las flechas.
    if (conTeclado) queueMicrotask(() => entradaDeEstilo(resaltado)?.focus());
  }

  function cerrarEstilos(): void {
    setEstiloAbierto(false);
    // A donde se vuelve depende de dónde estaba el foco: si estaba en la barra —
    // se abrió con el teclado— se le devuelve el foco al botón, y si estaba en el
    // editor se le devuelve al editor, que es donde se estaba escribiendo.
    if (barra?.contains(document.activeElement ?? null)) botonEstilo?.focus();
    else focoDelEditor();
  }

  /**
   * El separador va **debajo** de lo seleccionado, nunca en su lugar.
   *
   * `setHorizontalRule` inserta donde está la selección, y donde está la
   * selección es lo que hay seleccionado: poner un separador sobre un texto
   * elegido se lo comería. Se lleva el cursor al final de lo elegido y se inserta
   * debajo.
   */
  function ponerSeparador(commandProps: CommandProps): boolean {
    if (!commandProps.state.selection.empty) {
      commandProps.tr.setSelection(TextSelection.near(commandProps.tr.selection.$to, 1));
    }
    return commandProps.commands.setHorizontalRule();
  }

  /**
   * Cambia el estilo de todo lo que toca la selección.
   *
   * El rango se repone **antes** de aplicar: el botón está fuera del
   * `contenteditable` y el gesto se lleva el foco. Con el texto seleccionado es
   * donde este botón se ha medido como roto —solo miraba el bloque del cursor y no
   * cambiaba nada—, así que el cambio va con `setBlockType`, que rehace los bloques
   * que la selección toca en vez de apretarles el tipo encima.
   */
  function aplicarEstilo(estilo: StyleBlockItem): void {
    const rango = rangoParaAplicar();
    rangoGuardado = null;
    setEstiloAbierto(false);
    conRango(rango, (commandProps) => {
      if (estilo.id === "divider") return ponerSeparador(commandProps);
      const nivel = nivelDeTitulo(estilo.id);
      // Del cuarto al sexto no son un tipo de bloque del motor: son un `heading`
      // con otro nivel, que es lo que `setBlockType` no sabe poner.
      if (nivel !== null && nivel > 3) {
        if (!commandProps.commands.setHeading({ level: nivel })) return false;
        return leaveCaretBehind(props.report)(commandProps);
      }
      const tipo = EDITOR_BLOCK_TYPES.find((bloque) => bloque === estilo.id);
      if (!tipo) {
        props.report("ese estilo no existe", estilo.id);
        return false;
      }
      if (!setBlockType(tipo, props.report)(commandProps)) return false;
      // Sin esto la selección se queda puesta y lo siguiente que se escriba
      // sustituye el texto entero: elegir un estilo y seguir escribiendo es el
      // gesto más natural del mundo y no puede borrar lo que se ha formateado.
      return leaveCaretBehind(props.report)(commandProps);
    });
  }

  /** Recorre el desplegable con las flechas, dando el foco a la entrada. */
  function moverEstilo(paso: number): void {
    const siguiente =
      (((estiloResaltado() + paso) % STYLE_BLOCKS.length) + STYLE_BLOCKS.length) %
      STYLE_BLOCKS.length;
    setEstiloResaltado(siguiente);
    queueMicrotask(() => entradaDeEstilo(siguiente)?.focus());
  }

  function teclasDeEstilo(event: KeyboardEvent): void {
    if (!estiloAbierto()) return;
    // Con el Tab el foco se va de la barra, y el desplegable se cierra: si no,
    // se queda abierto detrás de donde se ha ido quien está escribiendo.
    if (event.key === "Tab") {
      setEstiloAbierto(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moverEstilo(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moverEstilo(-1);
    }
    // El Intro y el espacio no se tocan: los atiende el botón que tiene el foco,
    // que es un `button` de verdad y ya sabe qué hacer con ellos.
  }

  // --- El enlace -----------------------------------------------------------

  function abrirEnlace(): void {
    const href = props.editor?.getAttributes("link").href;
    setEnlaceUrl(typeof href === "string" ? href : "");
    setEstiloAbierto(false);
    setEnlaceAbierto(true);
    // El input se enfoca a mano: se abre con el teclado —el Intro sobre el botón—,
    // y en ese caso no hay ningún clic que le pase el foco. Con el ratón el foco
    // llega solo, y enfocarlo aquí no estorba.
    queueMicrotask(() => {
      enlaceInput?.focus();
      enlaceInput?.select();
    });
  }

  function cerrarEnlace(): void {
    setEnlaceAbierto(false);
    focoDelEditor();
  }

  function aplicarEnlace(): void {
    const editor = props.editor;
    const href = normalizeLinkHref(enlaceUrl());
    setEnlaceAbierto(false);
    if (!editor || editor.isDestroyed) return;
    // Sin rango: la selección del editor sigue en su estado y `focus()` la vuelve
    // a poner en la pantalla, así que el enlace cae donde se eligió el texto.
    if (href) editor.chain().focus().toggleLink({ href }).run();
    else editor.chain().focus().unsetLink().run();
  }

  // --- Los colores ---------------------------------------------------------

  /**
   * Abre el diálogo de color del sistema.
   *
   * Ese diálogo se lleva el foco y con él la selección del editor, así que el
   * rango se guarda **antes** de abrirlo. Es el mismo problema que tenía el `+` y
   * se resuelve igual: recordar en el momento del gesto, no después.
   */
  function abrirColor(input: HTMLInputElement | undefined): void {
    if (!input) return;
    rangoGuardado = rangoVivo();
    input.click();
  }

  function aplicarColor(target: "color" | "background", valor: string): void {
    const rango = rangoGuardado;
    rangoGuardado = null;
    // Con el cursor suelto no hay texto al que colorear, y no es un fallo: el
    // diálogo se abrió con una selección que el diálogo se llevó.
    if (!rango) return;
    conRango(rango, (commandProps) => setTextStyle(target, valor, props.report)(commandProps));
  }

  // --- Fuera del desplegable -----------------------------------------------

  createEffect(() => {
    if (!estiloAbierto()) return;
    const alPincharFuera = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-x='style-bar']")) return;
      setEstiloAbierto(false);
    };
    // En captura y en `document`: el foco está en el editor, así que un manejador
    // dentro de la barra no se enteraría de lo que pasa fuera.
    const alPulsar = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cerrarEstilos();
    };
    document.addEventListener("pointerdown", alPincharFuera, true);
    document.addEventListener("keydown", alPulsar, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", alPincharFuera, true);
      document.removeEventListener("keydown", alPulsar, true);
    });
  });

  return (
    <div
      ref={(element) => (barra = element)}
      class={styles.styleBar}
      data-x="style-bar"
      data-visible={visible() ? "true" : "false"}
      // `fixed` con las coordenadas que da la selección, y no `hidden`: la píldora
      // tiene que seguir **montada** para poder medirse —sin medida se colocaría
      // por la mitad de un ancho inventado—. Lo que se apaga es `visibility`, que sí
      // la deja en su sitio sin dibujarla.
      style={
        posicion()
          ? { top: `${posicion()?.top}px`, left: `${posicion()?.left}px` }
          : undefined
      }
      // El manejador de teclas va en la envoltura y no en la fila: con el teclado el
      // foco está en el desplegable, que es hermano de la fila, y un manejador
      // puesto en la fila no se enteraría de las flechas de quien está recorriendo
      // los estilos.
      onKeyDown={teclasDeEstilo}
    >
      <div
        class={`${styles.toolbar} ${styles.styleBarRow}`}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={EDITOR_BUTTON_LABELS.bar}
      >
        <button
          ref={(element) => (botonEstilo = element)}
          type="button"
          class={styles.styleSelector}
          aria-label={EDITOR_BUTTON_LABELS.style}
          title={EDITOR_BUTTON_LABELS.style}
          aria-haspopup="menu"
          aria-expanded={estiloAbierto()}
          disabled={!props.editor}
          // `detail` es 0 cuando el clic viene del teclado: con el ratón el foco
          // se queda en el editor y no hay nada que mover, y con el teclado sí.
          onClick={(event) =>
            estiloAbierto() ? cerrarEstilos() : abrirEstilos(event.detail === 0)
          }
        >
          <span class={styles.styleSelectorIcon} innerHTML={iconoDeEstilo(activo())} />
          {nombreDeEstilo(activo())}
          <span class={styles.styleCaret} aria-hidden="true">▾</span>
        </button>

        <span class={styles.barSeparator} aria-hidden="true" />

        <For each={marcas}>
          {(marca) => (
            <button
              type="button"
              class={`${styles.tool}${marcaPuesta(marca.name) ? ` ${styles.toolActive}` : ""}`}
              aria-label={marca.label}
              title={marca.label}
              aria-pressed={marcaPuesta(marca.name)}
              disabled={!props.editor}
              onClick={() => {
                const editor = props.editor;
                if (!editor || editor.isDestroyed) return;
                editor.chain().focus().toggleMark(marca.name).run();
              }}
            >
              <span class={marca.clase}>{marca.glifo}</span>
            </button>
          )}
        </For>

        <button
          type="button"
          class={`${styles.tool}${marcaPuesta("link") ? ` ${styles.toolActive}` : ""}`}
          aria-label={EDITOR_BUTTON_LABELS.link}
          title={EDITOR_BUTTON_LABELS.link}
          aria-expanded={enlaceAbierto()}
          disabled={!props.editor}
          onClick={enlaceAbierto() ? cerrarEnlace : abrirEnlace}
        >
          <span class={styles.toolIcon} innerHTML={EDITOR_ICON_LINK} />
        </button>
        <button
          type="button"
          class={styles.tool}
          aria-label={EDITOR_BUTTON_LABELS.textColor}
          title={EDITOR_BUTTON_LABELS.textColor}
          disabled={!props.editor}
          onClick={() => abrirColor(colorInput)}
        >
          <span class={styles.toolIcon} innerHTML={EDITOR_COLOR_ICONS.textColor} />
        </button>
        <button
          type="button"
          class={styles.tool}
          aria-label={EDITOR_BUTTON_LABELS.textBackground}
          title={EDITOR_BUTTON_LABELS.textBackground}
          disabled={!props.editor}
          onClick={() => abrirColor(fondoInput)}
        >
          <span class={styles.toolIcon} innerHTML={EDITOR_COLOR_ICONS.textBackground} />
        </button>

        {/* El enlace se escribe aquí, dentro de la barra. Un `prompt` del sistema en
            Tauri es un diálogo que no aparece, y además se lleva la selección. */}
        <Show when={enlaceAbierto()}>
          <input
            ref={(element) => (enlaceInput = element)}
            class={styles.linkInput}
            type="text"
            inputmode="url"
            placeholder="Pega el enlace…"
            aria-label={EDITOR_BUTTON_LABELS.linkUrl}
            value={enlaceUrl()}
            onInput={(event) => setEnlaceUrl(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                aplicarEnlace();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cerrarEnlace();
              }
            }}
          />
        </Show>

        {/* Los diálogos de color del sistema: no hay forma de pintarlos, así que
            son inputs escondidos a los que se les da una vez y se les escucha. */}
        <input
          ref={(element) => (colorInput = element)}
          class="sr-only"
          type="color"
          tabIndex={-1}
          aria-label={EDITOR_BUTTON_LABELS.textColor}
          onInput={(event) => aplicarColor("color", event.currentTarget.value)}
        />
        <input
          ref={(element) => (fondoInput = element)}
          class="sr-only"
          type="color"
          tabIndex={-1}
          aria-label={EDITOR_BUTTON_LABELS.textBackground}
          onInput={(event) => aplicarColor("background", event.currentTarget.value)}
        />
      </div>

      <Show when={estiloAbierto()}>
        <div
          ref={(element) => (menuEstilo = element)}
          class={`${styles.insertMenu} ${styles.styleMenu}`}
          data-x="style-menu"
          role="menu"
          aria-label={EDITOR_BUTTON_LABELS.styleMenu}
          tabIndex={-1}
        >
          <For each={STYLE_BLOCKS}>
            {(estilo, indice) => (
              <button
                type="button"
                role="menuitem"
                class={`${styles.insertItem}${
                  indice() === estiloResaltado() ? ` ${styles.insertItemActive}` : ""
                }`}
                // El estilo que ya tiene lo seleccionado. Con más de un estilo en
                // la selección no hay uno que poner, y entonces `activo()` es `null`.
                aria-current={estilo.id === activo()}
                onPointerEnter={() => setEstiloResaltado(indice())}
                onClick={() => aplicarEstilo(estilo)}
              >
                <span class={styles.insertItemIcon} innerHTML={estilo.icon} />
                {estilo.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** El rótulo que se ve en el botón: lo que tiene el texto donde está el cursor. */
function nombreDeEstilo(activo: StyleBlockId | null): string {
  const encontrado = STYLE_BLOCKS.find((item) => item.id === activo);
  return encontrado?.label ?? STYLE_BLOCKS[0].label;
}

/** Su dibujo, y el del texto suelto cuando en la selección hay más de un estilo. */
function iconoDeEstilo(activo: StyleBlockId | null): string {
  const encontrado = STYLE_BLOCKS.find((item) => item.id === activo);
  return (encontrado ?? STYLE_BLOCKS[0]).icon;
}

/** El nivel de un título de la barra, o `null` si el estilo no es un título. */
function nivelDeTitulo(id: StyleBlockId): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const encontrado = /^heading([1-6])$/.exec(id);
  return encontrado ? (Number(encontrado[1]) as 1 | 2 | 3 | 4 | 5 | 6) : null;
}

/** El icono del enlace, que en el menú de la `/` no hace falta. */
const EDITOR_ICON_LINK =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M17.5 10.5 11 17a3.5 3.5 0 0 1-5-5l7-7a2.5 2.5 0 0 1 3.5 3.5l-6.5 6.5a1.5 1.5 0 0 1-2-2.2l5.5-5.5" /></svg>`;