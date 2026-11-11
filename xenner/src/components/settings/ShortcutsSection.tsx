import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  comboFromEvent,
  duplicatesOf,
  formatCombo,
  resolveShortcuts,
  type ShortcutActionId,
  type ShortcutOverrides,
} from "../../data/shortcuts.ts";
import { isMacPlatform } from "../../services/platform.ts";
import { setCapturingCombo } from "../../services/shortcuts.ts";
import { ArrowLeftIcon, InfoIcon } from "../ui/Icons.tsx";
import styles from "../../styles/components/ShortcutsSection.module.css";

export interface ShortcutsSectionProps {
  /** Las diferencias con los valores de fábrica, ya saneadas. */
  overrides: ShortcutOverrides;
  /** Asignar una combinación a una acción. */
  onChange(id: ShortcutActionId, combo: string): void;
  /** Volver una acción a su valor por defecto. */
  onReset(id: ShortcutActionId): void;
  /** Volver todo a los valores de fábrica. */
  onResetAll(): void;
}

/**
 * La sección «Atajos» de Ajustes.
 *
 * El modelo es VS Code: cada tecla se pulsa para reasignarla, los duplicados se
 * permiten —el editor no puede saber dónde va a querer el usuario dos acciones
 * distintas— pero se avisan, y volver a los valores de fábrica es una acción por
 * fila o todas de una vez. Lo que se guarda son solo las diferencias con los
 * valores por defecto, así que un atajo nuevo en el catálogo aparece solo.
 *
 * Mientras se graba una combinación, los atajos globales se callan (`isCapturingCombo`):
 * grabar «el mismo atajo que ya existe» no puede disparar la acción como
 * efecto secundario de pulsarla.
 */
export function ShortcutsSection(props: ShortcutsSectionProps) {
  /** La acción que se está grabando, o `null`. */
  const [grabando, setGrabando] = createSignal<ShortcutActionId | null>(null);
  const mac = isMacPlatform();

  const mapa = createMemo(() => resolveShortcuts(props.overrides));
  const repetidas = createMemo(() => duplicatesOf(mapa()));
  /** Todas las combinaciones que están repetidas, planas, para avisar en una línea. */
  const listaRepetidas = createMemo(() => [...repetidas().values()].flat());
  const hayOverrides = createMemo(() => Object.keys(props.overrides).length > 0);

  function empezar(id: ShortcutActionId): void {
    setGrabando(id);
    setCapturingCombo(true);
  }

  function terminar(): void {
    setGrabando(null);
    setCapturingCombo(false);
  }

  // Si el modal se cierra a mitad de una grabación, el flag no puede quedarse
  // puesto: los atajos globales se quedarían mudos para siempre.
  onCleanup(() => setCapturingCombo(false));

  function onComboKeyDown(event: KeyboardEvent): void {
    // Nada de lo que se pulse mientras se graba puede llegar al modal (Escape
    // cierra) ni a los manejadores globales: esta tecla es el ajuste.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      terminar();
      return;
    }
    const combo = comboFromEvent(event);
    if (!combo) return; // Aún solo hay modificadores: se sigue esperando.
    const id = grabando();
    if (id) props.onChange(id, combo);
    terminar();
  }

  return (
    <>
      <div class={styles.notice}>
        <InfoIcon />
        <span>
          Pulsa la tecla de una acción para cambiarla. Los cambios se aplican al
          momento; <strong>Esc</strong> cancela la grabación. Las combinaciones
          repetidas no se impiden, pero se avisan.
        </span>
      </div>

      <Show when={hayOverrides()}>
        <div class={styles.row}>
          <span class={styles.rowLabel}>
            Has cambiado {Object.keys(props.overrides).length}{" "}
            {Object.keys(props.overrides).length === 1 ? "atajo" : "atajos"} respecto
            a los valores de fábrica.
          </span>
          <button type="button" class={styles.resetAll} onClick={() => props.onResetAll()}>
            Volver todos a los valores de fábrica
          </button>
        </div>
      </Show>

      <Show when={listaRepetidas().length > 0}>
        <div class={styles.notice} role="status">
          <InfoIcon />
          <span>
            Hay <strong>combinaciones repetidas</strong>. Las dos acciones
            responden a la misma tecla: en la mayoría de los sitios gana la
            primera que la maneje. Conviene que cada acción tenga la suya.
          </span>
        </div>
      </Show>

      <For each={SHORTCUT_GROUPS}>
        {(grupo) => (
          <div class={`${styles.group}${grupo.id === "nota" ? ` ${styles.groupFirst}` : ""}`}>
            <h2 class={styles.groupTitle}>{grupo.label}</h2>
            <p class={styles.groupHint}>{grupo.hint}</p>
            <For each={SHORTCUT_ACTIONS.filter((accion) => accion.group === grupo.id)}>
              {(accion) => {
                const override = () => props.overrides[accion.id];
                const combo = () => mapa()[accion.id];
                const grabandoEsta = () => grabando() === accion.id;
                const repetida = () => repetidas().has(combo());
                return (
                  <div class={styles.row}>
                    <span class={styles.rowLabel}>{accion.label}</span>
                    <Show when={override() !== undefined}>
                      <button
                        type="button"
                        class={styles.resetRow}
                        aria-label={`Volver «${accion.label}» a su valor de fábrica`}
                        title="Volver a su valor de fábrica"
                        onClick={() => props.onReset(accion.id)}
                      >
                        <ArrowLeftIcon />
                      </button>
                    </Show>
                    <button
                      type="button"
                      class={`${styles.combo}${grabandoEsta() ? ` ${styles.recording}` : ""}${
                        repetida() ? ` ${styles.duplicate}` : ""
                      }`}
                      aria-label={`Atajo para ${accion.label}. Pulsar para cambiarlo.`}
                      aria-pressed={grabandoEsta() ? "true" : undefined}
                      onClick={() => empezar(accion.id)}
                      onKeyDown={onComboKeyDown}
                      onBlur={() => {
                        if (grabandoEsta()) terminar();
                      }}
                    >
                      {grabandoEsta() ? "Pulsa las teclas…" : formatCombo(combo(), mac)}
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </For>
    </>
  );
}
