function isRelativeAsset(source: string): boolean {
  return (
    source.startsWith("./") ||
    source.startsWith("../") ||
    (!source.includes("://") && !source.startsWith("data:") && !source.startsWith("blob:") && !source.startsWith("#"))
  );
}

export function resolveAssetReference(notePath: string, source: string): string | null {
  if (!notePath || !isRelativeAsset(source) || source.startsWith("../")) return null;
  const cleanSource = source.replace(/^\.\//, "");
  const parts = cleanSource.split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!normalized.length) return null;
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  if (normalized[0] !== ".assets" || normalized.length !== 2) return null;
  return normalized.join("/");
}
