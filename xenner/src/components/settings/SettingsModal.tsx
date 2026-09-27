import { createSignal, For, onMount, Show } from "solid-js";

import { DEFAULT_APPEARANCE, isDefaultAppearance } from "../../data/appearance";
import { SETTINGS_SECTIONS, THEME_MODES, type SettingsNavigationItem, type SettingsSection } from "../../data/settings";
import styles from "../../styles/components/SettingsModal.module.css";
import type { Appearance } from "../../types/appearance";
import type { SkinInfo } from "../../types/skin";
import { CheckIcon, CloseIcon, InfoIcon } from "../ui/Icons";
import { FontSelect } from "./FontSelect";
import { IconButton } from "../ui/IconButton";
import { ModalBackdrop } from "../ui/ModalBackdrop";
import { SkinCreator } from "./SkinCreator";

export interface SettingsModalProps {
  skins: SkinInfo[];
  activeSkin: string;
  loading: boolean;
  appearance: Appearance;
  onAppearanceChange(appearance: Appearance): void;
  onSkinChange(id: string): void;
  onSkinCreated(skin: SkinInfo): void;
  onClose(): void;
}

interface AppearanceField {
  key: "editorSize" | "lineHeight" | "contentWidth";
  label: string;
  /** Explica para qué sirve, no repite la etiqueta. */
  hint: string;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
}

const APPEARANCE_FIELDS: readonly AppearanceField[] = [
  {
    key: "editorSize",
    label: "Tamaño del texto",
    hint: "El cuerpo de tus notas",
    min: 12,
    max: 24,
    step: 1,
    format: (value) => `${value} px`,
  },
  {
    key: "lineHeight",
    label: "Interlineado",
    hint: "Cuánto aire hay entre líneas",
    min: 1.2,
    max: 2.2,
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
  {
    key: "contentWidth",
    label: "Ancho de lectura",
    hint: "Cuántas letras caben en cada línea",
    min: 560,
    max: 1200,
    step: 20,
    format: (value) => `${value} px`,
  },
];

export function SettingsModal(props: SettingsModalProps) {
  const [section, setSection] = createSignal<SettingsSection>("appearance");
  let dialog: HTMLDivElement | undefined;

  onMount(() => queueMicrotask(() => dialog?.focus()));

  const current = (): SettingsNavigationItem => {
    return SETTINGS_SECTIONS.find((item) => item.id === section()) ?? SETTINGS_SECTIONS[0];
  };

  const fieldValue = (field: AppearanceField): number => props.appearance[field.key];

  const setField = (field: AppearanceField, value: number): void => {
    props.onAppearanceChange({ ...props.appearance, [field.key]: value });
  };

  // Nombre del tema activo, para poder nombrarlo en vez de decir "una skin".
  const activeSkinName = (): string | null => {
    if (props.activeSkin === "") return null;
    return props.skins.find((skin) => skin.id === props.activeSkin)?.name ?? null;
  };

  // Un tema propio trae su propia paleta, así que el modo claro/oscuro solo
  // tiene sentido con el tema de Xenner.
  const themeModeLocked = (): boolean => props.activeSkin !== "";

  const themeModeHint = (): string => {
    if (!themeModeLocked()) return "Sigue a tu sistema o fija uno";
    const name = activeSkinName();
    return name ? `Cambia con el tema «${name}»` : "Cambia con el tema elegido";
  };

  const canReset = (): boolean =>
    section() === "appearance" && !isDefaultAppearance(props.appearance);

  return (
    <ModalBackdrop onBackdropPointerDown={props.onClose}>
      <div
        ref={(element) => {
          dialog = element;
        }}
        class={styles.modal}
        data-x="modal"
        data-x-modal="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <nav class={styles.nav} aria-label="Secciones de configuración">
          <div class={styles.brand}>Configuración</div>
          <For each={SETTINGS_SECTIONS}>
            {(item) => (
              <button
                type="button"
                class={`${styles.section} ${section() === item.id ? styles.sectionActive : ""}`}
                aria-current={section() === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            )}
          </For>
          <p class={styles.navFooter}>Los cambios se aplican al instante.</p>
        </nav>

        <section class={styles.content}>
          <header class={styles.header}>
            <h2 id="settings-title">{current().label}</h2>
            <div class={styles.headerActions}>
              <Show when={canReset()}>
                <button
                  type="button"
                  class={styles.reset}
                  onClick={() => props.onAppearanceChange({ ...DEFAULT_APPEARANCE })}
                >
                  Restablecer
                </button>
              </Show>
              <IconButton aria-label="Cerrar configuración" onClick={props.onClose}>
                <CloseIcon />
              </IconButton>
            </div>
          </header>

          <div class={styles.scroll}>
            <div class={styles.body}>
              <Show when={section() === "appearance"}>
                <div class={styles.group}>
                  <h3 class={styles.groupTitle}>Modo de color</h3>
                  <p class={styles.groupHint}>
                    Elige si Xenner se ve claro, oscuro o como el sistema que uses.
                  </p>
                  <div class={styles.card}>
                    <div class={styles.row}>
                      <div class={styles.rowLabel}>
                        <strong>Tema</strong>
                        <small>{themeModeHint()}</small>
                      </div>
                      <div class={styles.rowControl}>
                        <div
                          class={styles.segmented}
                          role="radiogroup"
                          aria-label="Modo de color"
                          aria-disabled={themeModeLocked() ? "true" : undefined}
                        >
                          <For each={THEME_MODES}>
                            {(mode) => (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={props.appearance.mode === mode.id}
                                disabled={themeModeLocked()}
                                onClick={() =>
                                  props.onAppearanceChange({ ...props.appearance, mode: mode.id })
                                }
                              >
                                {mode.label}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Show when={themeModeLocked()}>
                    <div class={styles.notice}>
                      <InfoIcon />
                      <span>
                        Para poder alternar entre claro y oscuro, vuelve al tema{" "}
                        <strong>Xenner</strong> en la sección Temas.
                      </span>
                    </div>
                  </Show>
                </div>

                <div class={styles.group}>
                  <h3 class={styles.groupTitle}>Tipografías</h3>
                  <p class={styles.groupHint}>
                    La de la interfaz afecta a botones y menús; la del editor, al texto de tus
                    notas.
                  </p>
                  <p class={styles.footnote}>
                    Xenner no descarga tipografías: se aplican las que ya tengas instaladas en
                    este equipo. Cada opción indica de qué se sustituye si falta.
                  </p>
                  <div class={styles.card}>
                    <div class={styles.row}>
                      <label class={styles.rowLabel} for="ui-font">
                        <strong>Interfaz</strong>
                        <small>Botones, menús y barras</small>
                      </label>
                      <div class={styles.rowControl}>
                        <FontSelect
                          id="ui-font"
                          value={props.appearance.uiFont}
                          onChange={(uiFont) =>
                            props.onAppearanceChange({ ...props.appearance, uiFont })
                          }
                        />
                      </div>
                    </div>
                    <div class={styles.row}>
                      <label class={styles.rowLabel} for="editor-font">
                        <strong>Editor</strong>
                        <small>El texto de tus notas</small>
                      </label>
                      <div class={styles.rowControl}>
                        <FontSelect
                          id="editor-font"
                          value={props.appearance.editorFont}
                          onChange={(editorFont) =>
                            props.onAppearanceChange({ ...props.appearance, editorFont })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div class={styles.group}>
                  <h3 class={styles.groupTitle}>Lectura</h3>
                  <p class={styles.groupHint}>Solo afecta a la nota que tengas abierta.</p>
                  <div class={styles.card}>
                    <For each={APPEARANCE_FIELDS}>
                      {(field) => (
                        <div class={styles.row}>
                          <label class={styles.rowLabel} for={`appearance-${field.key}`}>
                            <strong>{field.label}</strong>
                            <small>{field.hint}</small>
                          </label>
                          <div class={styles.rowControl}>
                            <input
                              id={`appearance-${field.key}`}
                              class={styles.range}
                              type="range"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={fieldValue(field)}
                              onInput={(event) =>
                                setField(field, Number(event.currentTarget.value))
                              }
                            />
                            <output>{field.format(fieldValue(field))}</output>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={section() === "skins"}>
                <div class={styles.group}>
                  <h3 class={styles.groupTitle}>Elige un tema</h3>
                  <p class={styles.groupHint}>
                    Cada tema cambia los colores y las formas de toda la aplicación. Se aplica
                    al momento.
                  </p>
                  <ul class={styles.skinList}>
                    <li>
                      <button
                        type="button"
                        class={`${styles.skinCard} ${props.activeSkin === "" ? styles.skinCardActive : ""}`}
                        disabled={props.loading}
                        onClick={() => props.onSkinChange("")}
                      >
                        <span class={styles.skinCardCopy}>
                          <strong>Xenner</strong>
                          <small>El original · claro y oscuro</small>
                        </span>
                        <Show when={props.activeSkin === ""}>
                          <span class={styles.check}>
                            <CheckIcon />
                          </span>
                        </Show>
                      </button>
                    </li>
                    <For each={props.skins}>
                      {(skin) => (
                        <li>
                          <button
                            type="button"
                            class={`${styles.skinCard} ${props.activeSkin === skin.id ? styles.skinCardActive : ""}`}
                            disabled={props.loading}
                            onClick={() => props.onSkinChange(skin.id)}
                          >
                            <span class={styles.skinCardCopy}>
                              <strong>{skin.name}</strong>
                              <small>
                                {skin.origin === "user"
                                  ? "Creado por ti"
                                  : skin.author
                                    ? `Incluido · ${skin.author}`
                                    : "Incluido"}
                              </small>
                            </span>
                            <Show when={props.activeSkin === skin.id}>
                              <span class={styles.check}>
                                <CheckIcon />
                              </span>
                            </Show>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={section() === "create"}>
                <div class={styles.group}>
                  <h3 class={styles.groupTitle}>Crea un tema</h3>
                  <p class={styles.groupHint}>
                    Empieza de una paleta, ajusta lo que quieras y guárdalo con un nombre. Se
                    añade a la lista de temas para que puedas usarlo cuando quieras.
                  </p>
                  <div class={styles.embed}>
                    <SkinCreator onCreated={props.onSkinCreated} />
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </section>
      </div>
    </ModalBackdrop>
  );
}
