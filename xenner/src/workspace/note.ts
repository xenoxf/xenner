export interface NoteParts {
  title: string;
  body: string;
}

export const NOTE_TITLE_MAX_LENGTH = 240;

/** El nombre de la nota es el nombre del archivo, sin la extensión técnica `.md`. */
export function noteTitleFromPath(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return fileName.replace(/\.md$/i, "");
}

export function normalizeNoteTitle(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, NOTE_TITLE_MAX_LENGTH).join("");
}

/** El primer H1 conserva el formato Markdown; su título visible sale del archivo. */
export function splitNoteContent(path: string, content: string): NoteParts {
  const source = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const firstLineEnd = source.indexOf("\n");
  const firstLine = (firstLineEnd < 0 ? source : source.slice(0, firstLineEnd)).replace(/\r$/, "");
  const heading = /^#(?:[ \t]+(.*)|[ \t]*)$/.exec(firstLine);
  const title = noteTitleFromPath(path);

  if (!heading) {
    return { title, body: source };
  }

  const body = firstLineEnd < 0 ? "" : source.slice(firstLineEnd + 1).replace(/^\r?\n/, "");
  return { title, body };
}

/** Serializa la página como un único Markdown portable, incluso sin H1. */
export function serializeNoteContent(title: string, body: string): string {
  const normalizedTitle = normalizeNoteTitle(title);
  const normalizedBody = body.replace(/^\r?\n/, "");
  return `# ${normalizedTitle}\n\n${normalizedBody}`;
}
