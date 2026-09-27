import assert from 'node:assert/strict';
import test from 'node:test';

import { esc, md } from './texto.ts';

/**
 * Este archivo es la frontera entre los datos y el HTML. Lo que no se escapa
 * aquí se inyecta en la página; lo que se escapa mal sale con acentos graves
 * sueltos por el texto. Las dos cosas se comprueban.
 */

test('escapa lo que podría inyectar HTML', () => {
  assert.equal(esc('<b>'), '&lt;b&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('data-x="note"'), 'data-x=&quot;note&quot;');
});

test('no inventa etiquetas donde no las hay', () => {
  assert.equal(esc('text="#e7e7e4"'), 'text=&quot;#e7e7e4&quot;');
  assert.equal(md('Nada raro aquí'), 'Nada raro aquí');
});

test('los acentos graves salen como código', () => {
  assert.equal(md('Con `data-kind="note"` se distingue'), 'Con <code>data-kind=&quot;note&quot;</code> se distingue');
  assert.equal(
    md('Estilos: `solid`, `dashed`, `dotted`.'),
    'Estilos: <code>solid</code>, <code>dashed</code>, <code>dotted</code>.',
  );
});

test('el HTML de un dato no puede colarse por la puerta de atrás', () => {
  // El orden importa: si se cambiaran los acentos graves antes de escapar, el
  // `<code>` de un `<code>` inventado por el dato se vería literal… y al revés,
  // un `&lt;script&gt;` dentro de un acento grave se convertiría en una etiqueta.
  assert.equal(md('`<img src=x onerror=1>`'), '<code>&lt;img src=x onerror=1&gt;</code>');
  assert.ok(!md('`<b>`').includes('<b>'));
});

test('un acento grave suelto no rompe nada', () => {
  // Con un número impar de acentos graves no hay pareja: se deja como está.
  assert.equal(md('así `se queda'), 'así `se queda');
  assert.equal(md('`'), '`');
});
