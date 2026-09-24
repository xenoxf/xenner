import { createSignal, For, Show } from "solid-js";

import { DEFAULT_SKIN_DRAFT, SKIN_FONT_OPTIONS } from "../../data/skin";
import { createUserSkin } from "../../skin/creator";
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
      <div class={styles.preview} data-mode={draft().mode}>
        <div class={styles.previewSidebar}>
          <span />
          <span />
          <span />
        </div>
        <div class={styles.previewEditor}>
          <strong>{draft().name || "Mi skin"}</strong>
          <span />
          <span />
          <span class={styles.short} />
        </div>
      </div>
      <div class={styles.settingGroup}>
        <label class={styles.settingLabel} for="skin-name">
          <strong>Nombre de la skin</strong>
        </label>
        <input
          id="skin-name"
          class={`${styles.input} ${styles.settingSelect}`}
          value={draft().name}
          maxlength={64}
          required
          onInput={(event) => update("name", event.currentTarget.value)}
        />
      </div>
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>
          <strong>Modo base</strong>
        </span>
        <div class={styles.segmented} role="radiogroup" aria-label="Modo base">
          <button
            type="button"
            class={draft().mode === "light" ? styles.active : undefined}
            aria-pressed={draft().mode === "light"}
            onClick={() => update("mode", "light")}
          >
            Claro
          </button>
          <button
            type="button"
            class={draft().mode === "dark" ? styles.active : undefined}
            aria-pressed={draft().mode === "dark"}
            onClick={() => update("mode", "dark")}
          >
            Oscuro
          </button>
        </div>
      </div>
      <div class={styles.settingGroup}>
        <label class={styles.settingLabel} for="skin-accent">
          <strong>Color de acento</strong>
        </label>
        <input
          id="skin-accent"
          class={styles.colorInput}
          type="color"
          value={draft().accent}
          onInput={(event) => update("accent", event.currentTarget.value)}
        />
      </div>
      <div class={styles.settingGroup}>
        <label class={styles.settingLabel} for="skin-radius">
          <strong>Radio de superficies</strong>
        </label>
        <input
          id="skin-radius"
          type="range"
          min="0"
          max="32"
          step="1"
          value={draft().radius}
          onInput={(event) => update("radius", Number(event.currentTarget.value))}
        />
      </div>
      <div class={styles.settingGroup}>
        <label class={styles.settingLabel} for="skin-font">
          <strong>Tipografía</strong>
        </label>
        <select
          id="skin-font"
          class={`${styles.input} ${styles.settingSelect}`}
          value={draft().font}
          onChange={(event) => update("font", event.currentTarget.value)}
        >
          <For each={SKIN_FONT_OPTIONS}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </div>
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
