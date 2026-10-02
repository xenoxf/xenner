import { createSignal, For, Show } from "solid-js";

import {
  DEFAULT_SKIN_DRAFT,
  SKIN_COLOR_FIELDS,
  SKIN_PRESETS,
  SKIN_SHADOW_OPTIONS,
} from "../../data/skin";
import { DEFAULT_FONT_VALUE } from "../../data/skin";
import { editorToDraft } from "../../skin/creator";
import { paletaDesdeColor } from "../../skin/palette";
import styles from "../../styles/components/SkinCreator.module.css";
import type { SkinDraft, SkinEditor } from "../../types/skin";
import { FontSelect } from "./FontSelect";

export interface QuickPaletteProps {
  /** El editor del que se leen los valores que hay ahora. */
  value: SkinEditor;
  onChange(draft: SkinDraft): void;
  /** El botón «Elige tu fondo»: la persona elige una imagen de su disco. */
  onElegirFondo?: () => void;
  /** El botón «Quitar el fondo». */
  onQuitarFondo?: () => void;
}

/**
 * El camino corto: paleta,jtempa, sombra y tipografía.
 *
 * Todos estos controles escriben archivos de texto, los mismos que se ven en la
 * pestaña «Cada parte». No hay un almacén de ajustes aparte, y por eso mover un
 * deslizador y luego retocar el archivo a mano no se pisan: es la misma cosa.
 *
 * Lo que este panel **no** puede es de más, y lo enseña: si un valor no cabe en
 * un deslizador, el control no está y el motivo se dice al lado. Quien necesite
 * más tiene la pestaña de al lado, que está a un clic.
 */
export function QuickPalette(props: QuickPaletteProps) {
  const draft = (): SkinDraft => ({ ...editorToDraft(props.value), name: props.value.name });
  const [avanzado, setAvanzado] = createSignal(false);

  function cambiar<K extends keyof SkinDraft>(clave: K, valor: SkinDraft[K]): void {
    props.onChange({ ...draft(), [clave]: valor });
  }

  function setModo(modo: SkinDraft["mode"]): void {
    // Cambiar de claro a oscuro se lleva tu color principal, no lo sustituye:
    // quien pulsa «Oscuro» espera ver SU tema en oscuro, no el de fábrica.
    const accent = draft().accent;
    props.onChange({ ...draft(), mode: modo, ...paletaDesdeColor(modo, accent) });
  }

  function setPrincipal(color: string): void {
    const modo = draft().mode;
    props.onChange({ ...draft(), ...paletaDesdeColor(modo, color) });
  }

  function aplicarPreset(preset: (typeof SKIN_PRESETS)[number]): void {
    props.onChange({ ...preset.draft, name: props.value.name });
  }

  return (
    <div class={styles.quick}>
      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Empezar de una base</strong>
          <button
            type="button"
            class={styles.resetButton}
            onClick={() => props.onChange({ ...DEFAULT_SKIN_DRAFT, name: props.value.name })}
          >
            Restablecer
          </button>
        </div>
        <div class={styles.presets}>
          <For each={SKIN_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class={styles.preset}
                onClick={() => aplicarPreset(preset)}
              >
                <span
                  class={styles.presetSwatch}
                  style={swatchDe(preset.draft)}
                  aria-hidden="true"
                />
                {preset.label}
              </button>
            )}
          </For>
        </div>
      </section>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Paleta</strong>
          <div class={styles.modeSwitch} role="radiogroup" aria-label="Punto de partida: claro u oscuro">
            <button
              type="button"
              role="radio"
              aria-checked={draft().mode === "light"}
              class={draft().mode === "light" ? styles.active : undefined}
              onClick={() => setModo("light")}
            >
              Claro
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft().mode === "dark"}
              class={draft().mode === "dark" ? styles.active : undefined}
              onClick={() => setModo("dark")}
            >
              Oscuro
            </button>
          </div>
        </div>
        <div class={styles.colorGrid}>
          <label class={styles.colorField} for="skin-principal">
            <span>Color principal</span>
            <span class={styles.colorControl}>
              <input
                id="skin-principal"
                class={styles.colorInput}
                type="color"
                value={paraSelector(draft().accent, "accent")}
                onInput={(evento) => setPrincipal(evento.currentTarget.value)}
              />
              <output>{draft().accent}</output>
            </span>
          </label>
          <For each={SKIN_COLOR_FIELDS}>
            {(campo) => (
              <label class={styles.colorField} for={`skin-${campo.key}`}>
                <span>{campo.label}</span>
                <span class={styles.colorControl}>
                  <input
                    id={`skin-${campo.key}`}
                    class={styles.colorInput}
                    type="color"
                    value={paraSelector(draft()[campo.key], campo.key)}
                    onInput={(evento) => cambiar(campo.key, evento.currentTarget.value)}
                  />
                  <output>{draft()[campo.key]}</output>
                </span>
              </label>
            )}
          </For>
        </div>
        <p class={styles.quickNote}>
          «Color principal» rellena los nueve de golpe. Cada uno se puede
          afinar a mano debajo, y para una imagen de fondo o un degradado usa
          «Cada parte».
        </p>
      </section>

      <Show when={props.onElegirFondo}>
        <section class={styles.creatorBlock}>
          <div class={styles.blockHeader}>
            <strong>Fondo</strong>
          </div>
          <div class={styles.controlsGrid}>
            <button type="button" class={styles.resetButton} onClick={() => props.onElegirFondo?.()}>
              Elegir una imagen…
            </button>
            <Show when={props.onQuitarFondo}>
              <button type="button" class={styles.resetButton} onClick={() => props.onQuitarFondo?.()}>
                Quitar la imagen
              </button>
            </Show>
          </div>
          <p class={styles.quickNote}>
            La imagen se guarda dentro del tema: puedes moverlo o pasarlo a otro
            equipo y sigue funcionando.
          </p>
        </section>
      </Show>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Acabado</strong>
        </div>
        <div class={styles.controlsGrid}>
          <label class={styles.rangeControl} for="skin-radius">
            <span>
              Redondeo <output>{draft().radius}px</output>
            </span>
            <input
              id="skin-radius"
              type="range"
              min="0"
              max="40"
              step="1"
              value={draft().radius}
              onInput={(evento) => cambiar("radius", Number(evento.currentTarget.value))}
            />
          </label>
          <label class={styles.rangeControl} for="skin-blur">
            <span>
              Difuminado <output>{draft().blur}px</output>
            </span>
            <input
              id="skin-blur"
              type="range"
              min="0"
              max="32"
              step="1"
              value={draft().blur}
              onInput={(evento) => cambiar("blur", Number(evento.currentTarget.value))}
            />
          </label>
          <label class={styles.rangeControl} for="skin-border-width">
            <span>
              Grosor del borde <output>{draft().borderWidth}px</output>
            </span>
            <input
              id="skin-border-width"
              type="range"
              min="0"
              max="3"
              step="1"
              value={draft().borderWidth}
              onInput={(evento) => cambiar("borderWidth", Number(evento.currentTarget.value))}
            />
          </label>
          <label class={styles.selectControl} for="skin-shadow">
            <span>Sombra</span>
            <select
              id="skin-shadow"
              value={draft().shadow}
              onChange={(evento) =>
                cambiar("shadow", evento.currentTarget.value as SkinDraft["shadow"])
              }
            >
              <For each={SKIN_SHADOW_OPTIONS}>
                {(opcion) => <option value={opcion.value}>{opcion.label}</option>}
              </For>
            </select>
          </label>
          <label class={styles.selectControl} for="skin-font">
            <span>Tipografía de la interfaz</span>
            <FontSelect
              id="skin-font"
              value={draft().font || DEFAULT_FONT_VALUE}
              onChange={(font) => cambiar("font", font)}
            />
          </label>
        </div>
        <Show when={avanzado()}>
          <p class={styles.quickNote}>
            Esto se aplica a toda la ventana. En <strong>Cada parte</strong> se cambia
            una zona y se deja el resto como esté.
          </p>
        </Show>
        <button
          type="button"
          class={styles.linkish}
          aria-expanded={avanzado()}
          onClick={() => setAvanzado(!avanzado())}
        >
          {avanzado() ? "Ocultar el aviso" : "¿Y si quiero cambiarlo solo en una parte?"}
        </button>
      </section>
    </div>
  );
}

/**
 * Un `<input type="color">` solo entiende `#rgb` o `#rrggbb`.
 *
 * Los temas usan `rgba(...)` y `#rrggbbaa` todo el rato —el cristal y los fondos
 * de foto—, y esos valores se leen a diario en el panel de «Cada parte». Si el
 * selector recibiera uno, se pondría en negro y el deslizador mentiría. Se
 * convierte a opaco y se avisa con el texto de al lado, que sí enseña el valor
 * entero.
 */
function paraSelector(valor: string, _clave: string): string {
  const v = valor.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return v;
  const hex8 = /^#([0-9a-f]{6})[0-9a-f]{2}$/i.exec(v);
  if (hex8) return `#${hex8[1]}`;
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (rgba) {
    const parte = [rgba[1], rgba[2], rgba[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("");
    return `#${parte}`;
  }
  return "#000000";
}

/** Los colores de la miniatura de un preset, como variables para el CSS. */
function swatchDe(draft: SkinDraft): string {
  return [
    `--a:${draft.background}`,
    `--b:${draft.surface}`,
    `--c:${draft.panel}`,
    `--d:${draft.accent}`,
  ].join(";");
}
