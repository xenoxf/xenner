export function baseName(path: string, fallback = "Biblioteca"): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? fallback;
}
