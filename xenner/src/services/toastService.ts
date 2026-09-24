import { createSignal } from "solid-js";

import type { ToastItem, ToastOptions, ToastTone } from "../types/toast";

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
  clearDismissTimer(id);
  clearTimeout(removeTimers.get(id));
  removeTimers.delete(id);
  setToasts((current) => current.filter((toast) => toast.id !== id));
}

function clearDismissTimer(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  dismissTimers.delete(id);
}

function dismissToast(id: string): void {
  clearDismissTimer(id);
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
  clearDismissTimer(toast.id);
  dismissTimers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), toast.duration),
  );
}

export function getToasts(): readonly ToastItem[] {
  return toasts();
}

export function dismissToastById(id: string): void {
  dismissToast(id);
}

export function pauseToast(toast: ToastItem): void {
  clearDismissTimer(toast.id);
}

export function resumeToast(toast: ToastItem): void {
  if (!toast.leaving) scheduleDismiss(toast);
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
      clearDismissTimer(toast.id);
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
