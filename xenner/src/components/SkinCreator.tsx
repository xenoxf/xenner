import { createSignal, Show } from "solid-js";

import { createUserSkin, type SkinDraft } from "../skin/creator";
import type { SkinInfo } from "../skin/loader";

interface SkinCreatorProps {
  onCreated(skin: SkinInfo): void;
}

export function SkinCreator(props: SkinCreatorProps) {
  const [draft, setDraft] = createSignal<SkinDraft>({
    name: "Mi skin",
    accent: "#6750a4",
    mode: "dark",
    radius: 16,
    font: "system",
  });
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
    <form class="skin-creator" onSubmit={(event) => void submit(event)}>
      <div class="creator-preview" data-mode={draft().mode}>
        <div class="creator-preview-sidebar">
          <span />
          <span />
          <span />
        </div>
        <div class="creator-preview-editor">
          <strong>{draft().name || "Mi skin"}</strong>
          <span />
          <span />
          <span class="short" />
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label" for="skin-name">
          <strong>Nombre de la skin</strong>
          <span>Se convierte en un identificador seguro.</span>
        </label>
        <input
          id="skin-name"
          class="input setting-select"
          value={draft().name}
          maxlength={64}
          required
          onInput={(event) => update("name", event.currentTarget.value)}
        />
      </div>
      <div class="setting-group">
        <span class="setting-label">
          <strong>Modo base</strong>
          <span>Define la paleta inicial de la skin.</span>
        </span>
        <div class="creator-segmented" role="radiogroup" aria-label="Modo base">
          <button
            type="button"
            classList={{ active: draft().mode === "light" }}
            aria-pressed={draft().mode === "light"}
            onClick={() => update("mode", "light")}
          >
            Claro
          </button>
          <button
            type="button"
            classList={{ active: draft().mode === "dark" }}
            aria-pressed={draft().mode === "dark"}
            onClick={() => update("mode", "dark")}
          >
            Oscuro
          </button>
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label" for="skin-accent">
          <strong>Color de acento</strong>
          <span>Se usa en selección, foco y enlaces.</span>
        </label>
        <input
          id="skin-accent"
          class="color-input"
          type="color"
          value={draft().accent}
          onInput={(event) => update("accent", event.currentTarget.value)}
        />
      </div>
      <div class="setting-group">
        <label class="setting-label" for="skin-radius">
          <strong>Radio de superficies</strong>
          <span>De 0 a 32 píxeles.</span>
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
      <div class="setting-group">
        <label class="setting-label" for="skin-font">
          <strong>Tipografía</strong>
          <span>Se escribe como una skin TXT editable.</span>
        </label>
        <select
          id="skin-font"
          class="input setting-select"
          value={draft().font}
          onChange={(event) => update("font", event.currentTarget.value)}
        >
          <option value="system">Roboto / sistema</option>
          <option value="serif">Editorial serif</option>
          <option value="mono">Monoespaciada</option>
        </select>
      </div>
      <Show when={error()}>
        {(message) => <p class="form-error" role="alert">{message()}</p>}
      </Show>
      <div class="creator-actions">
        <button type="submit" class="button primary" disabled={busy()}>
          {busy() ? "Creando…" : "Crear skin"}
        </button>
      </div>
    </form>
  );
}
