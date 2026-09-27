import assert from 'node:assert/strict';
import test from 'node:test';

import { tokenizar, type Token } from './docCode.ts';

/**
 * El coloredor toca el texto de los ejemplos, que es lo que la gente copia. La
 * regla que no se puede romper: **reconstruir la línea tiene que dar la línea
 * exactamente igual**. Todo lo demás es decoración.
 */

const texto = (linea: string): string => tokenizar(linea).map((t) => t.texto).join('');
const de = (linea: string, tipo: Token['tipo']): string =>
  tokenizar(linea)
    .filter((t) => t.tipo === tipo)
    .map((t) => t.texto)
    .join('');

test('reconstruye la línea exacta, con cualquier mezcla de trozos', () => {
  const lineas = [
    'text="#e7e7e4"',
    '  background="rgba(32, 32, 32, 0.85)"',
    '  font="Georgia, \'Noto Serif\', serif"',
    '/* mi-tema/custom.css */',
    '[data-x="app"] {',
    '[data-x="editor"] h1        { font-size: 2rem; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  background-image: url(assets/montana.jpg);',
    '  background-size: cover;      /* cubre toda la ventana, recortando */',
    'rm skins/sepia/custom.css',
    'url(assets/montana.jpg)          correcto',
    '# el papel, con un veteado muy suave',
    '  --skin-content-width: 680px;',
    '  overlay="radial-gradient(circle at 12% 8%, rgba(154,91,44,0.07), transparent 45%)"',
  ];
  for (const linea of lineas) {
    assert.equal(texto(linea), linea, `ha cambiado: ${linea}`);
  }
});

test('una almohadilla al principio de la línea es un comentario entero', () => {
  assert.equal(de('# el papel', 'com'), '# el papel');
  assert.deepEqual(tokenizar('# todo'), [{ tipo: 'com', texto: '# todo' }]);
});

test('una almohadilla dentro de un color no es un comentario', () => {
  // El caso que rompe la regla ingenua: `text="#e7e7e4"` no es un comentario.
  assert.equal(de('text="#e7e7e4"', 'com'), '');
  assert.equal(de('text="#e7e7e4"', 'str'), '"#e7e7e4"');
});

test('la clave del principio de la línea se separa de su valor', () => {
  assert.equal(de('  itemHover="rgba(154,91,44,0.10)"', 'clave'), 'itemHover');
  assert.equal(de('name="Sepia"', 'clave'), 'name');
  // Y lo que va antes, la sangría, sigue siendo texto.
  assert.equal(de('  itemHover="x"', 'txt'), '  =');
});

test('una propiedad CSS con dos puntos no es una clave', () => {
  assert.equal(de('  background-size: cover;', 'clave'), '');
  assert.equal(de('  --skin-content-width: 680px;', 'clave'), '');
  assert.equal(de('[data-x="app"] {', 'clave'), '');
});

test('el comentario de bloque va de inicio a cierre aunque cambie de línea', () => {
  const linea = '  border: none;  /* el marco lo pone la imagen */';
  assert.equal(de(linea, 'com'), '/* el marco lo pone la imagen */');
  // Sin cerrar, se lleva el resto: es texto, y no hay dónde más ponerlo.
  assert.equal(de('color: red; /* sin cerrar', 'com'), '/* sin cerrar');
});

test('una cadena con comillas simples dentro de dobles es una sola', () => {
  assert.equal(de('font="Georgia, \'Noto Serif\', serif"', 'str'), '"Georgia, \'Noto Serif\', serif"');
});

test('una comilla suelta no se lleva media página', () => {
  // La línea no cambia nunca, pero tampoco se inventa un final que no está.
  assert.equal(texto('no hay comillas'), 'no hay comillas');
  assert.equal(texto("apostrofe sin cerrar"), "apostrofe sin cerrar");
});

test('las aclaraciones de la página no se tocan', () => {
  // `<span>correcto</span>` va dentro de un elemento, no en un nodo de texto:
  // el coloredor solo recorre nodos de texto, así que eso se deja como está.
  const linea = 'url(assets/montana.jpg)          ';
  assert.equal(texto(linea), linea);
  assert.equal(tokenizar(linea).every((t) => t.tipo === 'txt'), true);
});

test('una línea en blanco no pierde ni un espacio', () => {
  // El tokenizador no descarta nada —eso lo hace quien lo llama, antes de
  // invocarlo—, porque descartar espacios es justo lo que no hay que hacer en
  // un bloque de código donde la sangría es parte del ejemplo.
  assert.equal(texto(''), '');
  assert.equal(texto('   '), '   ');
  assert.equal(texto('\t'), '\t');
});
