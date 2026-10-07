/**
 * Una página por tema. La portada no compite por todas las búsquedas a la
 * vez: cada página responde a una.
 */
export interface GuidePage {
  /** Ruta con barra final: /editor-de-notas/ */
  path: string;
  /** Enlace en la web y texto del título. */
  label: string;
  /** Una línea, sin HTML: sirve para el enlace de navegación. */
  summary: string;
}

export const GUIDE: readonly GuidePage[] = [
  {
    path: '/editor-de-notas/',
    label: 'El editor',
    summary: 'Qué hace Xenner y cómo se usa.',
  },
  {
    path: '/notas-markdown/',
    label: 'Notas en Markdown',
    summary: 'Por qué las notas son archivos de texto.',
  },
  {
    path: '/doc/',
    label: 'Hacer una skin',
    summary: 'La documentación completa, en nueve páginas.',
  },
  {
    path: '/pizarra/',
    label: 'La pizarra',
    summary: 'Dibujar dentro de la nota.',
  },
  {
    path: '/alternativa-notion/',
    label: 'Sin nube',
    summary: 'Tus notas en tu ordenador, no en un servidor.',
  },
  {
    path: '/instalar/',
    label: 'Instalar y ejecutar',
    summary: 'Instalarlo, o levantarlo desde el código.',
  },
];
