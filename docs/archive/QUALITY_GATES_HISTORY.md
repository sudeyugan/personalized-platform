# 历史质量门禁证据

> 归档于 2026-09-14。当前规则见 [.agent/QUALITY_GATES.md](../../.agent/QUALITY_GATES.md)。本文件不属于日常必读。

## M3 验证证据（0.2.0）

- 前端：22/22；覆盖动态日期跨午夜更新、三类资料右侧工作栏编辑/删除、模糊时间稳定排序、同时间段分组和双向引用查询。
- Rust：11/11；覆盖 v4 幂等迁移、旧 JSON 导入、资料/关系投影、revision 冲突、磁盘满、FTS、恢复草稿和技术 spikes。
- 构建：TypeScript、oxlint、Vite、Tauri release、NSIS 全部通过。
- 已知非阻塞提示：主 JS 669.31 kB，M4 前安排视图级动态加载；MSVC 仅输出正常的导入库创建 linker message。

## M4–M5 验证证据（0.5.0）

- 前端：29/29；新增素材引用/孤儿判断、Mock AI 成功与配额/拒绝失败、Markdown 分章导入、工具栏图片入口、设置分类折叠记忆，以及 lazy view 的既有 UI 回归。
- Rust：19/19；新增图片复制/读取/删除、DPAPI 无明文、备份创建/预览/完整恢复/路径穿越/清单全覆盖、开放导出 staging/路径穿越、vault 错误密码/无明文和 SQLite v5 迁移。
- 静态与构建：TypeScript、oxlint、Vite 和 Tauri release/NSIS 通过；所有视图按需加载，主入口约 212.32 kB，无 500 kB 主入口提示。
- 安全人工项：真实 Windows 锁屏/休眠、跨机器恢复、复杂 DOCX/PDF 外部软件表现仍需阶段末人工验收；MSVC 仅保留正常导入库 linker message。

## M6 验证证据（1.0.0，2026-08-11 第二轮补丁）

- 前端：43/43；在既有首次向导、帮助、资料标记、AI 脱敏和性能覆盖上，新增删除确认框安全焦点、Tab 焦点限制、Esc 取消，以及人物/事件实际删除流程回归。
- Rust：22/22；新增可配置资料库根目录约束、诊断统计不暴露文件名，以及 10,000 章节 FTS 查询低于 1 秒；原迁移、磁盘满、备份恢复、路径穿越、DPAPI 和 vault 无明文回归全部通过。
- 性能：10 万字符序列化/字数低于 1 秒；10,000 章节 FTS 查询低于 1 秒；生产主入口 250.49 kB，写作视图 426.16 kB，共享确认框独立分包 2.71 kB，均低于 500 kB 关注线。
- 静态与构建：TypeScript、oxlint、Vite、Tauri release、NSIS、文档一致性和安装包 SHA-256 全部通过。
- 人工体验：不设置固定清单、环境矩阵或连续天数；安装后自然使用，实际发现问题时再针对性回归。状态保留“已交付待人工验收”只表示尚未收到本补丁自然体验结果，不阻断后续 M7。

## M7 验证证据（1.2.0）

- 前端：51/51；新增旧资料 M7 迁移、播放上下文优先级与手动队列、伙伴默认拒绝、加密作品临时许可、provider 不发送边界和应用页面回归。
- Rust：24/24；新增音频类型/大小/逻辑 ID/复制读取删除，以及完整备份包含并恢复音频目录；既有路径穿越、磁盘满、DPAPI、vault 无明文回归通过。
- 静态与构建：TypeScript、oxlint、Vite/Tauri release、NSIS、文档一致性和安装包哈希全部通过；主入口 261.96 kB，音乐视图 5.80 kB，均低于 500 kB 关注线。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `FD9F4F443F8926F89F75E6F7A3C3304B6A2239012D8E06EB4798745055894224`。
- 人工体验：只需安装后自然体验本地音乐和伙伴侧栏；无固定场景、环境矩阵或连续天数。

### 2026-08-13 同版本 UI 补丁

- 定向应用测试 9/9：新增智能创作三段分组、Provider 配置检查措辞、Mock 隐藏无效字段、权限开关可访问状态，以及窄窗口伙伴抽屉入口回归。
- 最终门禁：前端 52/52、Rust 24/24、TypeScript、oxlint、生产 Vite/Tauri、NSIS、文档一致性和安装包哈希全部通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `CE72EF3B1AF713F31738589E1D42F6161895801D5C9FBEBF45E830C6F21B3300`。
- 响应式 CSS 明确覆盖 ≤1020px 伙伴抽屉及 ≤700px 音乐页头、上下文标签、曲目 grid areas 和设置表单纵向布局。

### 2026-08-16 写作工具栏补丁

- 定向组件测试 7/7：覆盖粗体/斜体选区、图片位置、资料标记、正文/三级标题、代码/清除格式、链接 HTTPS 规范化与移除、列表缩进可用状态。
- 最终门禁：前端 55/55、TypeScript、oxlint、Vite/Tauri release、NSIS、文档一致性与安装包哈希全部通过。
- 改动仅涉及 `EditorToolbar`、Tiptap 前端配置与样式，不涉及 Rust、Cargo/Tauri、存储、备份、加密或权限边界；按 `pnpm release:patch:ui` 省略独立 Rust 测试，Tauri 生产构建仍完成 Rust release 编译。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `21FAD3EDD7DB8F1DF4BDE069652092BD202F522A4B39677858874DF431E3CF5A`。

### 2026-08-16 工具栏创作能力修正

- 定向回归 12/12：覆盖代码入口移除、高亮、对齐、待办列表、查找/替换、跨格式边界匹配、链接、清除格式和列表缩进。
- 新增官方 Tiptap 扩展精确锁定 `3.29.2`；曾出现的 `3.30.1`/core `3.29.2` 加载失败已作为依赖版本问题修正，不属于产品运行回归。
- 改动为前端编辑 schema/UI 和纯函数，不涉及 Rust、Cargo/Tauri、文件仓储、备份、加密或权限边界，最终使用 `pnpm release:patch:ui`。
- 最终门禁：前端 60/60、TypeScript、无警告 oxlint、Vite/Tauri release、NSIS、文档一致性与安装包哈希通过；独立 Rust 测试按纯前端规则省略，生产 Rust release 编译通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `F5D9EBA1E0280E7F2071936FFA82C0C2C0C984E70F9A20B4DE2410A4FC1B65DF`。

### 2026-08-16 写作响应式与背景指南补丁

- 定向回归 12/12：覆盖按宽度折叠工具栏、章节删除确认与实际回收站状态，以及帮助中心背景生成数量和单图全局边界。
- TypeScript 和无警告 oxlint 通过；Vitest/Vite 在沙箱内遇到 Windows `spawn EPERM`，按既有测试权限在沙箱外通过。
- 改动只涉及 React/CSS、帮助文案和本地 Markdown；不修改 Rust、Cargo/Tauri、存储、备份、加密或权限边界，最终使用一次 `pnpm release:patch:ui` 收口。
- 最终门禁：前端 61/61、TypeScript、无警告 oxlint、生产 Vite/Tauri、NSIS、文档一致性与安装包哈希全部通过；独立 Rust 测试按纯 UI 规则省略，生产 Rust release 编译通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `2B3F13830D6C723F890A26DD1BF2DB6A6E1B5A93772E1D44F49AA750E9F181A0`。

### 2026-08-16 无框全宽正文与提示层级修正

- 定向 App/帮助回归 12/12：覆盖音乐空提示仅音乐页可见、可关闭，背景图说明仅作为常用指南小项，以及既有写作/章节流程。
- 视觉根因修正：正文 CSS 明确 `max-width: none` 且无轮廓，章节栏/上下文栏垂直边线移除；该项需要安装后自然体验确认实际缩放手感，自动测试只保护结构不回退。
- 改动只涉及 React/CSS/文案和删除不再使用的展示组件/文档，不修改 Rust、Cargo/Tauri、存储、备份、加密或权限边界；使用一次 `pnpm release:patch:ui` 收口。
- 最终门禁：前端 61/61、TypeScript、无警告 oxlint、生产 Vite/Tauri、NSIS、文档一致性与安装包哈希全部通过；独立 Rust 测试按纯 UI 规则省略，生产 Rust release 编译通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `E3C4A10CDBBF16DB8365BB6F52DA5E791E2B2A6E2C7946ABFC06E0A9D37E71E4`。

### 2026-08-16 行间距收尾补丁

- 工具栏定向回归 10/10：新增用例验证段落行距写入 HTML/JSON，并可恢复为不带单独属性的默认状态。
- `LineHeight` 只扩展 Tiptap 段落/标题节点属性并由既有章节保存流程持久化；无 Rust、Cargo/Tauri、资料库 schema、备份、加密或权限改动。
- 最终门禁：前端 62/62、TypeScript、无警告 oxlint、生产 Vite/Tauri、NSIS、文档一致性与安装包哈希全部通过；独立 Rust 测试按纯 UI 规则省略，生产 Rust release 编译通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_1.2.0_x64-setup.exe`；SHA-256 `A54786CB820D2838AEA63F6E14AC1908D9AB35AF59CE2ABDD3FFF28E83AAA7F6`。
## M8 `2.0.0` 伙伴成长与桌面形态

- 定向前端 16/16：覆盖旧库迁移、默认拒绝、加密临时许可、记忆授权/撤销和桌面显示快照不包含敏感字段；应用设置既有流程不回退。
- TypeScript 通过；Rust `cargo check` 通过全部 `WebviewWindow` 主窗口守卫和第二窗口配置编译。
- 完整门禁：前端 64/64、Rust 24/24、TypeScript、生产双窗口 Tauri、NSIS、文档与哈希通过。
- 首轮完整门禁发现 3 条非阻断 Hook 依赖警告；修正后使用一次纯 UI 补丁门禁收口，前端 64/64、TypeScript、无警告 oxlint、生产 Tauri/NSIS 与哈希再次通过。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_2.0.0_x64-setup.exe`；SHA-256 `77A22789B789A72B362BA2EFA9B5E92ECD00810F2617C888FE9C69D71E2CE672`。

### 2026-08-19 桌面角色 Runtime 与退出反馈补丁

- 开发内循环：TypeScript 通过；受影响前端 19/19；Rust 主窗口/伙伴窗口关闭语义与角色素材 ID 守卫各 1/1。
- 最终使用一次完整 `pnpm release:patch`：前端 69/69、Rust 26/26、TypeScript、无警告 oxlint、Vite/Tauri release、双窗口配置、NSIS、文档一致性和 SHA-256 全部通过。
- 角色包覆盖缺图拒绝、数字帧自然排序、动作期间说话不覆盖、配置持久化快照与帮助入口；Rust 覆盖主窗口关闭统一退出和伙伴素材标识约束。
- 产物：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_2.0.0_x64-setup.exe`；SHA-256 `8DFE0EC15E97ADFC021B6BB77CCC140E0B4111BE876FB47A6F64073D639B5696`。
