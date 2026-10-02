import { Show } from "solid-js";

import { CloseIcon, SearchIcon } from "../ui/Icons";
import styles from "../../styles/components/MobileSearchBar.module.css";

export interface MobileSearchBarProps {
  /** Texto del buscador; lo escribe el padre para poder filtrar las notas. */
  value: string;
  /** Cuántas notas han aparecido con lo escrito, para leerlo en voz alta. */
  resultCount?: number;
  onInput(value: string): void;
  onClear(): void;
}

/**
 * Buscador de la lista: lupa a la izquierda, `type="search"` para que el
 * teclado móvil traiga la lupa y un botón de limpiar cuando hay algo escrito.
 *
 * Busca por nombre en toda la biblioteca, así que ignora el filtro de carpeta:
 * es lo que hace útil tener un buscador cuando hay muchas carpetas.
 */
export function MobileSearchBar(props: MobileSearchBarProps) {
  const resultLabel = () => {
    if (!props.value.trim()) return "";
    const count = props.resultCount ?? 0;
    return `${count} ${count === 1 ? "nota encontrada" : "notas encontradas"}`;
  };

  return (
    <section class={styles.search} data-x="mobile-search" data-x-mobile="search">
      <h2 class={styles.title} id="mobile-search-title">
        Notas
      </h2>
      <div class={styles.field} data-x="input">
        <span class={styles.icon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          class={styles.input}
          type="search"
          value={props.value}
          placeholder="Buscar…"
          aria-label="Buscar notas por nombre"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <Show when={props.value}>
          <button
            type="button"
            class={styles.clear}
            aria-label="Borrar la búsqueda"
            title="Borrar la búsqueda"
            onClick={props.onClear}
          >
            <CloseIcon />
          </button>
        </Show>
      </div>
      <span class="sr-only" role="status" aria-live="polite">
        {resultLabel()}
      </span>
    </section>
  );
}