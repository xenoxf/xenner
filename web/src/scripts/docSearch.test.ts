import assert from 'node:assert/strict';
import test from 'node:test';

import { buscar, plegar, type DocEntry } from './docSearch.ts';

/**
 * El buscador es la parte de /doc que más se nota cuando falla: si «data-x» no
 * aparece, quien lo busca no sabe si está en la página de CSS o si el buscador
 * está roto. Estas pruebas se amplían cada vez que se añada una página.
 */

const INDICE: DocEntry[] = [
  { label: 'Empezar aquí', group: 'La documentación', href: '/doc/', detail: 'Qué es una skin' },
  { label: 'El formato', group: 'La documentación', href: '/doc/formato/', detail: 'Una línea por ajuste' },
  { label: 'Los colores', group: 'El formato', href: '/doc/formato/#colores', detail: 'Hexadecimal y rgba' },
  { label: 'Todas las claves', group: 'La documentación', href: '/doc/claves/', detail: 'Painless' },
  {
    label: 'A qué se puede agarrar: data-x',
    group: 'Cambiarlo todo con CSS',
    href: '/doc/css/#a-que-se-puede-agarrar-data-x',
    detail: 'Cada trozo de la ventana',
  },
  {
    label: 'Tipografías',
    group: 'Imágenes, iconos y tipografías',
    href: '/doc/imagenes/#tipografias',
    detail: 'Se puede llevar una letra dentro de la skin',
  },
  {
    label: 'Una imagen no se ve',
    group: 'Si no funciona',
    href: '/doc/problemas/#una-imagen-no-se-ve',
    detail: 'El nombre coincide exactamente',
  },
];

test('plegar quita acentos y baja las mayúsculas', () => {
  assert.equal(plegar('Imágenes, iconos SVG y tipografías'), 'imagenes, iconos svg y tipografias');
});

test('plegar trata igual la vocal con tilde que sin ella', () => {
  // 'á' puede venir como un solo carácter (U+00E1) o como 'a' + acento. Las dos
  // formas tienen que plegar a lo mismo.
  const precompuesta = plegar('áéíóúñÁÉ');
  const descompuesta = plegar('áéíóúñÁÉ');
  assert.equal(precompuesta, descompuesta);
  assert.equal(precompuesta, 'aeiounae');
});

test('buscar encuentra por el título, sin tildes ni mayúsculas', () => {
  const hits = buscar(INDICE, 'TIPOGRAFIAS');
  assert.equal(hits[0]?.label, 'Tipografías');
  assert.equal(hits[0]?.href, '/doc/imagenes/#tipografias');
});

test('buscar encuentra un apartado y devuelve a dónde lleva', () => {
  // La duda real: en qué página está esto.
  const hits = buscar(INDICE, 'data-x');
  assert.equal(hits[0]?.href, '/doc/css/#a-que-se-puede-agarrar-data-x');
  assert.equal(hits[0]?.group, 'Cambiarlo todo con CSS');
});

test('buscar encuentra dentro de la entradilla de la página', () => {
  const hits = buscar(INDICE, 'rgba');
  assert.equal(hits[0]?.label, 'Los colores');
});

test('buscar cuenta los términos: si falta uno, no hay resultado', () => {
  assert.equal(buscar(INDICE, 'colores hexagonales').length, 0);
  // Y no es que la primera palabra no valiera: el AND es por palabra, y aquí
  // cada término sale en un sitio distinto del mismo apartado.
  const hits = buscar(INDICE, 'iconos letra');
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.label, 'Tipografías');
});

test('buscar pone delante lo que más se parece al título', () => {
  const hits = buscar(INDICE, 'imagen');
  assert.equal(hits[0]?.label, 'Una imagen no se ve');
  assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0));
});

test('buscar respeta el límite de resultados', () => {
  assert.ok(buscar(INDICE, 'la', 2).length <= 2);
});

test('una consulta vacía no devuelve nada, tampoco de espacios', () => {
  assert.deepEqual(buscar(INDICE, ''), []);
  assert.deepEqual(buscar(INDICE, '   '), []);
});

test('buscar no muta el índice', () => {
  const copia = JSON.stringify(INDICE);
  buscar(INDICE, 'imagen');
  assert.equal(JSON.stringify(INDICE), copia);
});
