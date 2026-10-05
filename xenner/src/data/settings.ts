import type { ThemeMode } from "../types/appearance";

export type SettingsSection = "appearance" | "skins" | "create";

export interface SettingsNavigationItem {
  id: SettingsSection;
  label: string;
  hint: string;
  /** Lo que se lee bajo el título de la página, en una línea. */
  description: string;
  /** Palabras sueltas para encontrar la sección escribiendo. */
  keywords: readonly string[];
}

export interface ThemeModeOption {
  id: ThemeMode;
  label: string;
}

export const THEME_MODES: readonly ThemeModeOption[] = [
  { id: "system", label: "Sistema" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
];

/**
 * Las secciones se nombran por lo que la persona quiere conseguir, no por cómo
 * está construido por dentro. "Temas" y no "Skins", y sin mencionar archivos
 * `.txt`, variables CSS ni tokens: eso va en la documentación, no en la
 * interfaz.
 */
export const SETTINGS_SECTIONS: readonly SettingsNavigationItem[] = [
  {
    id: "appearance",
    label: "Aspecto",
    hint: "Cómo se ven tus notas",
    description: "Tipografías, tamaño del texto y modo claro u oscuro.",
    keywords: ["letra", "tamaño", "fuente", "tipografía", "oscuro", "claro", "ancho"],
  },
  {
    id: "skins",
    label: "Temas",
    hint: "Elige el que más te guste",
    description: "Los temas cambian los colores y las formas de toda la aplicación.",
    keywords: ["color", "paleta", "tema", "skin", "importar", "exportar"],
  },
  {
    id: "create",
    label: "Crear un tema",
    hint: "Un aspecto propio",
    description: "Empieza de una paleta y guarda el tema con un nombre.",
    keywords: ["crear", "nuevo", "personalizado", "editor", "css"],
  },
];

/**
 * Lo que se puede encontrar escribiendo en la configuración.
 *
 * Es una **lista explícita** y no se lee del JSX: un buscador que arranca el DOM
 * para ver qué botones hay se rompe en cuanto alguien escribe un `<For>` y, peor,
 * no encuentra nada que no sea un texto. Con la lista a la vista, añadir una opción
 * que se pueda buscar es añadir una línea aquí, y forgetting de buscarla es una
 * línea que falta, no un botón invisible.
 *
 * El buscador no puntúa ni difiere: cada palabra escrita tiene que aparecer en el
 * texto de la entrada. Es menos mágico y se entiende, que es lo que hace falta en
 * un sitio con seis cosas que buscar.
 */
export interface SettingsSearchItem {
  /** La sección a la que salta. */
  section: SettingsSection;
  /** Lo que se lee en el resultado. */
  label: string;
  /** La segunda línea, que explica para qué sirve. */
  description: string;
  keywords: readonly string[];
}

export const SETTINGS_SEARCH: readonly SettingsSearchItem[] = [
  {
    section: "appearance",
    label: "Modo de color",
    description: "Claro, oscuro o el del sistema",
    keywords: ["tema", "oscuro", "claro", "sistema", "noche", "dia"],
  },
  {
    section: "appearance",
    label: "Tipografía de la interfaz",
    description: "Botones, menús y barras",
    keywords: ["letra", "fuente", "tipografía", "botones", "menu"],
  },
  {
    section: "appearance",
    label: "Tipografía del editor",
    description: "El texto de tus notas",
    // «horas» está aquí y no solo en la explicación que se ve detrás del ⓘ: el
    // buscador lee **esta** lista, así que una palabra que solo vive en el texto de
    // arriba es una palabra que no se puede buscar.
    keywords: ["letra", "fuente", "tipografía", "notas", "texto", "horas", "leer"],
  },
  {
    section: "appearance",
    label: "Tamaño del texto",
    description: "El cuerpo de tus notas",
    keywords: ["tamaño", "letra", "grande", "pequeño", "zoom"],
  },
  {
    section: "appearance",
    label: "Interlineado",
    description: "Cuánto aire hay entre líneas",
    keywords: ["interlineado", "altura", "lineas", "espacio", "aire"],
  },
  {
    section: "appearance",
    label: "Ancho de lectura",
    description: "Cuántas letras caben en cada línea",
    keywords: ["ancho", "columna", "margen", "letras", "lineas"],
  },
  {
    section: "skins",
    label: "Elegir un tema",
    description: "Se aplica al momento",
    keywords: ["color", "paleta", "tema", "skin", "usar"],
  },
  {
    section: "skins",
    label: "Traer un tema",
    description: "Importarlo desde tu equipo",
    keywords: ["importar", "traer", "abrir", "cargar"],
  },
  {
    section: "create",
    label: "Crear un tema",
    description: "Desde una paleta o desde CSS",
    keywords: ["crear", "nuevo", "personalizado", "css", "editor"],
  },
];

/**
 * Lo que casa con lo escrito.
 *
 * Cada palabra tiene que aparecer en alguna parte del texto de la entrada —el
 * nombre, la explicación o las palabras clave—, y sin tildes ni mayúsculas: «Titulo»
 * tiene que encontrar «Título», porque en una configuración se escribe como se habla.
 */
export function searchSettings(consulta: string): SettingsSearchItem[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  return SETTINGS_SEARCH.filter((item) => {
    const texto = normalizar(
      [item.label, item.description, ...item.keywords, sectionDe(item.section)].join(" "),
    );
    return palabras.every((palabra) => texto.includes(palabra));
  });
}

/** Buscar sin tildes ni mayúsculas, como el resto de la app. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function sectionDe(id: SettingsSection): SettingsNavigationItem {
  return SETTINGS_SECTIONS.find((item) => item.id === id) ?? SETTINGS_SECTIONS[0];
}