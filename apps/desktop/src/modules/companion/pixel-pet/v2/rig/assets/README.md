# Pixel Pet 2.0 key poses (candidate)

`pixel-keyposes-v2.png` is a separate 2-column × 3-row RGBA atlas, generated with
the built-in image_gen tool from the existing pixel-free-v1 identity reference.
The approved neutral/side/bottom/free textures are not edited or replaced.

Row order: wave / touch hair; chin rest / stretch; sleep / peek.
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
