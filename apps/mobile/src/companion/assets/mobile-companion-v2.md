# Mobile companion v2 · DEC109

2026-10-22：本批使用内置imagegen生成并清理，非CLI/API脚本；不是样稿。用户明确要求正常比例、非Q版、小鱼独立于软件页面。PC原素材不修改。身份参考为`apps/desktop/src/modules/companion/pixel-pet/art/assets/detailed-free-v1.png`。

生产文件为`mobile-companion-v2.png`（RGBA8，1536×1024）和`mobile-companion-v2.frames.json`。原v1图集留存但不再由当前运行入口引用。生成工具的格线注册并不精确，不能按4×2均分硬切：依据实际前景范围登记8个source rect，统一519源像素参考高度，足部锚点在运行时计算。站姿0–4、坐姿5–7；不重新拼接肢体。Canvas和Android桌面组件读取同一份登记，组件复用Web打包图，不复制第二套角色资源。

清理结果全透明像素约54.3%，四角alpha为0；边缘保留抗锯齿。最终实际Canvas已单独核对站姿、坐姿与轻墨/隐藏，不以生成工具深色预览背景判定真实alpha。手机很小尺寸的艺术/动作和实际HyperOS组件仍待自然体验。

## 原始生成提示词（内置工具；reference only）

Use case: stylized-concept. Production sprite atlas, not a mockup. Reference image is identity only. Draw this same silver-white long-haired blue-eyed anime woman with white flower, black/blue ribbons, choker, white-blue-black outfit, in NORMAL slender full-body anime proportions about 6.5 heads tall. NO chibi or oversized head. Opaque skirt, stockings and blue shoes. Actual transparent RGBA background, no text or background, no floor or objects. Exactly 4 columns x 2 rows, 1536x1024 total, eight 384x512 cells. Same anatomical size, head/body proportions, costume, lighting, camera, scale and padding in all cells. Standing characters occupy about 90% height, all hair/hands/feet safely inside cell. Row-major frames: 1 neutral standing relaxed hands; 2 identical standing eyes closed; 3 identical standing attentive slight head tilt; 4 identical standing small speaking mouth; 5 standing small raised-hand greeting; 6 normal-proportioned character sitting on invisible ledge at 60% cell height, knees together legs hanging hands beside hips, no chair/ledge drawn; 7 same seated eyes closed; 8 same seated speaking mouth. Seated anatomy same size as standing, do not enlarge to fill cell. Fine polished reference-like linework, pale hair edges preserved with clean real alpha. No grid or labels.

## 清理提示词（内置工具；exact edit target）

Use case: background-extraction / production sprite registration. Image 1 is the exact EDIT TARGET. Preserve the eight existing character drawings, identity, normal body proportions, clothing, expressions and poses; do NOT redesign or redraw them. Fix only atlas packaging: remove ALL blue-gray background/glow/halo outside the actual characters and produce genuine RGBA transparency, including interstitial pixels between hair strands. Empty space must be full alpha ZERO, not faint blue-gray/translucent haze. Keep pale white hair colors and antialiased thin strands. Output exactly 1536x1024, four equal columns x two equal rows (384x512 cells), no grid/text. Reposition and UNIFORMLY reduce each existing character enough that all hair, hands, shoes and every opaque pixel remain safely INSIDE its own cell, at least 16 pixels away from all cell edges; no shoes crossing the row boundary. Consistent anatomical scale across all 8 characters. Standing frames 1-5: identical scale/center registration and foot baseline at local y=490. Seated frames 6-8: identical scale/registration to one another with normal anatomy same size as standing, invisible ledge, all feet within cell. No added backdrop, ground shadow, pedestal or objects. Actual transparent cutout game sprite atlas, not a presentation board.

生成结果未完全实现提示词中的等分留白，因此以登记文件处理取图范围；提示词是请求记录，不是未经验证的完成保证。未使用Python或色键算法改写图像像素。
