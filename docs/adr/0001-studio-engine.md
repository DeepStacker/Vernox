# ADR 0001 — Design studio engine on proven libraries

- **Status:** accepted (2026-11-05)
- **Scope:** `/studio` (src/components/editor, src/lib/studio, src/workers), production exports (src/lib/exportCAM.ts,
  exportDXF.ts, exportPDF.ts, src/lib/orders/camDocument.ts), shared custom-piece pricing (src/lib/pricing/customPiece.ts)

## Context

The previous studio (~8.7k lines) was hand-written end to end: its own path parser, Bézier sampling, image tracer, glyph
table ("stencil font registry") and validation. It could not shape real fonts (no kerning, no Devanagari), had no polygon
booleans (so it could not tell whether a letter counter would fall out), flattened every sub-path of a DXF into one
polyline, linearly interpolated arcs, and priced pieces with a formula duplicated from the server. The owner asked for a
strong, smooth, lightweight studio that never hangs the browser.

## Decision

Use small, maintained, permissively licensed libraries for each hard problem; keep only domain logic in-house.

| Concern | Choice | Version | License | Size (min / gzip) | Why |
|---|---|---|---|---|---|
| Polygon booleans, offsets, polytree, simplification | `@countertype/clipper2-ts` (Clipper2 port) | 1.5.4 | BSL-1.0 | 98 / 25 kB | Clipper2 is the industry reference for robust integer booleans and offsets; this port tracks upstream 1.5.4 (2025), is TypeScript, tree-shakeable ESM, worker-safe. Replaces simplify-js too (RDP/`simplifyPaths` built in). Rejected: `polygon-clipping` (no offsets), `clipper-lib` (Clipper1, 2014), `clipper2-js` (stale since 2024), paper.js (~200 kB, DOM-oriented). |
| Text → outlines with shaping | `harfbuzzjs` (HarfBuzz WASM) | 0.10.3 | MIT | 9 kB JS + 160 kB gzip WASM, loaded on first text use | Devanagari needs real OpenType shaping (conjuncts, reph, matra reordering, mark positioning) — opentype.js 2.0 does not shape Indic scripts. One engine for every script, with kerning and ligatures. 0.10.x is used instead of 1.x because 1.x's entry uses top-level `await`, which the site's build target (es2020) does not allow; 0.10.3 exposes the same shaping API with an explicit WASM loader. |
| Image tracing | `imagetracerjs` | 1.2.6 | Unlicense | 20 / 6 kB | Pure JS, runs in a Worker, has despeckle (`pathomit`) and smoothing (`ltres`/`qtres`). Potrace (esm-potrace-wasm) traces slightly better but is **GPL-2.0**, which cannot ship in a proprietary storefront. Threshold (Otsu) / invert / speck removal and final simplification are ours + Clipper. |
| SVG path parse / transform | `svgpath` | 2.6.0 | MIT | 13 / 5 kB | Tiny, proven (fontello); normalises arcs/shorthands, applies matrices and `transform` attributes. svg-path-commander is ~5× larger for no benefit here. |
| DXF import | `dxf-parser` | 1.1.2 | MIT | 26 / 8 kB, lazy | Parses LINE/LWPOLYLINE/POLYLINE (bulges)/ARC/CIRCLE/ELLIPSE/SPLINE + header units. Loaded only when a DXF is imported. Also used in tests to verify our DXF output. |
| DXF export | in-house R12 writer (`exportDXF.ts`, ~70 lines) | — | — | — | We need closed POLYLINEs on three layers with mm units. R12 (AC1009) is the dialect every laser CAM reads and needs no handles/OBJECTS section. `dxf-writer` (unmaintained since 2023) defaults to AC1021 and would add a dependency for less control; maker.js is far larger. Output is round-tripped through dxf-parser in tests. |
| Canvas / interaction | `konva` + `react-konva` (Core build: Path, Circle, Rect, Line, Transformer only) | 10.9 / 18.2.16 | MIT | ~50 kB gzip (Core) | Canvas rendering stays at 60 fps with hundreds of paths; built-in Transformer (resize/rotate/multi-select handles), hit detection, touch/pinch support. Fabric.js is larger and imperative-only; a hand-built SVG layer would re-implement transform handles and suffer DOM cost at 200+ complex paths. react-konva 18.x is the line for React 18. |
| Undo / redo | `zustand` + `zundo` | 5.0 / 2.3 | MIT | <1 kB | Snapshot history of the document slice only, bounded (150), with keyed coalescing (a burst of edits to the same field is one step) and paused recording for derived data (text outlines). Immer patches were unnecessary: documents are small and structurally shared. |
| Schema | `zod` (already a dependency) | 3.25 | MIT | shared | Versioned document schema (`schemaVersion: 4`) validated at every trust boundary (orders, saved projects, autosave). |

Design rules that follow from the choice:

- **Derived, not stored, geometry.** The part is always computed: plate ∪ "add" objects − "cut" objects − mounting holes,
  then automatic bridges for loose pieces. At add-to-cart the result is frozen into `production` so orders never depend on
  fonts or future code.
- **Nothing heavy on the main thread.** Manufacturability analysis runs in `geometryWorker` (latest-wins queue); tracing
  in `traceWorker` (stale jobs cancelled by terminating the worker); uploads are decoded and downscaled with
  `createImageBitmap` (max 1000 px side). The drag loop never re-renders React.
- **Code-split by need.** The start screen loads no Konva, WASM, fonts, tracer or DXF code.

## Consequences

- Deleted: `cadDocumentStore`, `cadEngineTypes`, `editorTypes`, `imageProcessing`, `imageTracer`, `manufacturingRules`,
  `vectorGeometry`, `fontRegistry`, `useEditor`, `useEditorState`, `useVectorDocument`, `imageTracerWorker`, and all old
  editor components (DesignCanvas, ToolsPanel, VectorTraceModal, TopBar, PropertiesPanel, ShapePanel,
  StudioOpeningAnimation, EditorContext) with their tests.
- Legacy order designs (VDM 3.0.0) remain exportable through `migrateLegacyDesign` in `camDocument.ts`.
- HarfBuzz WASM (~160 kB gzip) is the largest lazy asset; it is cached after first use. Fonts (self-hosted, OFL) load per
  font on first use; Great Vibes and Pacifico could be subset later to cut ~0.6 MB.
- PDF-vector import is not supported: no small, maintained PDF path parser exists (pdf.js is ~1 MB). Customers can export
  SVG from their PDF tool.
