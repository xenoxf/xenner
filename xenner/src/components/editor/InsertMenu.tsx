import { For } from "solid-js";

import type { MenuGroup, MenuItem } from "../../editor/menu-content.ts";
import styles from "../../styles/components/NoteEditor.module.css";

export interface InsertMenuProps {
  /** El contenido del menú, tal cual lo da el motor: datos y nada más. */
  groups: readonly MenuGroup[];
  /**
   * Dónde sale el menú, en coordenadas del contenedor del editor.
   *
   * Con `bottom` el menú se ancla por el borde de abajo —lo usa el dock, que
   * vive pegado al borde inferior de la ventana: su `+` abre el menú por
   * encima del propio dock. Sin `bottom` se ancla por `top`, como siempre.
   */
  placement: { left: number; top?: number; bottom?: number };
  /** Qué entrada está resaltada. Se mueve con las flechas sin llegar a abrirla. */
  activeKey: string | null;
  /** El tipo que ya tiene el bloque del cursor, para marcarlo en el menú. */
  activeBlock: string | null;
  onHover(item: MenuItem): void;
  onChoose(item: MenuItem): void;
  onClose(): void;
}

/**
 * El menú de insertar: todo lo que se puede poner en la nota, no solo tipos de
 * texto.
 *
 * Lo abren dos puertas, con el mismo contenido: el asa del bloque —que lo abre
 * pegado al asa, que es justo lo que se ha pulsado, y aplica en la línea
 * siguiente— y el «+» del dock —que lo abre por encima del propio dock,
 * centrado bajo el botón, y aplica en el sitio del cursor—. En los dos casos
 * se ancla a la posición **real** del botón que se ha pulsado, en vez de medir
 * el cursor: leer su rectángulo es la única forma de no calcular mal dónde lo
 * va a poner quien está escribiendo.
 *
 * Los botones llevan `preventDefault` en `pointerdown` porque viven fuera del
 * `contenteditable`: sin eso el botón se lleva el foco al pulsarlo y el editor
 * pierde la selección justo antes de aplicar el cambio.
 */
export function InsertMenu(props: InsertMenuProps) {
  return (
    <div
      class={styles.insertMenu}
      data-x="insert-menu"
      role="menu"
      aria-label="Insertar en la línea siguiente"
      tabIndex={-1}
      style={
        props.placement.bottom !== undefined
          ? { left: `${props.placement.left}px`, bottom: `${props.placement.bottom}px` }
          : { left: `${props.placement.left}px`, top: `${props.placement.top ?? 0}px` }
      }
    >
      <For each={props.groups}>
        {(group) => (
          <section class={styles.insertGroup} role="group" aria-label={group.group}>
            <p class={styles.insertGroupTitle}>{group.group}</p>
            <div class={styles.insertGroupItems}>
              <For each={group.items}>
                {(item) => (
                  <button
                    type="button"
                    role="menuitem"
                    class={`${styles.insertItem}${
                      props.activeKey === itemKey(item) ? ` ${styles.insertItemActive}` : ""
                    }`}
                    // El tipo que ya tiene la línea. Solo uno: con más de un tipo
                    // en la selección no hay un único tipo que poner.
                    aria-current={item.kind === "block" && props.activeBlock === item.id}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerEnter={() => props.onHover(item)}
                    onClick={() => props.onChoose(item)}
                  >
                    <span class={styles.insertItemIcon} innerHTML={item.icon} />
                    {item.label}
                  </button>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

/**
 * Una clave estable por entrada, para poder resaltarla con el teclado.
 *
 * El tipo de bloque va en su `id` y el resto se distingue por su `kind`, que solo
 * se repite en los tipos. Con eso no hace falta llevar la cuenta de índices entre
 * dos archivos, que es donde se desincroniza un menú.
 */
export function itemKey(item: MenuItem): string {
  return item.kind === "block" ? (item.id ?? "block") : item.kind;
}
