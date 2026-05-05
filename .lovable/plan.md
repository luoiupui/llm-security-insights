## Two distinct problems, two distinct fixes

### Problem 1 — Word-compatible
Word's SVG engine is much stricter than draw.io. Inspecting `handleDownloadSvg` and the live `<svg>` in `src/pages/KGConstruction.tsx` (lines 480–507, 793–897), the breakage comes from:
1. **Framer-motion residue** on the cloned DOM. Every node/edge is a `motion.*`; `cloneNode(true)` may snapshot `style="opacity:0; transform: scale(0)..."` mid-animation → invisible in Word. draw.io ignores those.
2. **`hsl(...)` fills/strokes** (lines 819, 832, 836, 848, 851, 852, 866, 870, 881, 891 plus `causalColor()`). Word silently drops unknown colour functions → "missing" nodes/edges.
3. **No physical `width`/`height`** and a 100-unit viewBox with sub-pixel strokes (`0.3`) and font sizes (`1.6`–`2`). Word renders the file at ~1 inch, so strokes/labels round to 0 px.
4. **Black `#0b0f17` background rect** baked into the export — clashes with white Word pages, makes overlap worse.

### Problem 2 — Editable
The current export is a flat snapshot of `viewMode`'s positions: nodes, edges, and labels are siblings under one `<svg>` with no semantics. In Word/Illustrator/Inkscape/draw.io you can't easily move a node and have its edges follow, and there's no legend at all. That's not a Word issue — it's a structural choice in how we serialise.

---

## Fix plan (all in `src/pages/KGConstruction.tsx` plus one tiny helper in `src/lib/`)

### A. Make the export Word-compatible

In a rewritten `handleDownloadSvg`:
- After `cloneNode(true)`, walk descendants and:
  - `removeAttribute('style')` on every element (kills framer-motion's mid-animation `opacity:0; transform: scale(0)`).
  - For any `transform` containing `matrix(0` or `scale(0`, drop the attribute.
  - Force `opacity="1"` on group wrappers.
- Add a `hslToHex(h,s,l)` helper in `src/lib/svg-export.ts`; regex-rewrite every `hsl(H, S%, L%)` in `fill`, `stroke`, and any remaining `style` to `#rrggbb`. Audit `causalColor()` and replace its `hsl()` returns at the same time (or post-process).
- Set on the clone: `width="1600"`, `height="1200"`, keep `viewBox="0 0 100 75"` (or current `0 0 100 100` if force layout).
- Default background `#ffffff` (white) so the figure prints cleanly; offer a dark variant via the dropdown described below.

### B. Make the export editable + structured

Rebuild the clone into named, layered groups so designers can grab/move pieces in Inkscape, Illustrator, draw.io, or PowerPoint:

```
<svg ...>
  <g id="background">…white rect…</g>
  <g id="legend">…</g>
  <g id="edges">
    <g id="edge-{from}-{to}" data-from="…" data-to="…" data-kind="relation|causal|synth">
      <line .../>            <!-- or path for causal -->
      <text class="edge-label">enables</text>
    </g>
  </g>
  <g id="nodes">
    <g id="node-{id}" data-type="threat_actor" transform="translate(x,y)">
      <circle class="halo" .../>
      <circle class="core" .../>
      <text class="label">APT-29</text>
    </g>
  </g>
  <g id="metadata">
    <text>case={caseId} · preset={preset} · T={t} · seed={seed} · {timestamp}</text>
  </g>
</svg>
```

Why this matters for editability:
- Each node's circles + label live in one `<g transform="translate(x,y)">`. Moving the group in Illustrator/Inkscape moves halo+core+label together. (True "edges follow node" is only possible in code — no SVG format gives that for free — but with groups the manual fix is one drag per edge endpoint instead of three separate object selections.)
- `id`s and `data-*` attributes let scripts (or future re-import) reconnect edges to nodes by name.
- `text` is a real `<text>` element (already true), so it can be re-typed in any vector editor.

### C. Reduce label overlap on the snapshot

A small server-free pass before serialising the clone:
- For node labels: shift the label baseline up/down per node based on neighbour positions (simple greedy: if another node's label centre is within 2 viewBox units, push this one to `y - r - 1.5` instead of `y + r + 2`).
- For edge labels (timeline view): if the bezier midpoint collides with a node, slide the label along the curve by ±10% of arc length.
- This is best-effort, only runs in the cloned export DOM, and doesn't touch the live preview.

### D. Bake the legend into the export

The legend currently lives outside the `<svg>`. In the export-only clone, prepend a `<g id="legend">` containing:
- node-type swatches (circle + `<text>`) for: threat_actor, campaign, malware, vulnerability, ttp, infrastructure (using `nodeColorMap`)
- edge styles: solid = relation, dashed = synthesised campaign edge, thick coloured = causal (`enables` / `leads_to` / `triggers`) with the matching marker
- a centre-pivot pill: "centre: {pivotEntity.name}"

Positioned in the top-left of the export viewBox (e.g. `x=2,y=2`, ~30 units wide), with white background fill so it's readable on either canvas.

### E. UI: split the single button into a dropdown

Replace the existing "Download SVG" button (line 715–724) with a `DropdownMenu`:
- **SVG — Word/Print (white, editable)** ← default
- **SVG — Dark (presentation, editable)** ← same structure, dark `#0b0f17` background and lighter label hexes
- **SVG — Flat snapshot (legacy)** ← current behaviour, kept for users who relied on the exact look

PNG and Mermaid buttons stay untouched.

---

## Out of scope
- The on-screen graph and its framer-motion animations.
- `handleDownloadPng` (already rasterised through `<img>`, so Word renders it fine).
- The Mermaid `.mmd` dual-graph export.
- The neuro-symbolic pipeline, `kb-validate`, `threat-pipeline`, layout selector — none touched.

## Acceptance check
1. Open the new "Word/Print" `.svg` in: (a) draw.io — identical or better than today; (b) Word "Insert → Pictures" — every node, edge, label, and the legend visible on a white page; (c) Inkscape — node groups are individually selectable, dragging a node moves its halo+core+label as one.
2. The "Dark" variant matches the on-screen look and also passes the Word insert test.
3. The "Flat snapshot" variant reproduces today's output byte-for-byte (regression safety).
