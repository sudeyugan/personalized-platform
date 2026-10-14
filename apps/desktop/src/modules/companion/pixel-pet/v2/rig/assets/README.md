# Pixel Pet 2.0 key poses (candidate)

## Current v3 individual poses

Runtime now uses wave-v3.png, touch-hair-v3.png, chin-v3.png, stretch-v3.png and
sleep-v3.png: five independent 1024×1536 RGBA edits of approved pixel-free-v1,
with pixel.png as the style reference, using built-in image_gen (not CLI).
The rejected three-handed hair-touch draft is not shipped; its repaired result
has one raised hand and one waist hand. Prompts: [PROMPTS-v3.md](PROMPTS-v3.md).
No webcam or user image was used. Approved original images remain untouched.

PoseCalibration fits each pose's eye-span vector and eye center to the actual
side/free/bottom neutral. PoseAppearance preserves the head transform and smoothly
aligns side-gesture chest position to the original grip's lean; bottom/free retain
the uniform fit. The wave has a bounded wrist-local mask, not a generic lower-arm
warp. Contact poses reduce head motion, native closed-eye expressions are kept,
and transitions select one solid silhouette rather than additive double hands.
Neutral keeps the exact original source, with an independent V2 CPU expression
surface so legacy GPU readback does not affect it. The old six-cell atlas below stays
in source history/provenance, but is no longer loaded by the runtime.

Read-only RGBA inspection: node scripts/pixel-pet-art-check.mjs. All five files
have genuine transparent pixels (382590–424201), and sampled crown/forehead RGB
mean absolute deviation from the original free image is 5.176–7.454 / 255.
This is a limited pixel/style check, not an anatomy or subjective quality score.

## Previous v2 atlas (not used)

`pixel-keyposes-v2.png` is a separate 2-column × 3-row RGBA atlas, generated with
the built-in image_gen tool from the existing pixel-free-v1 identity reference.
The approved neutral/side/bottom/free textures are not edited or replaced.

Row order: wave / touch hair; chin rest / stretch; sleep / peek.
Runtime uses only the first five cells. The duplicate peek cell is retained in
the original atlas for provenance, not loaded or scheduled (2026-10-14 feedback).
These are six key-pose textures, not prerecorded animation frames. The motion
controller provides realtime joint/face channels and continuous skinning.
Neutral draws the original approved texture; candidate appearance still needs
user review. Logical calibrations live in RigAssets.ts and the debug comparison.

Final prompt: identity-preserve; one tall transparent RGBA atlas with exactly
two columns and three rows; same white/silver long hair, blue eyes,
ahoge, flower/ribbon/X pin, black collar and white detached sleeves/waist bows,
half-body proportions and palette; friendly wave, touch side hair, chin rest,
small stretch, sleep on forearms, peek around an invisible edge; complete
shoulder/neck/cloth coverage, no anatomy gaps, backdrop/props/text or watermark.
The input role is identity/style reference, not a texture to overwrite. Runtime
uses no external asset URLs. A targeted layout correction asked1024×2304 and
complete lower costume/hair; selected output is836×1881 with418×627 cells.
Runtime checks the actual dimensions, not the requested size. The square draft
was rejected and moved to/tmp (original built-in output retained); old pet assets
are unchanged. Transparency and live fit require the renderer verification.
