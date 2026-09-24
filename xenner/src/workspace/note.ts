export interface NoteParts {
  title: string;
  body: string;
}

export const NOTE_TITLE_MAX_LENGTH = 240;

function titleFromPath(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const stem = fileName.replace(/\.md$/i, "");
  return /^Sin título(?: \d+)?$/i.test(stem) ? "" : stem;
}

export function normalizeNoteTitle(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, NOTE_TITLE_MAX_LENGTH).join("");
}

/** El título de la página vive en el primer H1 y el editor recibe solo el cuerpo. */
export function splitNoteContent(path: string, content: string): NoteParts {
  const source = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const firstLineEnd = source.indexOf("\n");
  const firstLine = (firstLineEnd < 0 ? source : source.slice(0, firstLineEnd)).replace(/\r$/, "");
  const heading = /^#(?:[ \t]+(.*)|[ \t]*)$/.exec(firstLine);

  if (!heading) {
    return { title: titleFromPath(path), body: source };
  }

  const body = firstLineEnd < 0 ? "" : source.slice(firstLineEnd + 1).replace(/^\r?\n/, "");
  return { title: normalizeNoteTitle(heading[1] ?? ""), body };
}

/** Serializa la página como un único Markdown portable, incluso sin título. */
export function serializeNoteContent(title: string, body: string): string {
  const normalizedTitle = normalizeNoteTitle(title);
  const normalizedBody = body.replace(/^\r?\n/, "");
  return `# ${normalizedTitle}\n\n${normalizedBody}`;
}
