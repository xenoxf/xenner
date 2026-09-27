import assert from 'node:assert/strict';
import test from 'node:test';

import { mapSections, isHeading } from './docSections.ts';

/**
 * El resaltado de la sección se equivoca en silencio: si un `<p>` pertenece a
 * la sección equivocada, quien está leyendo ve encendido el tema anterior y no
 * pasa nada visible que lo delate. Por eso esto se comprueba.
 *
 * Los elementos son objetos con la forma que la función mira (`tagName`, `id`)
 * y no HTMLElement de verdad. `mapSections` no usa `instanceof` a propósito, y
 * así no hace falta ni jsdom ni un DOM global para probarla.
 */

function h(tag: string, id = ''): Element {
  return { tagName: tag.toUpperCase(), id } as unknown as Element;
}

test('un encabezado sin identificador no cuenta', () => {
  assert.equal(isHeading(h('h2', 'con-id')), true);
  assert.equal(isHeading(h('h2', '')), false);
  assert.equal(isHeading(h('p', 'con-id')), false);
  assert.equal(isHeading(h('div', 'con-id')), false);
  // Un encabezado con identificador, pero de nivel que no seguimos, tampoco
  // abre sección: el mapa solo entiende h2 y h3.
  assert.equal(isHeading(h('h1', 'portada')), true);
});

test('lo que hay antes del primer encabezado no pertenece a ninguna sección', () => {
  const hijos = [h('p', 'intro'), h('p', 'lead')];
  const { of, sections } = mapSections(hijos);
  assert.equal(of.size, 0);
  assert.deepEqual(sections, []);
});

test('cada bloque pertenece al encabezado que lo precede', () => {
  const hijos = [
    h('h2', 'uno'),
    h('p', 'a'),
    h('pre', 'b'),
    h('h2', 'dos'),
    h('p', 'c'),
  ];
  const { of, sections } = mapSections(hijos);
  assert.equal(of.get(hijos[1]), 'uno');
  assert.equal(of.get(hijos[2]), 'uno');
  assert.equal(of.get(hijos[4]), 'dos');
  assert.deepEqual(sections, ['uno', 'dos']);
});

test('un apartado apunta a su sección', () => {
  const hijos = [
    h('h2', 'seccion'),
    h('h3', 'apartado-1'),
    h('p', 'a'),
    h('h3', 'apartado-2'),
    h('p', 'b'),
    h('h2', 'otra'),
    h('h3', 'apartado-3'),
  ];
  const { of, parentOf } = mapSections(hijos);
  assert.equal(parentOf.get('apartado-1'), 'seccion');
  assert.equal(parentOf.get('apartado-2'), 'seccion');
  assert.equal(parentOf.get('apartado-3'), 'otra');
  // El contenido entre dos apartados pertenece al último, no a la sección
  // madre: quien lee ese texto quiere ver ese apartado encendido.
  assert.equal(of.get(hijos[2]), 'apartado-1');
  assert.equal(of.get(hijos[4]), 'apartado-2');
});

test('un apartado suelto antes de cualquier sección no se cuelga de nadie', () => {
  const hijos = [h('h3', 'huerfano'), h('p', 'a')];
  const { of, parentOf } = mapSections(hijos);
  assert.equal(parentOf.size, 0);
  assert.equal(of.get(hijos[1]), 'huerfano');
});

test('una sección repetida no aparece dos veces en la lista', () => {
  const hijos = [h('h2', 'a'), h('h2', 'b'), h('h2', 'a')];
  const { sections, headings } = mapSections(hijos);
  assert.deepEqual(sections, ['a', 'b']);
  // Los encabezados sí se listan todos: el orden de lectura es el del
  // documento, duplicados incluidos.
  assert.deepEqual(headings, ['a', 'b', 'a']);
});

test('no falla con una página vacía', () => {
  const { of, parentOf, sections, headings } = mapSections([]);
  assert.equal(of.size, 0);
  assert.equal(parentOf.size, 0);
  assert.deepEqual(sections, []);
  assert.deepEqual(headings, []);
});

test('solo cuentan los hijos directos, no los descendientes', () => {
  // `<main><section><h2>` es un caso real de los que genera un framework.
  // La función recibe los hijos; si mañana mirara descendientes, el `h2` de
  // dentro de `<section>` abriría sección antes de tiempo.
  const hijos = [h('h2', 'uno'), h('section', 'envoltorio'), h('h2', 'dos')];
  const { sections } = mapSections(hijos);
  assert.deepEqual(sections, ['uno', 'dos']);
});
