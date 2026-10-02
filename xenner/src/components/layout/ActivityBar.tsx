import type { JSX } from "solid-js";

import styles from "../../styles/components/ActivityBar.module.css";
import { FilesIcon, GearIcon } from "../ui/Icons";

export interface ActivityBarProps {
  /** Si el panel de la lista de notas está abierto: su icono se queda marcado. */
  explorerOpen: boolean;
  /** Mostrar u ocultar la lista de notas. */
  onToggleExplorer(): void;
  /** Abrir Ajustes. */
  onOpenSettings(): void;
}

/**
 * La barra de secciones: una columna estrecha con los destinos de la aplicación,
 * arriba las secciones de contenido y abajo la de configuración.
 *
 * Es la misma idea que la barra de actividades de los editores de código, y
 * resuelve un problema concreto del diseño anterior: los tres botones de la
 * esquina del panel —abrir carpeta, recargar y ajustes— mezclaban la
 * configuración con el contenido y dejaban el engranaje junto a una lista de
 * notas. Aquí las secciones van arriba, la configuración al pie, y el panel
 * queda con su propio encabezado.
 *
 * Los botones llevan el vocabulario público de skins (`data-x="button"`) más
 * `data-x-role="rail"` para poder distinguirlos, y la marca de sección abierta
 * se ve en `data-x-active`. El contrato está en `docs/SKIN_SPEC.md` §5.0.2.
 */
export function ActivityBar(props: ActivityBarProps): JSX.Element {
  return (
    <nav class={styles.activityBar} data-x="activity-bar" aria-label="Secciones de la aplicación">
      <div class={styles.group} data-x="activity-bar-top">
        <div class={styles.slot}>
          <button
            type="button"
            class={`${styles.item} ${props.explorerOpen ? styles.itemActive : ""}`}
            data-x="button"
            data-x-role="rail"
            data-x-action="explorer"
            data-x-active={props.explorerOpen ? "true" : "false"}
            aria-label="Lista de notas"
            aria-pressed={props.explorerOpen}
            title="Lista de notas"
            onClick={props.onToggleExplorer}
          >
            <FilesIcon />
          </button>
          {/* El rótulo se ve al pasar por encima, como el globo de los editores
              de código. Es decoración: el nombre accesible ya está en el botón. */}
          <span class={styles.tip} data-x="activity-tip" aria-hidden="true">
            Lista de notas
          </span>
        </div>
      </div>

      <div class={styles.group} data-x="activity-bar-bottom">
        <div class={styles.slot}>
          <button
            type="button"
            class={styles.item}
            data-x="button"
            data-x-role="rail"
            data-x-action="settings"
            data-x-active="false"
            aria-label="Configuración"
            title="Configuración"
            onClick={props.onOpenSettings}
          >
            <GearIcon />
          </button>
          <span class={styles.tip} data-x="activity-tip" aria-hidden="true">
            Configuración
          </span>
        </div>
      </div>
    </nav>
  );
}