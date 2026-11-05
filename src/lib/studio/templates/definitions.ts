/**
 * Built-in parametric templates. Positions are millimetres on the plate; sizes are letter
 * (cap) heights. Each template is deliberately simple to edit: a few fields + a finish.
 */
import { createShape, createText } from '../document';
import { registerTemplate } from './registry';

registerTemplate({
  id: 'house-name',
  name: 'House name plate',
  category: 'name-plate',
  finish: 'black_patina',
  fields: [
    { key: 'name', label: 'Family name', default: 'The Sharmas' },
    { key: 'number', label: 'House number', default: 'B-42' },
  ],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 360, heightMm: 160, cornerRadiusMm: 8 },
    material: { finish: 'black_patina' },
    mounting: { preset: 'corners-4' },
    objects: [
      createText({ text: f.name, fontId: 'abril-fatface', sizeMm: 42, x: 180, y: 70, binding: 'name' }),
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 18, x: 180, y: 122, binding: 'number' }),
    ],
  }),
});

registerTemplate({
  id: 'house-name-hindi',
  name: 'नाम पट्टिका (Hindi)',
  category: 'name-plate',
  finish: 'antique_brass',
  fields: [
    { key: 'name', label: 'नाम', default: 'शर्मा निवास' },
    { key: 'number', label: 'House number', default: '42' },
  ],
  build: f => ({
    plate: { style: 'solid', shapeId: 'arch', widthMm: 320, heightMm: 220, cornerRadiusMm: 0 },
    material: { finish: 'antique_brass' },
    mounting: { preset: 'top-2', insetMm: 30 },
    objects: [
      createText({ text: f.number, fontId: 'yatra-one', sizeMm: 30, x: 160, y: 90, binding: 'number' }),
      createText({ text: f.name, fontId: 'yatra-one', sizeMm: 38, x: 160, y: 160, binding: 'name' }),
    ],
  }),
});

registerTemplate({
  id: 'om-mandala',
  name: 'Om mandala',
  category: 'spiritual',
  finish: 'brass',
  fields: [{ key: 'symbol', label: 'Symbol', default: 'ॐ' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rosette', widthMm: 300, heightMm: 300 },
    material: { finish: 'brass' },
    mounting: { preset: 'center-1', insetMm: 25 },
    objects: [createText({ text: f.symbol, fontId: 'rozha-one', sizeMm: 130, x: 150, y: 160, binding: 'symbol' })],
  }),
});

registerTemplate({
  id: 'office-plaque',
  name: 'Office plaque',
  category: 'office',
  finish: 'stainless',
  fields: [
    { key: 'company', label: 'Company', default: 'ACME STUDIO' },
    { key: 'tagline', label: 'Tagline', default: 'Architecture & Interiors' },
  ],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 450, heightMm: 220, cornerRadiusMm: 4 },
    material: { finish: 'stainless' },
    mounting: { preset: 'corners-4', insetMm: 18 },
    objects: [
      createText({ text: f.company, fontId: 'bebas-neue', sizeMm: 55, letterSpacingMm: 4, x: 225, y: 95, binding: 'company' }),
      createText({ text: f.tagline, fontId: 'poppins-semibold', sizeMm: 16, x: 225, y: 155, binding: 'tagline' }),
    ],
  }),
});

registerTemplate({
  id: 'quote-panel',
  name: 'Quote panel',
  category: 'quote',
  finish: 'gold',
  fields: [{ key: 'quote', label: 'Quote', default: 'Home is where\nlove lives', multiline: true }],
  build: f => ({
    plate: { style: 'frame', shapeId: 'rectangle', widthMm: 600, heightMm: 300, cornerRadiusMm: 0, borderMm: 14 },
    material: { finish: 'gold' },
    mounting: { preset: 'none' },
    objects: [createText({ text: f.quote, fontId: 'pacifico', sizeMm: 48, weld: true, x: 300, y: 150, binding: 'quote' }, 'add')],
  }),
});

registerTemplate({
  id: 'festive-diwali',
  name: 'Shubh Deepawali',
  category: 'festive',
  finish: 'copper',
  fields: [{ key: 'greeting', label: 'Greeting', default: 'Shubh Deepawali' }],
  build: f => ({
    plate: { style: 'none', shapeId: 'rectangle', widthMm: 520, heightMm: 220 },
    material: { finish: 'copper' },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'starburst', widthMm: 60, heightMm: 60, x: 260, y: 45 }, 'add'),
      createText({ text: f.greeting, fontId: 'pacifico', sizeMm: 52, weld: true, x: 260, y: 140, binding: 'greeting' }, 'add'),
    ],
  }),
});
