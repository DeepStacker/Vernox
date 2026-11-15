/**
 * Built-in parametric templates. Positions are millimetres on the plate; sizes are letter
 * (cap) heights. Each template is deliberately simple to edit: a few fields + a finish.
 *
 * Every template must build clean (no manufacturability issues) at its default finish and
 * thickness, for its default text and for each entry in `samples`; templates.test.ts
 * enforces it with the real fonts. Rules of thumb that follow from the checks:
 *  - Poppins SemiBold is the workhorse (sturdy strokes in Latin and Devanagari). Letters under
 *    about 24 mm cap height close their counters on 2 mm-web finishes (black, copper, corten),
 *    so every line is at least that tall; Abril Fatface and Pacifico have hairlines and
 *    near-touching loops that never survive cutting, so they are not used.
 *  - Rozha One (welded) carries the decorative lines of the "add metal" quote and festive
 *    templates; Yatra One carries the Om glyph.
 *  - Known limit: the pointed metal wedge inside a cut-out M, N, W, v or w is flagged as thin
 *    metal in any font, so default and sample text avoids them (docs/studio.md, "Template rules").
 *  - Shapes from the library fill only part of their box (heart, cloud), so text is placed
 *    inside the real outline, not the box.
 */
import { createShape, createText } from '../document';
import type { StudioObject } from '../schema';
import { registerTemplate } from './registry';

/** Evenly spaced copies of a shape, centred in a cols x rows grid (jali patterns). */
function shapeGrid(shapeId: string, cols: number, rows: number, pitch: number, size: number, cx: number, cy: number, op: 'cut' | 'add'): StudioObject[] {
  const out: StudioObject[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(createShape({ shapeId, widthMm: size, heightMm: size, x: cx + (c - (cols - 1) / 2) * pitch, y: cy + (r - (rows - 1) / 2) * pitch }, op));
    }
  }
  return out;
}

// ---------- name plates ----------

registerTemplate({
  id: 'house-name',
  name: 'House name plate',
  category: 'name-plate',
  finish: 'black_patina',
  fields: [
    { key: 'name', label: 'Family name', default: 'The Sharmas' },
    { key: 'number', label: 'House number', default: 'B-42' },
  ],
  samples: [{ name: 'The Iyer Family' }, { name: 'Reddy Nilayam', number: 'Flat 1204' }, { name: 'Gupta Sadan', number: '7/12' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 420, heightMm: 190, cornerRadiusMm: 8 },
    material: { finish: 'black_patina' },
    mounting: { preset: 'corners-4' },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 40, x: 210, y: 82, binding: 'name' }),
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 26, x: 210, y: 144, binding: 'number' }),
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
  samples: [{ name: 'वेंकटरमण निवास' }, { name: 'श्री गुप्ता परिवार', number: '7/12' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'arch', widthMm: 320, heightMm: 220, cornerRadiusMm: 0 },
    material: { finish: 'antique_brass' },
    mounting: { preset: 'top-2', insetMm: 30 },
    objects: [
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 30, x: 160, y: 90, binding: 'number' }),
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 36, x: 160, y: 160, binding: 'name' }),
    ],
  }),
});

registerTemplate({
  id: 'name-plate-round',
  name: 'Round name plate',
  category: 'name-plate',
  finish: 'antique_brass',
  fields: [
    { key: 'name', label: 'Family name', default: 'The Sharmas' },
    { key: 'tagline', label: 'Line below', default: 'Est. 2024' },
  ],
  samples: [{ name: 'The Iyer Family' }, { name: 'Gupta Sadan', tagline: 'Blessed' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'circle', widthMm: 340, heightMm: 340 },
    material: { finish: 'antique_brass' },
    mounting: { preset: 'top-2', insetMm: 26 },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 34, x: 170, y: 158, binding: 'name' }),
      createText({ text: f.tagline, fontId: 'poppins-semibold', sizeMm: 24, x: 170, y: 222, binding: 'tagline' }),
    ],
  }),
});

registerTemplate({
  id: 'name-plate-oval',
  name: 'Oval name plate',
  category: 'name-plate',
  finish: 'black_patina',
  fields: [
    { key: 'name', label: 'Family name', default: 'The Sharmas' },
    { key: 'number', label: 'House number', default: 'B-42' },
  ],
  samples: [{ name: 'The Iyer Family' }, { name: 'Reddy Nilayam', number: '7/12' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'oval', widthMm: 420, heightMm: 230 },
    material: { finish: 'black_patina' },
    mounting: { preset: 'none' },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 36, x: 210, y: 98, binding: 'name' }),
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 26, x: 210, y: 156, binding: 'number' }),
    ],
  }),
});

registerTemplate({
  id: 'name-plate-arch-om',
  name: 'Arch name plate with Om',
  category: 'name-plate',
  finish: 'brass',
  fields: [
    { key: 'name', label: 'Family name', default: 'The Sharmas' },
    { key: 'number', label: 'House number', default: 'B-42' },
  ],
  samples: [{ name: 'The Iyer Family' }, { name: 'Gupta Sadan', number: '7/12' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'arch', widthMm: 320, heightMm: 420 },
    material: { finish: 'brass' },
    mounting: { preset: 'none' },
    objects: [
      createText({ text: 'ॐ', fontId: 'yatra-one', sizeMm: 80, x: 160, y: 125 }),
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 30, x: 160, y: 245, binding: 'name' }),
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 24, x: 160, y: 310, binding: 'number' }),
    ],
  }),
});

registerTemplate({
  id: 'door-number',
  name: 'Door number plate',
  category: 'name-plate',
  finish: 'stainless',
  fields: [
    { key: 'number', label: 'Door number', default: '204' },
    { key: 'label', label: 'Label', default: 'FLAT' },
  ],
  samples: [{ number: '1204' }, { number: 'B-12', label: 'BLOCK' }, { number: '7/12', label: 'HOUSE' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 240, heightMm: 140, cornerRadiusMm: 10 },
    material: { finish: 'stainless' },
    mounting: { preset: 'corners-4', insetMm: 14 },
    objects: [
      createText({ text: f.label, fontId: 'poppins-semibold', sizeMm: 20, letterSpacingMm: 3, x: 120, y: 40, binding: 'label' }),
      createText({ text: f.number, fontId: 'poppins-semibold', sizeMm: 48, x: 120, y: 92, binding: 'number' }),
    ],
  }),
});

// ---------- spiritual ----------

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
    objects: [createText({ text: f.symbol, fontId: 'yatra-one', sizeMm: 130, x: 150, y: 160, binding: 'symbol' })],
  }),
});

registerTemplate({
  id: 'swastik-shubh-labh',
  name: 'Swastik Shubh Labh',
  category: 'spiritual',
  finish: 'antique_brass',
  fields: [{ key: 'text', label: 'Blessing', default: 'शुभ लाभ' }],
  samples: [{ text: 'श्री गणेशाय नमः' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rosette', widthMm: 360, heightMm: 360 },
    material: { finish: 'antique_brass' },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'swastik', widthMm: 130, heightMm: 130, x: 180, y: 120 }),
      createText({ text: f.text, fontId: 'poppins-semibold', sizeMm: 34, x: 180, y: 245, binding: 'text' }),
    ],
  }),
});

registerTemplate({
  id: 'cross-blessing',
  name: 'Cross blessing panel',
  category: 'spiritual',
  finish: 'stainless',
  fields: [{ key: 'text', label: 'Blessing', default: 'God bless this home' }],
  samples: [{ text: 'Bless this home' }, { text: 'Jesus is Lord' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'arch', widthMm: 400, heightMm: 470 },
    material: { finish: 'stainless' },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'cross', widthMm: 130, heightMm: 185, x: 200, y: 180 }),
      createText({ text: f.text, fontId: 'poppins-semibold', sizeMm: 26, x: 200, y: 360, binding: 'text' }),
    ],
  }),
});

registerTemplate({
  id: 'islamic-star-panel',
  name: 'Islamic star panel',
  category: 'spiritual',
  finish: 'copper',
  fields: [{ key: 'text', label: 'Blessing', default: 'Bismillah' }],
  samples: [{ text: 'Barakah' }, { text: 'Shukran' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rosette', widthMm: 360, heightMm: 360 },
    material: { finish: 'copper' },
    mounting: { preset: 'none' },
    objects: [
      // Eight-pointed star = two overlapping squares, one turned 45 degrees (cut shapes union).
      createShape({ shapeId: 'square', widthMm: 110, heightMm: 110, x: 180, y: 120 }),
      createShape({ shapeId: 'square', widthMm: 110, heightMm: 110, x: 180, y: 120, rotation: 45 }),
      createText({ text: f.text, fontId: 'poppins-semibold', sizeMm: 30, x: 180, y: 250, binding: 'text' }),
    ],
  }),
});

// ---------- office ----------

registerTemplate({
  id: 'office-plaque',
  name: 'Office plaque',
  category: 'office',
  finish: 'stainless',
  fields: [
    { key: 'company', label: 'Company', default: 'KAPOOR & CO' },
    { key: 'tagline', label: 'Tagline', default: 'Architecture & Interiors' },
  ],
  samples: [{ company: 'RAO ASSOCIATES' }, { company: 'LOTUS STUDIO', tagline: 'Interiors and Landscape' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 480, heightMm: 220, cornerRadiusMm: 4 },
    material: { finish: 'stainless' },
    mounting: { preset: 'corners-4', insetMm: 18 },
    objects: [
      createText({ text: f.company, fontId: 'poppins-semibold', sizeMm: 50, letterSpacingMm: 4, x: 240, y: 92, binding: 'company' }),
      createText({ text: f.tagline, fontId: 'poppins-semibold', sizeMm: 22, x: 240, y: 158, binding: 'tagline' }),
    ],
  }),
});

registerTemplate({
  id: 'office-door-sign',
  name: 'Doctor / cabin door sign',
  category: 'office',
  finish: 'brass',
  fields: [
    { key: 'name', label: 'Name', default: 'Dr. Anita Rao' },
    { key: 'role', label: 'Role', default: 'Consultant Physician' },
  ],
  samples: [{ name: 'Dr. Suresh Kulkarni', role: 'Pediatrician' }, { name: 'Ar. Priya Shah', role: 'Principal Architect' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 440, heightMm: 150, cornerRadiusMm: 6 },
    material: { finish: 'brass' },
    mounting: { preset: 'corners-4', insetMm: 14 },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 32, x: 220, y: 58, binding: 'name' }),
      createText({ text: f.role, fontId: 'poppins-semibold', sizeMm: 22, x: 220, y: 108, binding: 'role' }),
    ],
  }),
});

// ---------- shop and signage ----------

registerTemplate({
  id: 'cafe-sign',
  name: 'Café sign',
  category: 'signage',
  finish: 'corten_rust',
  fields: [
    { key: 'name', label: 'Café name', default: 'LOTUS CAFE' },
    { key: 'tagline', label: 'Tagline', default: 'Fresh coffee daily' },
  ],
  samples: [{ name: 'COFFEE HOUSE' }, { name: 'THE COFFEE SHOP', tagline: 'Hand roasted daily' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 620, heightMm: 250, cornerRadiusMm: 16 },
    material: { finish: 'corten_rust' },
    mounting: { preset: 'corners-4', insetMm: 18 },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 56, letterSpacingMm: 5, x: 310, y: 100, binding: 'name' }),
      createText({ text: f.tagline, fontId: 'poppins-semibold', sizeMm: 26, letterSpacingMm: 1, x: 310, y: 178, binding: 'tagline' }),
    ],
  }),
});

registerTemplate({
  id: 'shop-sign',
  name: 'Shop name board',
  category: 'signage',
  finish: 'gold',
  fields: [
    { key: 'name', label: 'Shop name', default: 'Sharma Stores' },
    { key: 'line', label: 'Line below', default: 'Groceries and daily needs' },
  ],
  samples: [{ name: 'Gupta General Store' }, { name: 'Balaji Fabrics', line: 'Sarees and suit pieces' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 760, heightMm: 260, cornerRadiusMm: 10 },
    material: { finish: 'gold' },
    mounting: { preset: 'corners-4', insetMm: 20 },
    objects: [
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 58, x: 380, y: 108, binding: 'name' }),
      createText({ text: f.line, fontId: 'poppins-semibold', sizeMm: 26, x: 380, y: 190, binding: 'line' }),
    ],
  }),
});

// ---------- gifts and kids ----------

registerTemplate({
  id: 'housewarming-gift',
  name: 'House-warming gift',
  category: 'gift',
  finish: 'antique_brass',
  fields: [
    { key: 'title', label: 'Heading', default: 'Happy Home' },
    { key: 'names', label: 'Names', default: 'Rohan and Diya' },
  ],
  samples: [{ title: 'Bless This Home', names: 'The Iyer Family' }, { title: 'Griha Laxmi', names: 'Rohan and Priya' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'house', widthMm: 420, heightMm: 360 },
    material: { finish: 'antique_brass' },
    mounting: { preset: 'none' },
    objects: [
      createText({ text: f.title, fontId: 'poppins-semibold', sizeMm: 36, x: 210, y: 205, binding: 'title' }),
      createText({ text: f.names, fontId: 'poppins-semibold', sizeMm: 24, x: 210, y: 275, binding: 'names' }),
    ],
  }),
});

registerTemplate({
  id: 'wedding-gift',
  name: 'Wedding gift',
  category: 'gift',
  finish: 'gold',
  fields: [
    { key: 'names', label: 'Names', default: 'Rohan and Diya' },
    { key: 'date', label: 'Date', default: '14 . 02 . 2026' },
  ],
  samples: [{ names: 'Aditya and Priya' }, { names: 'Siddharth and Aditi', date: '21 . 12 . 2026' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'oval', widthMm: 440, heightMm: 300 },
    material: { finish: 'gold' },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'heart', widthMm: 70, heightMm: 64, x: 220, y: 66 }),
      createText({ text: f.names, fontId: 'poppins-semibold', sizeMm: 30, x: 220, y: 150, binding: 'names' }),
      createText({ text: f.date, fontId: 'poppins-semibold', sizeMm: 24, x: 220, y: 212, binding: 'date' }),
    ],
  }),
});

registerTemplate({
  id: 'kids-room-cloud',
  name: 'Kids room name sign',
  category: 'gift',
  finish: 'copper',
  fields: [{ key: 'name', label: 'Child’s name', default: 'Aaryan' }],
  samples: [{ name: 'Anaya' }, { name: 'Ishaan' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'cloud', widthMm: 560, heightMm: 420 },
    material: { finish: 'copper' },
    mounting: { preset: 'none' },
    objects: [createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 50, x: 280, y: 162, binding: 'name' })],
  }),
});

// ---------- wall decor ----------

registerTemplate({
  id: 'family-tree',
  name: 'Family tree panel',
  category: 'decor',
  finish: 'black_patina',
  fields: [{ key: 'name', label: 'Family name', default: 'The Sharmas' }],
  samples: [{ name: 'The Iyer Family' }, { name: 'The Joshi Family' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'arch', widthMm: 400, heightMm: 540 },
    material: { finish: 'black_patina' },
    mounting: { preset: 'none' },
    objects: [
      // Crown of heart-shaped leaves, trunk below, family name at the foot.
      ...[[150, 130], [250, 130], [100, 195], [200, 195], [300, 195], [150, 260], [250, 260]].map(([x, y]) => createShape({ shapeId: 'heart', widthMm: 64, heightMm: 58, x, y })),
      createShape({ shapeId: 'trapezoid', widthMm: 56, heightMm: 120, x: 200, y: 350 }),
      createText({ text: f.name, fontId: 'poppins-semibold', sizeMm: 30, x: 200, y: 455, binding: 'name' }),
    ],
  }),
});

registerTemplate({
  id: 'jali-panel',
  name: 'Jali screen panel',
  category: 'decor',
  finish: 'black_patina',
  fields: [],
  build: () => ({
    plate: { style: 'solid', shapeId: 'square', widthMm: 440, heightMm: 440, cornerRadiusMm: 0 },
    material: { finish: 'black_patina' },
    mounting: { preset: 'corners-4', insetMm: 16 },
    objects: [
      ...shapeGrid('octagon', 4, 4, 92, 70, 220, 220, 'cut'),
      ...shapeGrid('diamond', 3, 3, 92, 34, 220, 220, 'cut'),
    ],
  }),
});

// ---------- quotes and festive ----------

registerTemplate({
  id: 'quote-panel',
  name: 'Quote panel',
  category: 'quote',
  finish: 'gold',
  fields: [{ key: 'quote', label: 'Quote', default: 'Bless this home\nand all in it', multiline: true }],
  samples: [{ quote: 'Be grateful,\nbe kind' }, { quote: 'Family is\nhome' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 640, heightMm: 300, cornerRadiusMm: 12 },
    material: { finish: 'gold' },
    mounting: { preset: 'corners-4', insetMm: 18 },
    objects: [createText({ text: f.quote, fontId: 'poppins-semibold', sizeMm: 46, x: 320, y: 150, binding: 'quote' })],
  }),
});

registerTemplate({
  id: 'festive-diwali',
  name: 'Shubh Deepawali',
  category: 'festive',
  finish: 'copper',
  fields: [{ key: 'greeting', label: 'Greeting', default: 'शुभ दीपावली' }],
  samples: [{ greeting: 'शुभ नवरात्रि' }, { greeting: 'Happy Holi' }],
  build: f => ({
    plate: { style: 'solid', shapeId: 'oval', widthMm: 560, heightMm: 300 },
    material: { finish: 'copper' },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'starburst', widthMm: 56, heightMm: 56, x: 280, y: 66 }),
      createText({ text: f.greeting, fontId: 'poppins-semibold', sizeMm: 44, x: 280, y: 175, binding: 'greeting' }),
    ],
  }),
});
