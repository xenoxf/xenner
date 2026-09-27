/**
 * El bloque de código y las tablas anchas.
 *
 * Tres cosas que solo se pueden hacer con JavaScript, y las tres se pueden
 * perder sin romper la página: si este archivo no llega a ejecutarse, el código
 * se sigue viendo, se sigue pudiendo seleccionar y copiar a mano, y la tabla se
 * sigue desplazando con el dedo. Por eso ninguna de las tres es imprescindible
 * para entender la página.
 *
 *  - **Copiar.** Cuarenta ejemplos de código que se teclean a mano son cuarenta
 *    ocasiones de equivocar un corchete. El botón copia el texto exacto y
 *    cambia de icono para que se vea que ha salido.
 *  - **Colorear lo obvio.** Solo comentarios y cadenas, que es lo que hace
 *    legible un archivo de configuración de un vistazo. Y solo en los nodos de
 *    texto sin marca: los `<span>` que la página pone como aclaración («correcto»,
 *    «un degradado muy tenue») se quedan como están y salen en color de
 *    comentario. Es exactamente el reparto que se quiere.
 *  - **Envoltorio.** Una tabla más ancha que su columna se sale. Con un
 *    contenedor con `overflow` se desplaza, y con `tabindex` y `role="region"` se
 *    puede desplazar también con el teclado, que si no es solo con el ratón.
 */

/** Una parte de una línea de código. */
export interface Token {
  tipo: 'clave' | 'str' | 'com' | 'txt';
  texto: string;
}

/** Una clave al principio de una línea: `text="#fff"`, `name="Sepia"`. */
const CLAVE = /^([ \t]*)([A-Za-z_][A-Za-z0-9_-]*)(=)/;

/**
 * Reparte una línea en trozos coloreables.
 *
 * Tres reglas, y ninguna más:
 *
 *  1. Una almohadilla que abre la línea es un comentario entero. Solo al
 *     principio: en `#e7e7e4` es parte de un color, y una almohadilla suelta a
 *     mitad de línea no comenta nada.
 *  2. Un comentario de bloque va de `/`+`*` a `*`+`/`, aunque se cierre en la
 *     línea siguiente.
 *  3. Entre comillas, todo es cadena. incluidas las comillas simples que hay
 *     dentro de una doble, que es el caso de `font="Georgia, 'Noto Serif', serif"`.
 *
 * Lo que no se reconoce sale como texto tal cual, así que la peor consecuencia
 * de un fallo aquí es que un ejemplo quede un poco menos bonito.
 */
export function tokenizar(linea: string): Token[] {
  const primero = linea.search(/\S/);
  if (primero >= 0 && linea[primero] === '#') {
    return [{ tipo: 'com', texto: linea }];
  }

  const salida: Token[] = [];
  const anadir = (tipo: Token['tipo'], texto: string) => {
    if (!texto) return;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else salida.push({ tipo, texto });
  };

  // Una clave solo puede ser lo primero de la línea, así que se saca antes de
  // recorrer el resto. `background-size: cover` no casa —dos puntos, no igual— y
  // `[data-x="app"] {` tampoco, porque empieza por corchete.
  const clave = CLAVE.exec(linea);
  let desde = 0;
  if (clave) {
    anadir('txt', clave[1]);
    anadir('clave', clave[2]);
    anadir('txt', clave[3]);
    desde = clave[0].length;
  }

  let i = desde;
  while (i < linea.length) {
    const c = linea[i];

    if (c === '/' && linea[i + 1] === '*') {
      const cierre = linea.indexOf('*/', i + 2);
      const fin = cierre < 0 ? linea.length : cierre + 2;
      anadir('com', linea.slice(i, fin));
      i = fin;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < linea.length && linea[j] !== c) j++;
      // Una comilla sin cerrar se lleva el resto de la línea: sigue siendo
      // texto, y colorearlo de otra cosa no lo haría más cierto.
      const fin = Math.min(j + 1, linea.length);
      anadir('str', linea.slice(i, fin));
      i = fin;
      continue;
    }

    anadir('txt', c);
    i += 1;
  }

  return salida;
}

const ICONO_COPIAR =
  '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="7" y="7" width="9" height="9" rx="2"></rect>' +
  '<path d="M13 4.5H6.5A2.5 2.5 0 004 7v6.5"></path></svg>';

const ICONO_HECHO =
  '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4.5 10.5l3.5 3.5 7.5-8"></path></svg>';

/**
 * Colorea solo los nodos de texto que no tienen marca dentro.
 *
 * Los `<span>` de aclaración se quedan como los escribió la página, y el código
 * de alrededor se colorea: es el mismo criterio que el de un resaltador de
 * verdad, que no pisa lo que ya está marcado.
 */
export function colorear(code: HTMLElement): void {
  if (code.dataset.pintado === '1') return;
  code.dataset.pintado = '1';

  for (const nodo of [...code.childNodes]) {
    if (nodo.nodeType !== Node.TEXT_NODE) continue;
    const linea = nodo.textContent ?? '';
    if (!linea.trim()) continue;

    const trozo = document.createDocumentFragment();
    for (const token of tokenizar(linea)) {
      if (token.tipo === 'txt') {
        trozo.append(document.createTextNode(token.texto));
        continue;
      }
      const marca = document.createElement('i');
      marca.className = `cod cod--${token.tipo}`;
      marca.textContent = token.texto;
      trozo.append(marca);
    }
    nodo.replaceWith(trozo);
  }
}

/** Copiar, con el camino de antes por si el portapapeles está bloqueado. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // `navigator.clipboard` necesita contexto seguro y permiso. Si no lo hay, se
    // selecciona el bloque y se deja que la persona pulse Ctrl+C, que es lo que
    // los navegadores hacen con «copiar» del menú.
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.append(area);
    area.select();
    let bien = false;
    try {
      bien = document.execCommand('copy');
    } catch {
      bien = false;
    }
    area.remove();
    return bien;
  }
}

/**
 * Envuelve el bloque y le pone el botón.
 *
 * El botón va en un contenedor y no dentro del `<pre>` a propósito: un hijo
 * posicionado dentro de un bloque con `overflow` se desplaza con el contenido, y
 * con una línea larga el botón se iría de viaje con ella.
 */
function boton(pre: HTMLPreElement): void {
  const code = pre.querySelector('code');
  if (!code) return;

  const caja = document.createElement('div');
  caja.className = 'code';
  pre.replaceWith(caja);
  caja.append(pre);

  const site = document.createElement('button');
  site.type = 'button';
  site.className = 'code__copiar';
  site.setAttribute('aria-label', 'Copiar el código');
  site.innerHTML = ICONO_COPIAR;
  caja.append(site);

  const texto = code.textContent ?? '';
  let volver: ReturnType<typeof setTimeout> | undefined;
  site.addEventListener('click', async () => {
    const bien = await copiar(texto);
    site.innerHTML = bien ? ICONO_HECHO : ICONO_COPIAR;
    site.classList.toggle('code__copiar--hecho', bien);
    site.setAttribute('aria-label', bien ? 'Copiado' : 'Copia el código a mano');
    clearTimeout(volver);
    volver = setTimeout(() => {
      site.innerHTML = ICONO_COPIAR;
      site.classList.remove('code__copiar--hecho');
      site.setAttribute('aria-label', 'Copiar el código');
    }, 1800);
  });

  colorear(code);
}

/**
 * Un contenedor desplazable con nombre, para leerlo y recorrerlo con el teclado.
 *
 * De paso, dos arreglos que el CSS no puede hacer solo:
 *
 *  - **Cuántas columnas hay.** Con tres o más, en pantalla estrecha cada fila se
 *    convierte en una ficha con su etiqueta, y para eso cada celda necesita
 *    saber a qué columna pertenece. Se lo copiamos del `<th>` de arriba.
 *  - **Si de verdad hay que desplazarse.** `tabindex` y `role="region"` solo
 *   -interestan cuando la tabla no cabe; con ellos puestos siempre, el teclado
 *    se para en un contenedor que no se mueve y no lleva a ninguna parte.
 */
function envolver(tabla: HTMLTableElement): void {
  const caja = document.createElement('div');
  caja.className = 'desliza';

  const titulos = [...tabla.querySelectorAll('thead th')].map((th) =>
    (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
  if (titulos.length >= 3) {
    caja.classList.add('desliza--apilada');
    for (const fila of tabla.querySelectorAll('tbody tr')) {
      const celdas = [...fila.children];
      // La primera celda es la que da nombre a la fila: no necesita etiqueta.
      for (let i = 1; i < celdas.length; i++) {
        const etiqueta = titulos[i];
        if (etiqueta) (celdas[i] as HTMLElement).dataset.label = etiqueta;
      }
    }
  }

  tabla.replaceWith(caja);
  caja.append(tabla);

  const medir = () => {
    const desborda = caja.scrollWidth > caja.clientWidth + 2;
    if (desborda) {
      caja.setAttribute('role', 'region');
      caja.setAttribute('tabindex', '0');
      caja.setAttribute(
        'aria-label',
        `Tabla: ${cortar(titulos[0] ?? 'sin título', 60)}. Deslízala para verla entera.`,
      );
    } else {
      // Fuera el `tabindex`: un contenedor que no se desplaza no es un
      // someplace donde se pueda ir con el teclado.
      caja.removeAttribute('role');
      caja.removeAttribute('tabindex');
      caja.removeAttribute('aria-label');
    }
  };

  medir();
  addEventListener('resize', medir, { passive: true });
}

/** Lo que se puede poner de una celda de cabecera en un nombre accesible. */
function cortar(texto: string, maximo: number): string {
  if (!texto) return 'sin título';
  return texto.length > maximo ? `${texto.slice(0, maximo - 3).trimEnd()}…` : texto;
}

/**
 * Todo lo de arriba, sobre el contenido de la página.
 *
 * Se salta lo que ya está listo: si la página se prepara dos veces, los botones
 * no se duplican.
 */
export function realzar(raiz: HTMLElement): void {
  for (const pre of [...raiz.querySelectorAll('pre')]) {
    if (pre.parentElement?.classList.contains('code')) continue;
    boton(pre as HTMLPreElement);
  }
  for (const tabla of [...raiz.querySelectorAll('table')]) {
    if (tabla.parentElement?.classList.contains('desliza')) continue;
    envolver(tabla as HTMLTableElement);
  }
}
