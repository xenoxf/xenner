import assert from 'node:assert/strict';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PALABRAS } from './palabras.ts';

/**
 * El castellano se cuela mezclado.
 *
 * Pasa al escribir rápido: una palabra que estaba en inglés se queda pegada a una
 * frase en español y no se ve. Ya ha pasado —«cuánto se transparency», «una
 * visiting con el móvil», «los tres formatos de Linux offering»— y en los tres
 * casos era el texto que se enseña al usuario.
 *
 * No es un corrector: solo busca un puñado de palabras inglesas que se usan a
 * menudo al traducir sin querer. Es una red de seguridad barata, no una
 * gramática, y por eso va con una lista corta y obvia en vez de un diccionario.
 *
 * Las excepciones son las palabras que existen en español (`nova` no, `solo`
 * sí) y los identificadores, que no son prosa: se excluyen los `data-*`, las
 * clases y las rutas de archivo.
 */

/** Inglés que aparece de verdad en archivos de este repositorio. */
const INGLES = [
  // Las que se han colado de verdad en este repositorio.
  'transparency',
  'offering',
  'visiting',
  'recognise',
  'comfortable',
  'hurting',
  'novella',
  'sensation',
  'sejam',
  'unhelpful',
  'helpful',
  // Erratas que el corrector del teclado no pilla en español.
  'higlights',
  'buttom',
  'recieve',
  'seperate',
  'existant',
  'definately',
  'occured',
  'untill',
  'alot',
  'informations',
  'writting',
  'mispelled',
  'wich',
  'adress',
  'lenght',
  'unkown',
];

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));

/** Carpetas que no son código nuestro y que hay que saltarse. */
const DESCARTAR = new Set(['node_modules', 'dist', 'target', 'build', 'coverage', '.astro']);

/**
 * Qué es una entrada del árbol, sin reventar con un enlace roto.
 *
 * `statSync` **sigue** los enlaces simbólicos y lanza `ENOENT` si el destino no
 * está. En un clon recién hecho no hay ninguno de esos destinos —señalan a rutas
 * de la máquina donde se compiló—, y un recorrido que se quede a medias es peor
 * que uno que se salte lo que no puede leer.
 *
 * Los enlaces **no se siguen**: lo que hay al otro lado no es el repositorio, así
 * que el texto que se leyera no sería el que se enseña.
 */
function tipoDe(ruta: string): 'fichero' | 'carpeta' | null {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(ruta);
  } catch {
    return null;
  }
  if (info.isSymbolicLink()) return null;
  if (info.isDirectory()) return 'carpeta';
  return info.isFile() ? 'fichero' : null;
}

/** Los archivos donde el texto se le por una persona. */
function archivosDeTexto(): string[] {
  // Este archivo queda fuera a propósito: nombra todas las palabras que busca,
  // así que se encontraría a sí mismo en cada una.
  const thisFile = 'texto-plano.test.ts';
  const encontrados: string[] = [];
  const recorrer = (carpeta: string) => {
    for (const nombre of readdirSync(carpeta)) {
      if (DESCARTAR.has(nombre) || nombre.startsWith('.')) continue;
      const ruta = `${carpeta}/${nombre}`;
      const tipo = tipoDe(ruta);
      if (tipo === 'carpeta') {
        recorrer(ruta);
      } else if (
        tipo === 'fichero' &&
        /\.(ts|tsx|astro|css|md|rs|yml)$/.test(nombre) &&
        nombre !== thisFile
      ) {
        encontrados.push(ruta);
      }
    }
  };
  recorrer(RAIZ);
  return encontrados;
}

/** Los trozos de un archivo que son prosa, quitando identificadores y rutas. */
function prosaDe(contenido: string): { linea: number; texto: string }[] {
  return contenido.split('\n').flatMap((linea, indice) => {
    // Las clases, los `data-*` y las rutas de archivo no son español: `sr-only`,
    // `node_modules` y `../../skins/aurora/custom.css` no tienen que traducirse.
    const sinCodigo = linea
      .replace(/class(Name)?=\{?"[^"]*"/g, '')
      .replace(/class="[^"]*"/g, '')
      .replace(/data-[a-z-]+="[^"]*"/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\b[\w-]+\.(css|txt|svg|png|jpg|ts|tsx|astro|json|md)\b/g, '')
      .replace(/`[^`]*`/g, ' ` ` ')
      .replace(/\b[a-zA-Z_$][\w$]*\(/g, ' ');

    const tieneTexto = /[áéíóúñ¿¡]|[a-z]{4,}/i.test(sinCodigo);
    if (!tieneTexto) return [];
    return [{ linea: indice + 1, texto: sinCodigo }];
  });
}

test('no se cuela inglés en el texto que se enseña', () => {
  const fallos: string[] = [];
  const archivos = archivosDeTexto();

  for (const archivo of archivos) {
    const contenido = readFileSync(archivo, 'utf-8');
    for (const { linea, texto } of prosaDe(contenido)) {
      for (const palabra of INGLES) {
        const patron = new RegExp(`\\b${palabra}\\b`, 'i');
        if (patron.test(texto)) {
          fallos.push(
            `${archivo.replace(RAIZ, '')}:${linea} — «${palabra}» en: ${texto.trim().slice(0, 110)}`,
          );
        }
      }
    }
  }

  assert.deepEqual(fallos, [], `\n${fallos.join('\n')}`);

  // Que el recorrido siga mirando de verdad. Si `DESCARTAR` acabara tragándose
  // media carpeta —un `target/` renombrado, un symloop— el test pasaría sin
  // comprobar nada, y es el peor fallo que puede tener un test de texto.
  assert.ok(archivos.length >= 60, `solo se han mirado ${archivos.length} archivos`);
  // Y que mire las dos mitades del repositorio, no solo la web: las erratas
  // estaban igual en los README, en el backend y en las notas de la release.
  const fueraDeWeb = archivos.filter((archivo) => !archivo.startsWith(`${RAIZ}web/`));
  assert.ok(
    fueraDeWeb.length >= 10,
    `solo se han mirado ${fueraDeWeb.length} archivos fuera de la web`,
  );
});

test('el diccionario no promete más de lo que explica', () => {
  // Cada entrada tiene que decir las tres cosas. Una entrada con la definición
  // puesta y el «para qué» vacío ocupa lo mismo en la barra que una útil, y deja
  // a quien la busca con la misma duda que tenía antes de abrirla.
  for (const palabra of PALABRAS) {
    assert.ok(palabra.what.length > 30, `«${palabra.term}»: la definición es demasiado corta`);
    assert.ok(palabra.why.length > 30, `«${palabra.term}»: falta explicar para qué sirve`);
    assert.ok(palabra.term.length <= 22, `«${palabra.term}» no cabe en la barra`);
    assert.ok(
      !/[<>]/.test(palabra.what + palabra.why),
      `«${palabra.term}»: las definiciones van en texto plano, se escapan en la tabla`,
    );
  }
});

test('el ejemplo de una palabra, si lo hay, se puede escribir de verdad', () => {
  // Un ejemplo que Xenner no aceptaría enseña justo lo contrario de lo que
  // dice la página de las claves: que cualquier cosa vale. Se comprueba con las
  // mismas reglas que usa el creador, que es donde acabaría el ejemplo.
  for (const palabra of PALABRAS) {
    if (!palabra.example) continue;
    for (const linea of palabra.example.split('\n')) {
      const troceado = linea.match(/^([a-zA-Z][\w-]*)="(.*)"$/);
      if (!troceado) continue; // no es una línea clave="valor": un fragmento, no un ajuste
      const [, clave, valor] = troceado;
      assert.ok(
        !valor.includes(';') || clave === 'shadow' || clave === 'border',
        `«${palabra.term}»: el ejemplo de ${clave} lleva un «;» fuera de un url(), y Xenner lo pasa por alto`,
      );
    }
  }
});
