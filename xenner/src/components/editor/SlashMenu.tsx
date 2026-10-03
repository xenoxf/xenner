import { For } from "solid-js";

import type { MenuGroup, MenuItem } from "../../editor/menu-content.ts";
import { itemKey } from "./InsertMenu.tsx";
import styles from "../../styles/components/NoteEditor.module.css";

export interface SlashMenuProps {
  /** Los grupos ya filtrados por lo que se ha escrito detrás de la `/`. */
  groups: readonly MenuGroup[];
  placement: { left: number; top: number };
  /** Qué entrada está resaltada; se mueve con las flechas. */
  activeKey: string | null;
  onHover(item: MenuItem): void;
  onChoose(item: MenuItem): void;
}

/**
 * El menú de la `/`.
 *
 * El editor nunca pierde el foco mientras está abierto: se escribe detrás de la
 * `/` y el menú se va filtrando solo. Por eso las flechas, el Intro y el Escape
 * los escucha quien lo ha abierto —el editor— en `NoteEditor`, en captura, en
 * vez de poner un manejador dentro de esta caja: un menú al que hay que llegar
 * con el ratón no es un menú.
 */
export function SlashMenu(props: SlashMenuProps) {
  return (
    <div
      class={styles.slashMenu}
      data-x="slash-menu"
      role="menu"
      aria-label="Insertar un bloque"
      tabIndex={-1}
      style={{ left: `${props.placement.left}px`, top: `${props.placement.top}px` }}
    >
      <For
        each={props.groups}
        fallback={<p class={styles.slashEmpty}>Nada coincide con lo escrito</p>}
      >
        {(group) => (
          <section class={styles.slashGroup} role="group" aria-label={group.group}>
            <p class={styles.slashGroupTitle}>{group.group}</p>
            <div class={styles.slashGroupItems}>
              <For each={group.items}>
                {(item) => (
                  <button
                    type="button"
                    role="menuitem"
                    class={`${styles.slashItem}${
                      props.activeKey === itemKey(item) ? ` ${styles.slashItemActive}` : ""
                    }`}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerEnter={() => props.onHover(item)}
                    onClick={() => props.onChoose(item)}
                  >
                    <span class={styles.slashItemIcon} innerHTML={item.icon} />
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
