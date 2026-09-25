export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: ToastTone;
  duration?: number;
}

export interface ToastItem extends Required<Omit<ToastOptions, "message">> {
  id: string;
  message?: string;
  leaving: boolean;
}
