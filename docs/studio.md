# Design studio (`/studio`)

Engine decisions: [ADR 0001](adr/0001-studio-engine.md). Code: `src/components/editor` (UI), `src/lib/studio` (engine),
`src/workers` (geometry and trace workers).

## For customers (Simple mode — the default)

1. **Start** — pick a template, a blank plate, or upload a logo. "Continue your last design" appears when an autosave exists.
2. **Design** — type into the template fields (long names shrink to fit), tap the canvas to select, drag to move, pull the
   corner handles to resize or the top handle to rotate. The left rail adds text, shapes and uploads; the right panel shows
   the selected item, or the plate & finish when nothing is selected. The pill at the bottom shows checks: red items block
   ordering and come with a fix button (for example **Add bridges** for letter centres that would fall out).
3. **Review** — the finished piece in its metal with a wall shadow, finish, quantity, **Add to cart**.

Phones: the canvas is full screen; tools sit at the bottom and open in a sheet; pinch to zoom, drag with one finger on empty
space to pan, **Edit** opens the selected item.

## For designers and trade (Pro mode)

Switch **Pro** in the header (remembered in this browser). Same document — nothing is lost switching back.

- Rulers (mm), grid (`G`) with snapping, smart guides to the plate and other objects, marquee selection, shift-click.
- Numeric X / Y / angle and sizes in mm (units follow the field suffix), letter height and spacing.
- Per-object role: **Cut out**, **Solid** (added metal) or **Engrave** (score line).
- Align / distribute, booleans (union, subtract, intersect, exclude), offset outline, mirror, mirror copy, group / ungroup,
  lock, hide, rename (Layers panel, `L`), z-order (`[` `]`).
- Import SVG, DXF, PDF or Illustrator `.ai` (see "Import formats" below).
- Every finish and thickness, mounting hole size and inset, auto-bridges on/off.
- Review → **Download** SVG, DXF (nominal), DXF (kerf-compensated) and a PDF sheet of your own design.
- `?` lists every shortcut (undo `Ctrl Z`, redo `Ctrl Shift Z`, duplicate `Ctrl D`, nudge with arrows, zoom `+ −`, fit `0`).

## How a design becomes a part

- **Plate styles:** *solid* (objects are cut out of a plate), *frame* (a border ring; objects are solid metal welded to it),
  *none* (the part is the union of solid objects).
- **Composition** (`compose.ts`): plate ∪ solid objects − cut objects; then, when auto-bridges is on (default), every loose
  piece is connected to its neighbour by straight bridges (two opposite bridges for an enclosed counter); then mounting
  holes are placed at the preset positions, slid inward until they fit inside the metal with edge clearance.
- **Checks** (`manufacturability.ts`, run in a worker 120 ms after the last edit): empty design, size outside
  100 mm … 3000 × 1500 mm (error), loose pieces (error), metal thinner than the minimum web, gaps narrower than the minimum
  slot, holes below the minimum hole, letters below the minimum height, cut-outs crossing the plate edge, no room for
  mounting holes (warnings).
- **Rules per material** (`materials.ts`): finish → substrate (mild steel, stainless, brass, copper, corten) and thickness
  → kerf, minimum web, minimum hole, edge clearance from the workshop's fiber-laser table; bridge width = 1.5 × minimum web
  (≥ 2 mm); minimum letter height = 8 × minimum web (≥ 12 mm). Override per substrate in `settings/store.studioMaterials`,
  e.g. `{ "mild_steel": { "bridgeMm": 3, "minTextMm": 15 } }` (millimetres; invalid values are ignored).
- **Price** (`src/lib/pricing/customPiece.ts`, shared with the server): max(minimum, setup + width_cm × height_cm × rate) for
  the part's bounding box in whole millimetres, per finish, with `settings/store.customPieces` overrides. Lead time:
  `settings/store.customLeadTimeDays` (default 7).

## Orders and production

Add to cart stores a cart line `{ productId: 'custom-bespoke', widthMm, heightMm, finish, quantity, customDesignRef,
customDesignThumb }`. `customDesignRef` is the design document with `production` — the frozen cut contours in cut order
(inner contours deepest first, score lines, outer perimeters last), nominal size, plus kerf, substrate and thickness. The
server re-prices from width, height and finish. The admin Production console exports those contours
(`src/lib/orders/camDownload.ts`): DXF R12 in mm with layers `1_CUT_INNER`, `2_SCORE`, `3_CUT_OUTER`; SVG in mm with the same
groups; a PDF sheet. Files are nominal (the CAM software applies its kerf offset); kerf is printed on the sheet.

## Developer reference

### Document schema (v4)

`src/lib/studio/schema.ts` (zod; `parseStudioDocument`, `studioDocumentSchema`). Millimetres, plate at (0,0)–(w,h), y down.

```ts
{
  schemaVersion: 4, id, name, createdAt, updatedAt,
  plate: { style: 'solid' | 'frame' | 'none', shapeId, widthMm, heightMm, cornerRadiusMm, borderMm },
  material: { finish /* server finish id */, thicknessMm },
  mounting: { preset: 'none' | 'top-2' | 'corners-4' | 'center-1', diameterMm, insetMm },
  manufacturing: { autoBridges, bridgeWidthMm? },
  objects: Array<                      // z-order, bottom first; geometry local & centred, placed by x, y, rotation, scaleX/Y
    | { kind: 'text', text, fontId, sizeMm /* cap height */, letterSpacingMm, lineHeight, align, weld, binding?, outline? }
    | { kind: 'shape', shapeId, widthMm, heightMm, cornerRadiusMm }
    | { kind: 'path', d, source? }
    | { kind: 'hole', diameterMm }
  > & { id, op: 'cut' | 'add' | 'score', x, y, rotation, scaleX, scaleY, locked?, hidden?, groupId?, name? },
  template?: { id, fields },
  production?: { generatedAt, widthMm, heightMm, kerfMm, substrate, thicknessMm, finish,
                 contours: { role: 'inner' | 'outer' | 'score', d }[] },
}
```

Migrations: legacy order designs (VDM `version: '3.0.0'`) → `migrateLegacyDesign` in `src/lib/orders/camDocument.ts`;
legacy saved projects (`metalshape-projects`) → plate-only documents in `src/lib/projectStorage.ts`. Bump `schemaVersion`
and add a migration for any breaking change.

### Headless API — `src/lib/studio/api.ts`

`createDocument`, `parseStudioDocument`, `applyTemplate(id, fields?, { finish, widthMm, heightMm })`,
`applyTemplateBatch(id, rows)`, `setTemplateField`, `addText` (async, shapes the outline), `addShape`, `addHole`, `addPath`,
`addImage(doc, imageData, { widthMm, trace })` (async), `ensureOutlines`, `resizePlate`, `compose`, `validate` →
`{ composition, analysis: { issues, stats, orderable } }`, `price` (same function as the server), `toProduction`,
`exportSVG`, `exportDXF`, `getDesignOutlineForPreview` (even-odd outline for the wall preview), `serializeForOrder`,
`toCartLine`. Each accepts an optional context `{ rates, limits, cutRuleOverrides }`. In Node, call
`configureTextEngine({ loadWasm, loadFont })` first (see `src/lib/studio/__tests__/testFonts.ts`).

### Import formats

`src/lib/studio/import/`. Each importer returns one path in millimetres centred on (0,0); the studio places it at its
true size, or fits it to 60 % of the plate when larger.

- **SVG** (`importSvg`): paths and basic shapes, nested transforms, real-world units.
- **DXF** (`importDxf`): lines, polylines with bulges, arcs, circles, ellipses, splines; `$INSUNITS` honoured.
- **PDF and Illustrator `.ai`** (`importPdf`): first page only. pdf.js interprets the page; the operator list is walked with
  the current transformation matrix and the viewport transform (y flip, MediaBox origin, /Rotate), collecting filled and
  stroked paths (moveTo, lineTo, curveTo, rectangle, closePath) in points, converted to mm (1 pt = 25.4/72 mm). Clip-only
  paths and a page-sized background rectangle are skipped. An `.ai` file is a PDF only when saved with "Create PDF
  Compatible File"; older or PostScript-based files get a message. A raster-only PDF (scan or placed photo) is refused
  with a pointer to image tracing; a PDF with live text and no outlines asks for "Create Outlines". Limits: 30 MB,
  first page, no gradients or patterns (paths are cut lines, colour is ignored), no password-protected files.
  pdf.js (`pdfjs-dist`, pinned) is loaded with a dynamic `import()` on the first PDF import, from `importPdf.ts`, which is
  itself only imported lazily from `components/editor/actions.ts`; it is not in the storefront entry chunk. The path
  operand layout (`constructPath`: `[op, [drawOps], minMax]`) is that of the pinned version; check it when upgrading
  (`__tests__/importPdf.test.ts` builds real PDFs with pdf-lib).
- **EPS** is not supported (PostScript): the message says to export SVG or PDF.

### Templates

The registry is `src/lib/studio/templates/` (`registry.ts`: types, categories, `registerTemplate`; `definitions.ts`: the
built-in templates). Categories (gallery filter chips in the Start screen and the Templates panel): Name plates,
Spiritual, Office, Shop & signage, Gifts & kids, Wall decor, Quotes, Festive.

Built in: house name plate, Hindi name plate (arch), round and oval name plates, arch name plate with Om, door number
plate; Om mandala, Swastik Shubh Labh, cross blessing panel, Islamic star panel; office plaque, doctor / cabin door sign;
cafe sign, shop name board; house-warming gift, wedding gift, kids room name sign; family tree panel, jali screen panel;
quote panel; Shubh Deepawali.

Not offered, because the asset is not bundled: Gujarati, Marathi (Devanagari works) and Tamil name plates (no
Gujarati or Tamil font is bundled), Ganesha, Khanda, Ik Onkar and Allah calligraphy (no licensed vector or Gurmukhi /
Arabic font). The Islamic panel uses an eight-pointed star and Latin text for that reason. To add one: bundle an OFL font
(see "Font" below) or a vector, then register a template.

**Template rules.** A template must build with zero manufacturability issues at its default finish and thickness for its
default text and for each entry of its `samples` (realistic edits); `__tests__/templates.test.ts` builds every registered
template through the real pipeline (HarfBuzz shaping with the bundled fonts, `compose`, `analyzeDocument`) and fails on any
issue, so a template cannot ship broken. What that taught (measured, Poppins SemiBold):

- Letters below about 24 mm cap height close their counters on 2 mm-web finishes (black, copper, corten); 22 mm on
  brass/gold, 20 mm on stainless. Keep every line at least that tall, and remember auto-fit shrinks long text.
- Abril Fatface and Pacifico (hairlines, near-touching loops) and Bebas Neue (thin stems) do not survive any
  default finish; they stay in the font list for Pro users but no template uses them. Rozha One and Yatra One are fine
  for short, large display text (the Om glyph); Poppins is the workhorse in Latin and Devanagari.
- Text added as metal (`add`) leaves loose letters that auto-bridges connect with many narrow gaps; lettering is cut out of
  a solid plate instead.
- Known limit of the checks, not of the templates: the pointed spike of plate metal inside a cut-out **M, N, W, V, v, w**
  is flagged as thin metal in every bundled font (N only on brass, gold and stainless). Default and sample text avoid those
  letters; a customer typing such a name sees a warning (it does not block ordering). Raise with the workshop whether to
  relax the check or accept the spike; the rule lives in `manufacturability.ts` (extent threshold of the opening residue).
- Library shapes such as heart and cloud fill only part of their box; place text by the real outline.

### Extending

- **Template:** add a `registerTemplate({...})` entry in `src/lib/studio/templates/definitions.ts` (fields, `samples` of realistic edits, pure `build`); run `npx vitest run src/lib/studio/__tests__/templates.test.ts`.
- **Font:** drop the file (with its licence) in `public/fonts/studio/` and add an entry to `src/lib/studio/text/fonts.ts`.
- **Finish / material rule:** `FINISH_PRESETS` / `MACHINE.gauges` in `src/lib/studio/materials.ts`; only server-priced
  finish ids are offered.
- **Tools per mode:** `src/lib/studio/modes.ts`.
- **Strings:** `src/lib/studio/i18n.ts` (English complete; add a `hi` dictionary — missing keys fall back to English).

### Deep links

`/studio?template=house-name&text=The%20Iyers&finish=brass&w=400&h=180` — `text` fills the template's first field; without
`template`, a blank plate is created with that text, finish and size.

### Batch (CSV) for business buyers

The **Batch** button in the studio header opens a screen for many personalised variants of one design (door plates,
apartment numbers). Code: `src/lib/studio/batch/` (pure logic, tested) and `src/components/editor/batch/` (UI).

- **Variables:** each text object gets an optional template such as `{name}` or `Flat {block}-{number}`; `{field}` is
  replaced by the CSV cell (column names match case-insensitively). Bindings live in `batchStore.ts`, not in the design.
- **Sheet:** paste or upload CSV (`csv.ts`: BOM, CRLF, quotes, comma/semicolon/tab, first row = headers, max 500 rows).
  An optional `qty` (or `quantity`) column gives pieces per row (1 to 100); blank means 1.
- **Checks per row:** empty row, empty variable value, bad or too-high quantity (`plan.ts`, instant); text too long for
  the plate, blocking manufacturability errors and pricing problems (`evaluate.ts`, geometry worker). Flagged rows are
  skipped when adding to the cart.
- **Performance:** rows are grouped into distinct designs (identical resolved text is one design; quantities add up).
  Each design is evaluated once, one at a time in the geometry worker with a yield between jobs, rows on screen first.
  The table is virtualised (fixed 60 px rows).
- **Price:** `quoteCustomPiece` per design (the function the server uses), total = unit price x quantity. The server
  still re-prices every line from width, height and finish at checkout.
- **Cart:** one custom line per distinct design via `toCartLine`, so each line carries its own `customDesignRef` (the
  existing order storage; nothing new). Quantity above 100 for one design is split into several lines. Checkout limits
  come from `src/lib/pricing/orderLimits.ts` (also used by `api/_lib/checkout.ts`): 50 lines per order, 100 per line,
  200,000 design characters per line and 700,000 per order. Lines are added until a limit is reached; the screen says
  how many did not fit so the buyer can check out and add the rest.
- **Production:** the order detail in the production console has "All lines (zip)" for DXF, SVG or PDF
  (`downloadOrderZip` in `src/lib/orders/camDownload.ts`, `zipStore.ts`): one numbered file per order line. The zip is
  written in-house (STORE method, about 100 lines) instead of adding a dependency.

Not handled: text is never auto-shrunk (a too-long row is flagged so every plate keeps the same letter size);
the bound text must be a text object, not a traced image.

### Not built yet

Path node editing, draggable ruler guides, multiple artboards, EPS and multi-page PDF import, the Hindi string dictionary.
