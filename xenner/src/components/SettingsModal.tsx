import { createSignal, For, onMount, Show } from "solid-js";

import { CloseIcon } from "./Icons";
import { SkinCreator } from "./SkinCreator";
import type { SkinInfo } from "../skin/loader";
import { FONT_OPTIONS, type Appearance, type ThemeMode } from "../settings/appearance";

type SettingsSection = "appearance" | "skins" | "create";

interface SettingsModalProps {
  skins: SkinInfo[];
  activeSkin: string;
  loading: boolean;
  appearance: Appearance;
  onAppearanceChange(appearance: Appearance): void;
  onSkinChange(id: string): void;
  onSkinCreated(skin: SkinInfo): void;
  onClose(): void;
}

const themeModes: { id: ThemeMode; label: string; description: string }[] = [
  { id: "system", label: "Sistema", description: "Sigue el sistema" },
  { id: "light", label: "Claro", description: "Superficies neutras" },
  { id: "dark", label: "Oscuro", description: "Superficies neutras" },
];

const sections: { id: SettingsSection; label: string; description: string }[] = [
  { id: "appearance", label: "Apariencia", description: "Tema y tipografía" },
  { id: "skins", label: "Skins", description: "Sistema y personales" },
  { id: "create", label: "Crear skin", description: "Diseñar un estilo" },
];

export function SettingsModal(props: SettingsModalProps) {
  const [section, setSection] = createSignal<SettingsSection>("appearance");
  let dialog: HTMLDivElement | undefined;

  onMount(() => queueMicrotask(() => dialog?.focus()));

  return (
    <div
      class="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={(element) => {
          dialog = element;
        }}
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <aside class="settings-nav" aria-label="Configuración">
          <div class="settings-brand">
            <div>
              <strong>Configuración</strong>
              <span>xenner</span>
            </div>
          </div>
          <nav class="settings-sections">
            <For each={sections}>
              {(item) => (
                <button
                  type="button"
                  classList={{ active: section() === item.id }}
                  aria-current={section() === item.id ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              )}
            </For>
          </nav>
          <p class="settings-version">Editor de archivos Markdown</p>
        </aside>
        <section class="settings-content">
          <header class="settings-header">
            <div>
              <p>Preferencias</p>
              <h2 id="settings-title">
                {sections.find((item) => item.id === section())?.label}
              </h2>
            </div>
            <button type="button" class="icon-button" aria-label="Cerrar configuración" onClick={props.onClose}>
              <CloseIcon />
            </button>
          </header>

          <Show when={section() === "appearance"}>
            <div class="settings-section-content appearance-settings">
              <div class="settings-section-heading">
                <div>
                  <h3>Apariencia visual</h3>
                  <p>Ajusta la interfaz y el ritmo de lectura sin cambiar tus archivos.</p>
                </div>
              </div>
              <Show
                when={props.activeSkin === ""}
                fallback={
                  <div class="settings-notice">
                    El modo claro/oscuro pertenece a la skin base embebida. Actívala
                    para alternar entre ambos modos.
                  </div>
                }
              >
                <div class="setting-group">
                  <div class="setting-label">
                    <strong>Modo de color</strong>
                    <span>La skin seleccionada puede cambiarlo sin tocar el contenido.</span>
                  </div>
                  <div class="theme-switcher" role="radiogroup" aria-label="Modo de color">
                    <For each={themeModes}>
                      {(mode) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={props.appearance.mode === mode.id}
                          classList={{ active: props.appearance.mode === mode.id }}
                          onClick={() => props.onAppearanceChange({ ...props.appearance, mode: mode.id })}
                        >
                          <strong>{mode.label}</strong>
                          <span>{mode.description}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
              <div class="setting-group">
                <label class="setting-label" for="ui-font">
                  <strong>Tipografía de la interfaz</strong>
                  <span>Se usa en explorer, botones y configuración.</span>
                </label>
                <select
                  id="ui-font"
                  class="input setting-select"
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
              <div class="setting-group">
                <label class="setting-label" for="editor-font">
                  <strong>Tipografía del editor</strong>
                  <span>Tipografía independiente para el contenido Markdown.</span>
                </label>
                <select
                  id="editor-font"
                  class="input setting-select"
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
              <div class="setting-group setting-range">
                <label class="setting-label" for="editor-size">
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
              <div class="setting-group setting-range">
                <label class="setting-label" for="line-height">
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
              <div class="setting-group setting-range">
                <label class="setting-label" for="content-width">
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
            <div class="settings-section-content">
              <div class="settings-section-heading">
                <div>
                  <h3>Skins instaladas</h3>
                  <p>La skin activa se aplica inmediatamente y conserva el fallback seguro.</p>
                </div>
              </div>
              <div class="skin-list">
                <button
                  type="button"
                  class="skin-card"
                  classList={{ active: props.activeSkin === "" }}
                  disabled={props.loading}
                  onClick={() => props.onSkinChange("")}
                >
                  <span class="skin-preview default-preview" />
                  <span>
                    <strong>Xenner (embebida)</strong>
                    <small>Claro y oscuro</small>
                  </span>
                </button>
                <For each={props.skins}>
                  {(skin) => (
                    <button
                      type="button"
                      class="skin-card"
                      classList={{ active: props.activeSkin === skin.id }}
                      disabled={props.loading}
                      onClick={() => props.onSkinChange(skin.id)}
                    >
                      <span class="skin-preview" />
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
            <div class="settings-section-content creator-settings">
              <div class="settings-section-heading">
                <div>
                  <h3>Creador de skins</h3>
                  <p>Genera una skin TXT segura y editable en AppLocalData.</p>
                </div>
              </div>
              <SkinCreator onCreated={props.onSkinCreated} />
            </div>
          </Show>
        </section>
      </div>
    </div>
  );
}
