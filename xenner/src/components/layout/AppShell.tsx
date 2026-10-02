import type { JSX } from "solid-js";

import styles from "../../styles/components/AppShell.module.css";

export interface AppShellProps {
  /** La columna estrecha de secciones, a la izquierda del todo. */
  rail: JSX.Element;
  /** El panel de notas, o `null` si está escondido. */
  sidebar: JSX.Element | null;
  /** El editor: se lleva el espacio que quede, esté el panel o no. */
  editor: JSX.Element;
  /** Modales y avisos: van por encima y no ocupan columna. */
  overlays?: JSX.Element;
}

/**
 * El escritorio: barra de secciones, panel de notas y editor.
 *
 * Cada zona va en su propia ranura y cada ranura dice en qué columna está, en
 * vez de confiar en que el orden de los hijos las va llenando. No es un detalle
 * de estilo: al esconder el panel su elemento desaparece del árbol, la rejilla
 * corre los hijos hacia la izquierda y el editor se quedaba en la columna
 * `auto` —la del panel— con el ancho justo de su contenido. Con las columnas
 * declaradas, esconder el panel solo hace que su columna valga cero y el editor
 * sigue siendo el que se estira.
 *
 * La ranura del editor es una celda de rejilla que lo estira a lo ancho y a lo
 * alto, porque `EditorPane` es una columna flexible con su propio ancho de
 * contenido y no se estira solo. Es lo mismo que hace la vista móvil en
 * `MobileShell`.
 *
 * `data-x="app"` es el vocabulario público de las skins: los nombres de clase de
 * los CSS Modules están hasheados y no sirven para escribir una skin a mano, así
 * que cada superficie tiene un gancho estable. La lista completa y qué es cada
 * cosa está en docs/SKIN_SPEC.md §5 y en la guía de la web.
 */
export function AppShell(props: AppShellProps) {
  return (
    <div class={styles.appShell} data-x="app">
      <div class={styles.rail} data-x="app-rail">
        {props.rail}
      </div>
      <div class={styles.notes} data-x="app-notes">
        {props.sidebar}
      </div>
      <div class={styles.editor} data-x="app-editor">
        {props.editor}
      </div>
      {props.overlays}
    </div>
  );
}