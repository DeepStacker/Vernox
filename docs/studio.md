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
- Import SVG or DXF (lines, polylines with bulges, arcs, circles, ellipses, splines; DXF units honoured).
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

### Extending

- **Template:** add a `registerTemplate({...})` entry in `src/lib/studio/templates/definitions.ts` (fields + pure `build`).
- **Font:** drop the file (with its licence) in `public/fonts/studio/` and add an entry to `src/lib/studio/text/fonts.ts`.
- **Finish / material rule:** `FINISH_PRESETS` / `MACHINE.gauges` in `src/lib/studio/materials.ts`; only server-priced
  finish ids are offered.
- **Tools per mode:** `src/lib/studio/modes.ts`.
- **Strings:** `src/lib/studio/i18n.ts` (English complete; add a `hi` dictionary — missing keys fall back to English).

### Deep links

`/studio?template=house-name&text=The%20Iyers&finish=brass&w=400&h=180` — `text` fills the template's first field; without
`template`, a blank plate is created with that text, finish and size.

### Not built yet

CSV batch UI (the API has `applyTemplateBatch`; the cart has no bulk-variant line yet, so batches should go to `/trade`
as JSON), path node editing, draggable ruler guides, multiple artboards, PDF-vector import, the Hindi string dictionary.
