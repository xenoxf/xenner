import { createEffect, For, onCleanup } from "solid-js";

import styles from "../../styles/components/ToastRegion.module.css";
import {
  dismissToastById,
  getToasts,
  pauseToast,
  resumeToast,
} from "../../services/toastService";
import type { ToastTone } from "../../types/toast";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "../ui/Icons";

function ToastIcon(props: { tone: ToastTone }) {
  if (props.tone === "success") return <CheckIcon />;
  if (props.tone === "warning" || props.tone === "error") return <AlertIcon />;
  return <InfoIcon />;
}

export function ToastRegion() {
  const elements = new Map<string, HTMLElement>();
  const previousRects = new Map<string, DOMRect>();
  const layoutAnimations = new Map<string, Animation>();

  createEffect(() => {
    const currentToasts = getToasts();
    queueMicrotask(() => {
      const currentIds = new Set(currentToasts.map((toast) => toast.id));
      for (const toast of currentToasts) {
        const element = elements.get(toast.id);
        if (!element) continue;
        const nextRect = element.getBoundingClientRect();
        const previousRect = previousRects.get(toast.id);
        layoutAnimations.get(toast.id)?.cancel();
        layoutAnimations.delete(toast.id);

        if (
          !toast.leaving &&
          previousRect &&
          Math.abs(previousRect.top - nextRect.top) > 1 &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          const animation = element.animate(
            [
              { transform: `translate3d(0, ${previousRect.top - nextRect.top}px, 0)` },
              { transform: "translate3d(0, 0, 0)" },
            ],
            { duration: 190, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
          );
          layoutAnimations.set(toast.id, animation);
          animation.addEventListener("finish", () => layoutAnimations.delete(toast.id), { once: true });
        }
        previousRects.set(toast.id, nextRect);
      }
      for (const id of previousRects.keys()) {
        if (!currentIds.has(id)) {
          previousRects.delete(id);
          elements.delete(id);
          layoutAnimations.get(id)?.cancel();
          layoutAnimations.delete(id);
        }
      }
    });
  });

  onCleanup(() => {
    for (const animation of layoutAnimations.values()) animation.cancel();
  });

  return (
    <section class={styles.region} aria-label="Notificaciones de la aplicación">
      <For each={getToasts()}>
        {(toast) => (
          <article
            ref={(element) => elements.set(toast.id, element)}
            class={`${styles.toast} ${toast.leaving ? styles.leaving : ""}`}
            data-tone={toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            onPointerEnter={() => pauseToast(toast)}
            onPointerLeave={() => resumeToast(toast)}
            onFocusIn={() => pauseToast(toast)}
            onFocusOut={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) resumeToast(toast);
            }}
          >
            <span class={styles.icon} aria-hidden="true">
              <ToastIcon tone={toast.tone} />
            </span>
            <div class={styles.copy}>
              <strong>{toast.title}</strong>
              {toast.message && <span>{toast.message}</span>}
            </div>
            <button
              type="button"
              class={styles.close}
              aria-label={`Descartar: ${toast.title}`}
              onClick={() => dismissToastById(toast.id)}
            >
              <CloseIcon />
            </button>
          </article>
        )}
      </For>
    </section>
  );
}
