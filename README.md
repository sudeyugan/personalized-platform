# 一隅 Yiyu

一隅是一个安静、温暖、本地优先的 Windows 个人数字空间。它把长期写作、日常规划、情绪记录、音乐和可交互的 AI 桌面伙伴放在同一个应用中，同时让模块、数据外发和电脑操作保持可见、可控、可关闭。

<!-- generated:project-status:start -->
> 当前版本：`2.0.0`｜当前阶段：M10 AI 伙伴 Agent 与立绘基础｜状态：进行中｜下一阶段：后续方向待用户确认
>
> 自动门禁：已通过｜人工验收：待验收｜状态更新时间：2026-09-27
>
> 最近安装包：`apps/desktop/src-tauri/target/release/bundle/nsis/一隅_2.0.0_x64-setup.exe`
<!-- generated:project-status:end -->

## 当前能力

### 写作与资料

- 管理作品、卷和章节，支持拖放排序、回收站、多标签与会话恢复。
- 使用 Tiptap 富文本编辑器，支持标题、列表、待办、链接、高亮、对齐、行距、查找替换、图片和资料标记。
- 自动保存正文、恢复异常草稿，并提供版本预览、固定与恢复。
- 管理人物、关系、地点、事件、自定义字段、模糊时间、章节锚点与双向引用。
- 导入 DOCX、Markdown 和 TXT；导出 DOCX、PDF、Markdown 与图片资源。
- 通过 SQLite FTS5 搜索中文内容，浏览器开发模式使用 localStorage 回退。

### 日常空间

- 日历可添加事务，并在侧栏查看当天课程和待办；内置七天六节、16 周课表结构。
- 日记位于创作空间，默认打开当天，支持自动保存和从日历跳转到指定日期。
- 待办支持不重复、每日、每周指定星期，以及按日、周、月完成若干次的周期目标；可将当天设为休假。
- 首页可在早、午、晚分别分配五枚情绪点，记录混合情绪和备注，并查看周/月回望。
- “朝问”每天北京时间 08:00 生成一个以自我觉察为主的思考问题；问题保留 90 天，回答只有主动写下后才进入日记。
- “答案之书”使用 300 条本地语料随机回答，不调用 AI；只有主动收藏才保存问题、答案与时间。
- 本地音乐支持曲库、队列、循环方式、快捷键和全局/作品/章节/专注四层播放上下文。

### AI 伙伴与桌面形象

- 自有轻量 Agent Runtime，不绑定大型 Agent Framework；模型只能通过 Tool Registry 使用应用能力，不能直接访问 Store、Repository 或 SQLite。
- DeepSeek 支持 SSE 流式对话与 Tool Calling；Provider 层保留替换 OpenAI、Claude、Gemini 和本地模型的接口。
- 伙伴可在已授权范围内读取、跳转、创建和修改日记、待办、日历、课表、情绪、作品、章节和人物资料等应用内容。
- Tool 调用统一经过参数校验、细分 capability、风险等级、资源 scope、确认策略、步数上限和审计记录。
- 桌面形象支持透明 PNG/WebP，以及透明 WebM 动作库。当前动作包括 `idle`、`listening`、`speaking`、`looking`、`greeting`、`nodding`、`shy`、`concerned`、`celebrating`、`stretching`、`yawning` 和 `sleepy`；同一动作可保存多个片段。
- `idle` 是常驻基底，非交互期间低频穿插姿势动作；倾听、回答和一次性情绪动作由真实交互状态调度，切换使用预加载与交叉淡化。
- 伙伴窗口无边框、可拖动，可切换互动、安静穿透、普通非置顶和隐藏状态，并支持全局快捷键与系统托盘兜底。
- ElevenLabs 提供流式中文 STT 和分句 TTS；回答可暂停、继续、中止，并支持有效人声打断。
- 本地 sherpa-onnx 支持自定义唤醒词和可选声纹过滤。待机音频不上传，只有唤醒通过后才连接在线语音服务。

### 联网、隐私与电脑能力

- 联网查询通过独立 `web.search` Tool 接入，可选择腾讯云或博查；Bing 只作为可关闭的应急降级，不依赖模型自身具备联网能力。
- 外发内容统一经过本地 Egress Gateway。手机号、身份证、银行卡、邮箱、IP、本机路径和用户私密词可使用会话内稳定化名；密钥、密码和令牌类内容直接阻断。
- 设置可分别控制外部 AI、最近对话、应用上下文、长期记忆、联网查询和各类本地资料权限。
- 电脑能力覆盖受控的应用/网址打开、窗口、输入、剪贴板、通知、限定目录文件、受管理进程、截图和 FFmpeg 录屏。
- 前端 Permission Engine 与 Rust 主进程进行双重检查；删除、关闭、移动、停止进程、Shell 和其他高影响操作保持逐次确认或默认关闭。
- Tool 调用记录包含时间、工具、权限结论、状态与耗时；诊断信息不记录 API Key、Cookie、完整隐私正文或无关内部实现。

### 本地数据与个性化

- 支持每日/手动完整备份、SHA-256 校验、恢复预览、恢复前快照、可选目录和保留数量。
- 作品可使用 Argon2id + XChaCha20-Poly1305 加密；锁定后标题、正文、图片、索引和会话上下文均隔离。
- API Key、声纹特征等敏感配置通过 Windows DPAPI 保存，不写入普通资料或 Prompt。
- 提供温暖、明亮和深色主题，可调整布局、导航和模块显示。
- 背景可分别设置为通用、日常、创作、沉浸和侧边栏图片；内容区和侧边栏均直接渲染已上传图片，缺失场景回退通用背景。
- 三步首次启动向导可在建库前选择资料库、备份目录和默认主题，也可接入已有资料库。

## 技术结构

```text
React UI / Companion Window
            ↓
       Agent Runtime
       ↙           ↘
Model Provider   Context / Session
       ↓
   Tool Registry
       ↓
Permission Engine + Egress Gateway
       ↓
Application Service
       ↓
Rust Commands → Services → Repositories → SQLite / File System
```

核心技术栈：Tauri 2、Rust、React 19、TypeScript 6、Vite 8、Zustand、Tiptap、SQLite。应用以 Windows 10/11 为目标平台。

## 本地开发

需要预先安装 Node.js、pnpm、Rust/MSVC 工具链和 WebView2。首次进入仓库后：

```powershell
pnpm install
pnpm tauri:dev
```

常用命令：

```powershell
pnpm dev              # 仅启动 Web 开发界面
pnpm tauri:dev        # 启动完整桌面开发版
pnpm typecheck        # TypeScript 类型检查
pnpm lint             # 前端静态检查
pnpm test             # 前端测试
pnpm verify:quick     # 少量核心检查
pnpm verify:ui        # typecheck、lint 和 Web build
pnpm verify:full      # 完整跨层门禁
pnpm tauri:build      # Windows Release 与 NSIS
```

Rust 测试：

```powershell
cd apps/desktop/src-tauri
cargo test
```

## 外部服务

应用的主体数据和大多数功能可离线使用。以下能力需要用户自行配置并明确开启：

- DeepSeek：伙伴对话、Agent 推理和“朝问”。
- ElevenLabs：实时语音识别与语音合成。
- 腾讯云或博查：受控网页搜索。
- OpenRouter 图像生成：仅保留配置入口，当前尚未完成正式生图流程。

本地唤醒、声纹过滤、资料库、备份、写作、日历、待办、日记、情绪、答案之书和本地音乐不要求持续连接上述服务。

## 当前边界

- M10 仍在自然体验与补丁阶段，完整自动门禁当前未全部通过；具体证据和既有失败见 [`.agent/PROJECT_STATE.md`](.agent/PROJECT_STATE.md)。
- Live2D、MCP 和 OpenRouter 生图尚未接入正式运行路径；旧 `character.json` 差分角色包仅保留数据兼容。
- 电脑能力是显式授权的受控 Tool 集合，不是模型对整台电脑的无限制访问。
- 程序完全退出后无法继续监听唤醒词；开启语音唤醒时关闭主窗口可以保留托盘后台监听，但不会注册开机自启动。
- 复杂 DOCX/PDF 版式不能保证无损往返，也不应把唯一一份重要原稿只保存在单一应用或设备中。

## 文档与交接

- 产品、架构、数据模型与路线图：[`docs/product`](docs/product/README.md)
- 动态伙伴、语音、隐私与安全层：[`docs/product/06-动态伙伴与隐私安全层.md`](docs/product/06-动态伙伴与隐私安全层.md)
- 实时开发状态：[`.agent/PROJECT_STATE.md`](.agent/PROJECT_STATE.md)
- 实际体验与需求补充：[`docs/体验反馈与需求补充.md`](docs/体验反馈与需求补充.md)
- 版本变化：[`CHANGELOG.md`](CHANGELOG.md)
- 跨电脑开发迁移：[`开发环境迁移说明.md`](开发环境迁移说明.md)

里程碑和发布文档由 `.agent/project-status.json` 驱动；修改自动生成区块时，应先更新状态源，再运行：

```powershell
pnpm docs:sync
pnpm docs:check
```

迁移源码并不等于迁移个人数据。需要保留应用内容时，请同时在一隅中导出 `.yiyu-backup` 完整备份。
