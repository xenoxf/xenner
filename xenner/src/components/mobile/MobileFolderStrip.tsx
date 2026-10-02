import { For } from "solid-js";

import { FolderIcon } from "../ui/Icons";
import styles from "../../styles/components/MobileFolderStrip.module.css";

/**
 * Una carpeta de la biblioteca. La etiqueta es su ruta relativa, que es lo
 * único que distingue dos carpetas con el mismo nombre en sitios distintos.
 */
export interface MobileFolder {
  path: string;
}

export interface MobileFolderStripProps {
  /** Carpetas ya ordenadas por etiqueta. */
  folders: readonly MobileFolder[];
  /** Ruta de la carpeta que está filtrando, o `null` si no filtra. */
  selected: string | null;
  /** Recibe `null` para quitar el filtro. */
  onSelect(path: string | null): void;
}

/**
 * Tira horizontal con todas las carpetas de la biblioteca, a cualquier nivel.
 *
 * Como es plana y las carpetas están anidadas, la etiqueta de cada chip es su
 * ruta completa dentro de la biblioteca: `Trabajo` y `Trabajo/2026` conviven, y
 * dos `2026` en carpetas distintas se distinguen solos. No es navegación: no hay
 * migaja ni pantalla de carpeta, tocar un chip filtra la lista de notas por las
 * que tiene directamente dentro y volver a tocarlo quita el filtro.
 *
 * El scroller no lleva ningún input dentro y limita el gesto a `pan-x`, para que
 * el desplazamiento vertical de la lista no se lo quede al deslizar los chips.
 */
export function MobileFolderStrip(props: MobileFolderStripProps) {
  return (
    <div
      class={styles.strip}
      data-x="mobile-folder-strip"
      data-x-mobile="folder-strip"
    >
      <ul class={styles.chips} aria-label="Carpetas de la biblioteca">
        <For each={props.folders}>
          {(folder) => {
            const active = () => props.selected === folder.path;
            return (
              <li class={styles.item}>
                <button
                  type="button"
                  class={`${styles.chip} ${active() ? styles.chipActive : ""}`}
                  data-x="mobile-folder-chip"
                  data-x-mobile="folder-chip"
                  data-selected={active() ? "true" : undefined}
                  aria-pressed={active()}
                  title={folder.path}
                  onClick={() => props.onSelect(active() ? null : folder.path)}
                >
                  <FolderIcon />
                  <span class={styles.label}>{folder.path}</span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}