/** Datos que se repiten por el sitio, en un solo sitio. */
export const SITE_NAME = 'Xenner';

/** Repositorio canónico: el proyecto vive aquí, no en el fork. */
export const REPO = 'https://github.com/xenoxf/xenner';

/** El mismo repositorio en forma `dueño/nombre`, que es como lo quiere la API de GitHub. */
export const REPO_SLUG = 'xenoxf/xenner';

/**
 * Dónde avisar cuando algo no sale. Está vacío a propósito: el sitio no
 * presume de un Discord ni de un foro que no existen todavía. Cuando los haya,
 * se rellena aquí y los enlaces lo toman de este sitio en vez de estar escritos
 * a mano en cinco archivos distintos.
 */
export const COMMUNITY = {
  discord: '',
  mastodon: '',
  email: '',
} as const;
