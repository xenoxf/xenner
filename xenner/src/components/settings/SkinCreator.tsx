import { createSignal, For, Show } from "solid-js";

import {
  DEFAULT_SKIN_DRAFT,
  SKIN_COLOR_FIELDS,
  SKIN_FONT_OPTIONS,
  SKIN_PALETTES,
  SKIN_PRESETS,
  SKIN_SHADOW_OPTIONS,
} from "../../data/skin";
import { buildSkinPreviewStyle, createUserSkin } from "../../skin/creator";
import styles from "../../styles/components/SkinCreator.module.css";
import type { SkinDraft, SkinInfo } from "../../types/skin";
import { Button } from "../ui/Button";

interface SkinCreatorProps {
  onCreated(skin: SkinInfo): void;
}

export function SkinCreator(props: SkinCreatorProps) {
  const [draft, setDraft] = createSignal<SkinDraft>({ ...DEFAULT_SKIN_DRAFT });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function update<K extends keyof SkinDraft>(key: K, value: SkinDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setMode(mode: SkinDraft["mode"]): void {
    setDraft((current) => ({
      ...current,
      mode,
      ...SKIN_PALETTES[mode],
    }));
  }

  function applyPreset(preset: (typeof SKIN_PRESETS)[number]): void {
    setDraft((current) => ({ ...preset.draft, name: current.name }));
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy() || !draft().name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const skin = await createUserSkin(draft());
      props.onCreated(skin);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la skin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class={styles.form} onSubmit={(event) => void submit(event)}>
      <div class={styles.preview} data-mode={draft().mode} style={buildSkinPreviewStyle(draft())}>
        <div class={styles.previewToolbar}>
          <span class={styles.previewDots}><i /><i /><i /></span>
          <span class={styles.previewToolbarLine} />
        </div>
        <div class={styles.previewSidebar}>
          <span />
          <span />
          <span />
        </div>
        <div class={styles.previewEditor}>
          <strong>{draft().name || "Mi skin"}</strong>
          <div class={styles.previewNote}>
            <span />
            <i />
          </div>
          <span class={styles.previewLine} />
        </div>
      </div>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Identidad</strong>
        </div>
        <label class={styles.nameControl} for="skin-name">
          <span>Nombre de la skin</span>
          <input
            id="skin-name"
            class={styles.nameInput}
            value={draft().name}
            maxlength={64}
            required
            onInput={(event) => update("name", event.currentTarget.value)}
          />
        </label>
      </section>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Estilos rápidos</strong>
          <button type="button" class={styles.resetButton} onClick={() => setDraft({ ...DEFAULT_SKIN_DRAFT })}>
            Restablecer
          </button>
        </div>
        <div class={styles.presets}>
          <For each={SKIN_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class={styles.preset}
                onClick={() => applyPreset(preset)}
              >
                <span class={styles.presetSwatch} style={buildSkinPreviewStyle(preset.draft)} />
                {preset.label}
              </button>
            )}
          </For>
        </div>
      </section>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Paleta</strong>
          <div class={styles.modeSwitch} role="radiogroup" aria-label="Punto de partida">
            <button
              type="button"
              class={draft().mode === "light" ? styles.active : undefined}
              aria-pressed={draft().mode === "light"}
              onClick={() => setMode("light")}
            >
              Claro
            </button>
            <button
              type="button"
              class={draft().mode === "dark" ? styles.active : undefined}
              aria-pressed={draft().mode === "dark"}
              onClick={() => setMode("dark")}
            >
              Oscuro
            </button>
          </div>
        </div>
        <div class={styles.colorGrid}>
          <For each={SKIN_COLOR_FIELDS}>
            {(field) => (
              <label class={styles.colorField} for={`skin-${field.key}`}>
                <span>{field.label}</span>
                <span class={styles.colorControl}>
                  <input
                    id={`skin-${field.key}`}
                    class={styles.colorInput}
                    type="color"
                    value={draft()[field.key]}
                    onInput={(event) => update(field.key, event.currentTarget.value)}
                  />
                  <output>{draft()[field.key]}</output>
                </span>
              </label>
            )}
          </For>
        </div>
      </section>

      <section class={styles.creatorBlock}>
        <div class={styles.blockHeader}>
          <strong>Acabado</strong>
        </div>
        <div class={styles.controlsGrid}>
          <label class={styles.rangeControl} for="skin-radius">
            <span>Radio <output>{draft().radius}px</output></span>
            <input
              id="skin-radius"
              type="range"
              min="0"
              max="40"
              step="1"
              value={draft().radius}
              onInput={(event) => update("radius", Number(event.currentTarget.value))}
            />
          </label>
          <label class={styles.rangeControl} for="skin-blur">
            <span>Desenfoque <output>{draft().blur}px</output></span>
            <input
              id="skin-blur"
              type="range"
              min="0"
              max="32"
              step="1"
              value={draft().blur}
              onInput={(event) => update("blur", Number(event.currentTarget.value))}
            />
          </label>
          <label class={styles.rangeControl} for="skin-border-width">
            <span>Borde <output>{draft().borderWidth}px</output></span>
            <input
              id="skin-border-width"
              type="range"
              min="0"
              max="3"
              step="1"
              value={draft().borderWidth}
              onInput={(event) => update("borderWidth", Number(event.currentTarget.value))}
            />
          </label>
          <label class={styles.selectControl} for="skin-shadow">
            <span>Sombra</span>
            <select
              id="skin-shadow"
              value={draft().shadow}
              onChange={(event) => update("shadow", event.currentTarget.value as SkinDraft["shadow"])}
            >
              <For each={SKIN_SHADOW_OPTIONS}>
                {(option) => <option value={option.value}>{option.label}</option>}
              </For>
            </select>
          </label>
          <label class={styles.selectControl} for="skin-font">
            <span>Tipografía</span>
            <select
              id="skin-font"
              value={draft().font}
              onChange={(event) => update("font", event.currentTarget.value)}
            >
              <For each={SKIN_FONT_OPTIONS}>
                {(option) => <option value={option.value}>{option.label}</option>}
              </For>
            </select>
          </label>
        </div>
      </section>

      <Show when={error()}>
        {(message) => <p class={styles.formError} role="alert">{message()}</p>}
      </Show>
      <div class={styles.actions}>
        <Button type="submit" variant="primary" disabled={busy()}>
          {busy() ? "Creando…" : "Crear skin"}
        </Button>
      </div>
    </form>
  );
}
