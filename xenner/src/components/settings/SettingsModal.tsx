import { createSignal, For, onMount, Show } from "solid-js";

import { FONT_OPTIONS } from "../../data/appearance";
import { SETTINGS_SECTIONS, THEME_MODES, type SettingsSection } from "../../data/settings";
import styles from "../../styles/components/SettingsModal.module.css";
import type { Appearance } from "../../types/appearance";
import type { SkinInfo } from "../../types/skin";
import { IconButton } from "../ui/IconButton";
import { CloseIcon } from "../ui/Icons";
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

export function SettingsModal(props: SettingsModalProps) {
  const [section, setSection] = createSignal<SettingsSection>("appearance");
  let dialog: HTMLDivElement | undefined;

  onMount(() => queueMicrotask(() => dialog?.focus()));

  return (
    <ModalBackdrop onBackdropPointerDown={props.onClose}>
      <div
        ref={(element) => {
          dialog = element;
        }}
        class={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <aside class={styles.nav} aria-label="Configuración">
          <div class={styles.brand}>
            <div>
              <strong>Configuración</strong>
            </div>
          </div>
          <nav class={styles.sections}>
            <For each={SETTINGS_SECTIONS}>
              {(item) => (
                <button
                  type="button"
                  class={section() === item.id ? styles.activeSection : undefined}
                  aria-current={section() === item.id ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <strong>{item.label}</strong>
                </button>
              )}
            </For>
          </nav>
        </aside>
        <section class={styles.content}>
          <header class={styles.header}>
            <div>
              <p>Preferencias</p>
              <h2 id="settings-title">
                {SETTINGS_SECTIONS.find((item) => item.id === section())?.label}
              </h2>
            </div>
            <IconButton aria-label="Cerrar configuración" onClick={props.onClose}>
              <CloseIcon />
            </IconButton>
          </header>

          <Show when={section() === "appearance"}>
            <div class={`${styles.sectionContent} ${styles.appearance}`}>
              <Show
                when={props.activeSkin === ""}
                fallback={
                  <div class={styles.notice}>
                    El modo claro/oscuro pertenece a la skin base embebida. Actívala
                    para alternar entre ambos modos.
                  </div>
                }
              >
                <div class={styles.settingGroup}>
                  <div class={styles.settingLabel}>
                    <strong>Modo de color</strong>
                  </div>
                  <div class={styles.themeSwitcher} role="radiogroup" aria-label="Modo de color">
                    <For each={THEME_MODES}>
                      {(mode) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={props.appearance.mode === mode.id}
                          class={props.appearance.mode === mode.id ? styles.active : undefined}
                          onClick={() => props.onAppearanceChange({ ...props.appearance, mode: mode.id })}
                        >
                          <strong>{mode.label}</strong>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
              <div class={styles.settingGroup}>
                <label class={styles.settingLabel} for="ui-font">
                  <strong>Tipografía de la interfaz</strong>
                </label>
                <select
                  id="ui-font"
                  class={`${styles.input} ${styles.settingSelect}`}
                  value={props.appearance.uiFont}
                  onChange={(event) =>
                    props.onAppearanceChange({ ...props.appearance, uiFont: event.currentTarget.value })
                  }
                >
                  <For each={FONT_OPTIONS}>
                    {(font) => <option value={font.value}>{font.label}</option>}
                  </For>
                </select>
              </div>
              <div class={styles.settingGroup}>
                <label class={styles.settingLabel} for="editor-font">
                  <strong>Tipografía del editor</strong>
                </label>
                <select
                  id="editor-font"
                  class={`${styles.input} ${styles.settingSelect}`}
                  value={props.appearance.editorFont}
                  onChange={(event) =>
                    props.onAppearanceChange({ ...props.appearance, editorFont: event.currentTarget.value })
                  }
                >
                  <For each={FONT_OPTIONS}>
                    {(font) => <option value={font.value}>{font.label}</option>}
                  </For>
                </select>
              </div>
              <div class={`${styles.settingGroup} ${styles.settingRange}`}>
                <label class={styles.settingLabel} for="editor-size">
                  <strong>Tamaño del texto</strong>
                  <output>{props.appearance.editorSize}px</output>
                </label>
                <input
                  id="editor-size"
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={props.appearance.editorSize}
                  onInput={(event) =>
                    props.onAppearanceChange({ ...props.appearance, editorSize: Number(event.currentTarget.value) })
                  }
                />
              </div>
              <div class={`${styles.settingGroup} ${styles.settingRange}`}>
                <label class={styles.settingLabel} for="line-height">
                  <strong>Interlineado</strong>
                  <output>{props.appearance.lineHeight.toFixed(2)}</output>
                </label>
                <input
                  id="line-height"
                  type="range"
                  min="1.2"
                  max="2.2"
                  step="0.05"
                  value={props.appearance.lineHeight}
                  onInput={(event) =>
                    props.onAppearanceChange({ ...props.appearance, lineHeight: Number(event.currentTarget.value) })
                  }
                />
              </div>
              <div class={`${styles.settingGroup} ${styles.settingRange}`}>
                <label class={styles.settingLabel} for="content-width">
                  <strong>Ancho de lectura</strong>
                  <output>{props.appearance.contentWidth}px</output>
                </label>
                <input
                  id="content-width"
                  type="range"
                  min="560"
                  max="1200"
                  step="20"
                  value={props.appearance.contentWidth}
                  onInput={(event) =>
                    props.onAppearanceChange({ ...props.appearance, contentWidth: Number(event.currentTarget.value) })
                  }
                />
              </div>
            </div>
          </Show>

          <Show when={section() === "skins"}>
            <div class={styles.sectionContent}>
              <div class={styles.sectionHeading}>
                <div>
                  <h3>Skins instaladas</h3>
                </div>
              </div>
              <div class={styles.skinList}>
                <button
                  type="button"
                  class={`${styles.skinCard} ${props.activeSkin === "" ? styles.active : ""}`}
                  disabled={props.loading}
                  onClick={() => props.onSkinChange("")}
                >
                  <span class={`${styles.skinPreview} ${styles.defaultPreview}`} />
                  <span>
                    <strong>Xenner (embebida)</strong>
                    <small>Claro y oscuro</small>
                  </span>
                </button>
                <For each={props.skins}>
                  {(skin) => (
                    <button
                      type="button"
                      class={`${styles.skinCard} ${props.activeSkin === skin.id ? styles.active : ""}`}
                      disabled={props.loading}
                      onClick={() => props.onSkinChange(skin.id)}
                    >
                      <span class={styles.skinPreview} />
                      <span>
                        <strong>{skin.name}</strong>
                        <small>{skin.author || "Skin del sistema"}</small>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={section() === "create"}>
            <div class={`${styles.sectionContent} ${styles.creatorSettings}`}>
              <div class={styles.sectionHeading}>
                <div>
                  <h3>Creador de skins</h3>
                </div>
              </div>
              <SkinCreator onCreated={props.onSkinCreated} />
            </div>
          </Show>
        </section>
      </div>
    </ModalBackdrop>
  );
}
