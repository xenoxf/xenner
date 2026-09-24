import { createEffect, createSignal, For, onCleanup } from "solid-js";

import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./Icons";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "message">> {
  id: string;
  message?: string;
  leaving: boolean;
}

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  info: 5_000,
  success: 4_500,
  warning: 7_000,
  error: 9_000,
};
const MAX_VISIBLE_TOASTS = 4;
const EXIT_ANIMATION_MS = 180;

const [toasts, setToasts] = createSignal<ToastItem[]>([]);
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
const removeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let nextToastId = 0;

function removeToast(id: string): void {
  clearTimer(id);
  clearTimeout(removeTimers.get(id));
  removeTimers.delete(id);
  setToasts((current) => current.filter((toast) => toast.id !== id));
}

function clearTimer(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  dismissTimers.delete(id);
}

function dismissToast(id: string): void {
  clearTimer(id);
  if (removeTimers.has(id)) return;
  setToasts((current) =>
    current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
  );
  removeTimers.set(
    id,
    setTimeout(() => removeToast(id), EXIT_ANIMATION_MS),
  );
}

function scheduleDismiss(toast: ToastItem): void {
  if (toast.duration <= 0) return;
  clearTimer(toast.id);
  dismissTimers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), toast.duration),
  );
}

export function dismissToastById(id: string): void {
  dismissToast(id);
}

export function notify(input: string | ToastOptions): string {
  const options: ToastOptions = typeof input === "string" ? { title: input } : input;
  const tone = options.tone ?? "info";
  const id = `toast-${Date.now().toString(36)}-${++nextToastId}`;
  const item: ToastItem = {
    id,
    title: options.title.trim() || "Información",
    message: options.message?.trim() || undefined,
    tone,
    duration: Math.max(0, options.duration ?? DEFAULT_DURATIONS[tone]),
    leaving: false,
  };

  setToasts((current) => {
    const withoutDuplicate = current.filter(
      (toast) => !(toast.title === item.title && toast.message === item.message && toast.tone === item.tone),
    );
    for (const toast of withoutDuplicate.slice(MAX_VISIBLE_TOASTS - 1)) {
      clearTimer(toast.id);
      const removal = removeTimers.get(toast.id);
      if (removal !== undefined) clearTimeout(removal);
      removeTimers.delete(toast.id);
    }
    return [item, ...withoutDuplicate].slice(0, MAX_VISIBLE_TOASTS);
  });
  scheduleDismiss(item);
  return id;
}

export function notifySuccess(title: string, message?: string): string {
  return notify({ title, message, tone: "success" });
}

export function notifyWarning(title: string, message?: string): string {
  return notify({ title, message, tone: "warning" });
}

export function notifyError(title: string, error?: unknown): string {
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return notify({ title, message: detail, tone: "error" });
}

function pause(toast: ToastItem): void {
  clearTimer(toast.id);
}

function resume(toast: ToastItem): void {
  if (!toast.leaving) scheduleDismiss(toast);
}

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
    const currentToasts = toasts();
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
    <section class="toast-region" aria-label="Notificaciones de la aplicación">
      <For each={toasts()}>
        {(toast) => (
          <article
            ref={(element) => elements.set(toast.id, element)}
            class="toast"
            classList={{ "toast--leaving": toast.leaving }}
            data-tone={toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            onPointerEnter={() => pause(toast)}
            onPointerLeave={() => resume(toast)}
            onFocusIn={() => pause(toast)}
            onFocusOut={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) resume(toast);
            }}
          >
            <span class="toast-icon" aria-hidden="true">
              <ToastIcon tone={toast.tone} />
            </span>
            <div class="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <span>{toast.message}</span>}
            </div>
            <button
              type="button"
              class="toast-close"
              aria-label={`Descartar: ${toast.title}`}
              onClick={() => dismissToast(toast.id)}
            >
              <CloseIcon />
            </button>
          </article>
        )}
      </For>
    </section>
  );
}
