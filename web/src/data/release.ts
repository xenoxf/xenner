import { type Release } from '../scripts/releases.ts';
import { REPO_SLUG } from '../config';

/**
 * La última release, leída en el servidor durante el build.
 *
 * Sirve para dos cosas: pintar los botones sin esperar a que el navegador hable
 * con GitHub, y tener algo que mostrar si esa llamada falla. El script del
 * cliente vuelve a preguntar al abrirse la página, así que publicar una release
 * nueva enseña los instaladores sin volver a construir la web.
 *
 * Que falle no rompe el build: la portada avisa por consola y sigue con lo que
 * hubiera. Una release que aún no existe, o una API que no contesta, tienen que
 * dejar la web en pie.
 *
 * ---------------------------------------------------------------------------
 * Por qué esto NO lee el token de GitHub
 *
 * Porque el snapshot es una comodidad, no la fuente de verdad: quien visite la
 * página lee la release desde su propio navegador. Meter aquí un `GITHUB_TOKEN`
 * solo serviría para saltarse el límite de 60 peticiones por hora de la API
 * pública, y a cambio dejaría un token de escritura en el entorno de cada
 * despliegue del sitio, que es donde no debería estar un secreto con permiso
 * para publicar releases.
 */
export async function fetchLatestRelease(): Promise<Release | null> {
  const url = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'xenner-web-build',
      },
    });

    if (res.status === 404) {
      // Todavía no hay ninguna release publicada. Es lo normal hasta la primera.
      console.log('[xenner] Todavía no hay ninguna release publicada.');
      return null;
    }

    if (!res.ok) {
      console.warn(`[xenner] GitHub respondió ${res.status} al pedir la release.`);
      return null;
    }

    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return null;

    const release = json as Partial<Release>;
    if (typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) {
      console.warn('[xenner] La respuesta de GitHub no tiene la forma de una release.');
      return null;
    }

    return release as Release;
  } catch (error) {
    console.warn('[xenner] No se pudo leer la release de GitHub:', error);
    return null;
  }
}
