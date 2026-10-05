# Approved desktop pet art

The three PNGs are unchanged copies of the user's approved AI-generated static designs (2026-10-03): detailed half-body, pixel half-body, and chibi.

Runtime preserves the whole mother texture. A continuous, bounded scanline deformation drives small head/breath/hair motions, smoothly anchoring the grip bands and the right boundary. It does not separate anatomy into moving cut-outs, so it needs no invented neck, sleeve or hair surfaces underneath. No prerecorded animation frames or Live2D are used.

Eyes retain the source artwork, including original whites, lashes and highlights. The original iris texture translates inside the fixed aperture, using bilinear interpolation and an elliptical limit proportional to each style's eye size. Newly exposed sclera is sampled from the artist's original eye whites; the outline and surrounding face do not warp. Neutral gaze restores every source pixel, and an asset without usable sclera samples safely retains its original eye. Blinking compresses the original eye, interpolates neighbouring skin colours, and samples the original dark lash colour; it does not repaint fully open eyes with generic almond paths or a flat skin ellipse.

Logical viewport: 192×240. All three styles prepare at 576×720 for eye precision; pixel/Q use nearest-neighbour whole-art sampling while detailed art uses smoothing. Source colours and alpha are preserved, without hard thresholding. The calibrated grip aligns to the right viewport border; overhanging fingers/ribbons clip intentionally, without changing the source aspect ratio.

Side-edge art supports right and mirrored left poses. Three new bottom-v1 static textures (2026-10-04) provide properly posed horizontal forearms, not rotated side art; source prompts are in bottom-prompts.md. They are newly generated candidates and await user appearance review. Bottom grip rows anchor both horizontal and vertical displacement. Lazy preparation is keyed by style and side/bottom/free pose, bounded to nine known entries.

This remains a lightweight edge prototype, not a full rig. Large rotations, full-body movement, peek and a separate sleeping pose are unsupported. Cosmetic rest now uses the same live eye rendering and does not stop voice wake. Blink interpolation and native WebView2/DPI appearance still need user review.


Three free-v1 static mother textures (2026-10-04) add naturally clasped hands and a centered half-body silhouette for free placement and dragging. Original side/bottom PNGs remain unchanged; prompts and reference roles are in free-prompts.md, generated with the built-in image_gen tool. Free artwork has no fixed grip bands, and connected row motion translates without a fixed right-edge constraint. Actual appearance matching remains a user review item.
