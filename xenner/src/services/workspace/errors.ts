import type { VaultErrorShape } from "../../types/workspace";

export function vaultError(code: string, message: string): VaultErrorShape {
  return { code, message };
}

export function asVaultError(value: unknown): VaultErrorShape {
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return { code: candidate.code, message: candidate.message };
    }
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed !== value) return asVaultError(parsed);
    } catch {
      // Tauri puede rechazar con texto plano; se muestra tal cual.
    }
    return vaultError("unknown", value);
  }
  return vaultError("unknown", "Error desconocido del sistema de archivos");
}
