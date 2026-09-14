# Code Structure and Refactoring Protocol

> 目的：防止文件无限增长、职责混杂和功能边界模糊，同时避免为了追求短文件而进行无意义拆分。

## 核心原则

- 文件长度是预警信号，不是质量结论。
- 按“职责”和“变化原因”拆分，不按任意行号切割。
- 一个文件应有一个清晰的主要目的。
- 一起变化的代码放在一起，独立变化的代码尽量分开。
- 对外暴露稳定的小入口，内部实现可以继续分层。
- 重构默认保持行为不变；功能变化和结构变化尽量分开验证。

## 默认文件长度评级

这些是初始值，应根据语言、框架和项目历史校准：

| 等级 | 有效代码行数 | 含义 | 默认动作 |
|---|---:|---|---|
| A | 0–200 | 通常易于理解 | 正常开发 |
| B | 201–350 | 开始关注 | 修改时检查职责和复杂度 |
| C | 351–500 | 重构候选 | 新增功能前评估拆分 |
| D | 501–800 | 高优先级结构问题 | 原则上先拆分再继续扩展 |
| E | 800+ | 严重结构风险 | 制定分阶段重构方案，避免继续堆叠 |

“有效代码行数”不必追求精确，可忽略空行和纯注释。不要为了从 351 行降到 349 行而制造没有边界的文件。

## 例外

以下文件不直接套用长度阈值，但仍需检查可维护性：

- 自动生成代码。
- 数据、schema、词典和静态映射。
- 快照、fixture 和迁移历史。
- 必须保持单文件格式的配置或框架入口。
- 由外部工具维护的文件。

例外必须可识别或有说明。不要把普通业务代码标记为生成文件来逃避重构。

## 即使文件不长也应拆分的信号

出现以下任一强信号时进行结构评估：

- 文件可以用多个不相关的“以及”描述其职责。
- UI、业务规则、数据访问、格式转换和副作用混在同一层。
- 多组函数拥有不同调用者、依赖和变化节奏。
- 导出项过多，调用方必须了解大量内部细节。
- 条件分支、嵌套或状态组合使局部修改难以推理。
- 测试必须构造大量无关依赖才能覆盖一个小行为。
- 合并冲突频繁集中在同一文件。
- 新功能只能继续增加模式判断、布尔开关或特殊分支。
- 文件名变得宽泛，例如 `utils`、`helpers`、`manager`、`service`，内部却包含多个领域。
- Agent 或开发者需要反复通读整个文件才能完成局部修改。

## 重构等级

### R0：保持现状

适用：职责清晰、局部修改容易、验证充分。

动作：不为追求形式主动拆分。

### R1：文件内整理与基础提取

适用：文件略长，但主要职责仍然单一。

可提取：

- 类型和接口：`types.*`
- 常量和配置：`constants.*`
- 纯函数和转换：使用有领域含义的文件名
- 独立验证规则：`validation.*`
- 小型 UI 子组件

要求：提取物有明确名称和复用/隔离价值，避免创建通用垃圾桶 `utils.*`。

### R2：按子功能或层次拆分

适用：同一功能中存在可以独立变化和测试的职责。

典型拆分：

```text
feature.ts
feature.validation.ts
feature.repository.ts
feature.service.ts
feature.presenter.ts
```

或 UI：

```text
FeatureView.tsx
FeatureForm.tsx
FeatureList.tsx
useFeature.ts
feature.types.ts
```

具体命名服从项目已有惯例，不机械采用上述后缀。

### R3：升级为功能目录

适用：功能预计继续扩展，已有多个内部模块、测试、状态或资源。

```text
feature/
├── index.ts              # 稳定公共入口
├── feature.ts            # 核心编排
├── types.ts
├── validation.ts
├── repository.ts
├── components/
├── hooks/
└── __tests__/
```

目录规则：

- `index` 只暴露外部需要的 API，不重新导出所有内部实现。
- 内部模块避免反向依赖调用方或更高层。
- 测试跟随职责组织。
- 不建立只有一个文件且没有发展价值的目录。

### R4：建立架构边界

适用：模块跨越多个领域、层次或团队边界，局部拆分仍不能降低耦合。

动作可能包括：

- 分离领域、应用、基础设施和界面层。
- 引入清晰接口或适配器。
- 将公共能力与具体业务分离。
- 分阶段迁移调用方。

R4 通常影响面较大，应先记录决策、风险和迁移计划，并与用户确认。

## 自动检查时机

Agent 在以下时机检查文件结构：

1. 准备向现有文件加入新职责前。
2. 修改后的文件进入新的长度等级时。
3. 一个里程碑完成或执行系统审查时。
4. 同一文件连续发生冲突、回归或复杂调试时。
5. 用户或评审指出文件难以理解时。

如果文件从 B 进入 C，应在 `PROJECT_STATE.md` 记录重构候选；进入 D 或 E，原则上在继续扩展前处理，或明确记录延期原因、风险和计划。

## 重构流程

1. **建立基线**：运行相关测试，确认当前行为和既有失败。
2. **识别职责**：列出文件承担的职责、依赖、调用方和变化原因。
3. **选择等级**：从 R1–R4 中选择最小有效拆分。
4. **设计边界**：明确每个新文件的单一目的和公共入口。
5. **小步迁移**：一次移动一个职责，避免同时进行无关功能修改。
6. **持续验证**：每个可验证步骤运行相关检查。
7. **检查结果**：确认依赖方向、命名和测试比之前更清晰。
8. **更新状态**：记录完成情况、残余风险和后续深入方向。

## 拆分质量检查

拆分完成后必须满足：

- [ ] 每个新文件都能用一句话描述主要职责。
- [ ] 新文件不是按行数任意切割。
- [ ] 公共 API 没有无意扩大。
- [ ] 没有产生循环依赖或大量双向导入。
- [ ] 调用方不需要了解内部目录结构。
- [ ] 测试覆盖关键行为，重构前后结果一致。
- [ ] 原大文件不再承担已移出的职责。
- [ ] 没有创建新的 `utils`、`common` 或 `misc` 垃圾桶。
- [ ] 未来扩展点与当前职责边界一致。

## 延期规则

遇到紧急修复时可以暂缓结构重构，但必须：

- 不继续引入新的无关职责。
- 在 `PROJECT_STATE.md` 标记技术债和等级。
- 在 `RISKS.md` 记录继续扩大的风险。
- 在 `ROADMAP.md` 指定处理里程碑。
- 给出延期原因和退出条件。

不得用“暂时先这样”作为无限期不处理的理由。

## 项目自定义

语言 / 框架：React + TypeScript、Rust/Tauri。  
关注阈值：350 行；重构阈值：500 行；高风险阈值：800 行。  
自动生成文件：`target/`、`dist/`、Tauri `gen/` 和 lockfile。  
模块惯例：前端 `app/domain/infrastructure/modules/state`；Rust `commands/services/repositories`。  
结构检查：`pnpm typecheck`、`pnpm lint`、文件行数审查、`cargo test`。

### 2026-08-08 M2 结构审查

- `useLibraryStore.ts`：413 行，C 级；同时承担写作 CRUD、设置、会话、恢复草稿和持久化编排，属于 R2 拆分候选。M3 新增资料动作前必须处理。
- `library_repository.rs`：401 行，C 级；迁移、工作区存储、FTS 和测试集中。M3 若加入资料关系表，应先提取 migration/search 职责。
- `WritingView.tsx`：133 行，虽行数低，但 JSX 密度较高；M3 右侧资料卡不得继续直接堆入，应提取子组件。

### 2026-08-09 M3 结构审查

- `useLibraryStore.ts`：由 442 行降至 361 行；资料动作与类型分别移入 `recordsSlice.ts` 和 `libraryStoreTypes.ts`，公开 store 接口保持不变。仍为 C 级，M4 不应重新堆入图片职责。
- `library_repository.rs`：由 461 行降至格式化后的约 350 行；migration 与 JSON→关系表投影分别进入 `library_migrations.rs`、`library_projections.rs`，仓储只负责打开、保存、搜索、兼容导入和协调事务。
- `WritingRecordPanel.tsx`、`RecordLinksPanel.tsx`：写作资料侧栏和关系编辑独立于主视图，没有继续扩大 `WritingView.tsx`。
- 结论：M2 的两个 C 级扩展风险均已按 R2 拆分；`recordsSlice.ts` 虽行数较短但逻辑密度偏高，新增图片领域不得放入该切片。

### 2026-08-09 M4–M5 结构审查

- 图片领域进入独立 `assetsSlice.ts`、`AssetImage`/`AssetsView` 和 `asset_repository.rs`；没有回填 `recordsSlice.ts`。
- 加密编排进入 `securitySlice.ts`、`vaultRepository.ts` 和 Rust `vault_repository.rs`；备份、秘密、开放导出分别为独立 repository。
- 设置页只组合 AI、备份、导入导出和加密 section，各高风险流程拥有单独组件与基础设施边界。
- `documentTransfer.ts` 约百余行但同时包含三类导出与三类导入；当前仍为 B 级集中适配器。M6 若扩展复杂版式，先按 Markdown/DOCX/PDF adapter 做 R2 拆分。
- 生产视图级动态加载消除主入口体积风险；重型 `docx`、`pdf-lib`、`mammoth` 只在用户执行对应动作时加载。
- `SettingsView.tsx` 继续负责设置项组合，新建 `SettingsCategory.tsx` 只负责分类折叠与本地展开偏好；没有把各设置 section 的业务状态提升到总页面。

### 2026-08-09 M6 结构审查

- 首次建库和诊断分别进入 `storage_root.rs` / `startupRepository.ts` 与 `diagnostic_repository.rs` / `diagnosticRepository.ts`，没有塞入原资料库仓储或设置总页。
- `OnboardingWizard` 和 `HelpView` 各自是单一页面职责；验收字段保留在 settings 兼容模型内，不引入独立后端权限领域。
- `useLibraryStore.ts` 约 356 行，仍为 C 级；M6 只增加启动持久化和验收设置编排，没有加入文件系统实现。M7 若再增加音乐/伙伴状态，必须使用独立 slice，不能继续扩张主 store。
- `diagnostic_repository.rs` 约 150 行，负责诊断统计、压缩和 panic marker，职责相关但变化原因有分化趋势；若 M7 加入日志/遥测，先把崩溃标记拆为独立模块。

### 2026-08-11 1.0.0 反馈补丁结构审查

- 正文 mark schema、资料选择/建档 UI 和 AI 匿名转换分别放入 `EntityReferenceMark.ts`、`EntityTagMenu.tsx` 与 `entityPrivacy.ts`，没有把三类变化原因继续堆入 `WritingView.tsx`。
- 直接建档复用 `recordsSlice.ts` 的资料持久化边界；编辑器只接收返回的逻辑 ID 并写 mark，不接触 SQLite 或资料库文件。
- `ChapterImpressionPanel.tsx` 负责展示并发送同一份脱敏预览，provider 与密钥边界未改变；匿名转换是可单测纯函数。
- `useLibraryStore.ts` 删除验收打卡动作后未增加新职责；M7 仍必须为音乐和伙伴使用独立 slice。
- 第二轮补丁把危险操作视觉、焦点与键盘行为集中到约 56 行的 `ConfirmDialog.tsx`；各业务页面只维护待删除对象和调用原有领域动作，没有修改 store 或复制 modal 结构。

### 2026-08-12 M7 结构审查

- 音乐和伙伴分别进入 `modules/music|companion`、`state/musicSlice|companionSlice` 与各自 infrastructure 边界；Rust 音频文件职责进入 38 行 `audio_repository.rs`，未塞入既有素材或资料库仓储。
- `useLibraryStore.ts` 为 408 行 C 级，但 M7 只增加切片组合、播放 hydration 和模块导航编排，没有把音频 CRUD 或伙伴权限逻辑回填主 store；继续关注，M8 不得把桌面窗口/记忆职责放入该文件。
- `MusicView.tsx` 50 行、`PlaybackDock.tsx` 40 行；页面负责编排曲库/上下文，Shell 播放器负责单一 audio 生命周期。`CompanionPanel.tsx` 虽为压缩 JSX，但只有 7 行且职责集中，M8 扩展前按消息列表/授权提示拆分并改善可读性。
- 前端主入口 261.96 kB、音乐视图 5.80 kB；均低于 500 kB 关注线。M7 没有新增大依赖，视图继续动态加载。

### 2026-08-13 1.2.0 UI 补丁结构审查

- `CompanionSettingsSection.tsx` 从压缩单行改为按“外观 / 对话 / 权限”组织的可读组件；仍保持单一设置职责，没有引入新的 store 或 provider 行为。
- 窄屏伙伴抽屉由 `WritingView` 编排现有 `CompanionPanel`，不复制对话状态和权限逻辑；桌面右栏仍复用同一组件。
- 响应式修正集中为组件 CSS 覆盖，没有建立第二套页面结构；M8 扩展桌面伙伴前仍需按既定要求拆分 `WritingView` 中的窗口编排职责。

### 2026-08-16 1.2.0 写作工具栏补丁结构审查

- 新增格式命令、链接轻量编辑和分组语义均保留在独立 `EditorToolbar.tsx`；`WritingView` 只配置链接不自动打开，没有继续承担工具栏交互状态。
- 工具栏约 120 行，仍为 A 级单一职责组件；链接、列表和格式命令复用 StarterKit，未增加依赖或新持久化 schema。

### 2026-08-16 工具栏创作能力修正结构审查

- 查找位置映射与全部替换从 UI 中提取到 `editorSearch.ts` 纯函数，独立覆盖大小写、格式节点拆分和反向批量替换；工具栏只负责面板状态和命令编排。
- `EditorToolbar.tsx` 进入 A/B 边界但仍是单一工具栏职责；若继续加入批注、颜色面板或大纲，应把链接与查找面板拆为独立子组件，避免跨过 350 行关注阈值。

### 2026-08-16 写作响应式与背景指南补丁结构审查

- 工具折叠只为 `EditorToolbar.tsx` 增加一个局部展开状态和分组容器，文件仍低于 200 行、保持 A 级单一职责；响应式判断由 CSS 容器查询承担，没有引入窗口监听或第二套工具栏。
- `WritingView.tsx` 只补充章节操作的可访问名称与显性样式，不新增删除领域逻辑；仍复用既有 `ConfirmDialog`、`trashChapter` 和回收站流程。
- 背景提示词最初进入独立 `BackgroundImageGuide.tsx` 和独立 Markdown；后续用户明确要求只作为帮助小项，两者已删除，内容回归 `HelpView` 的静态指南列表。该列表仍为短小静态数据，不值得维持额外组件边界。
- 本轮未新增依赖、公共 API、存储 schema 或跨层职责；R0 保持现状即可。若未来加入在线图片生成，必须建立独立 provider/候选资产模块，不得继续扩写静态帮助组件。

### 2026-08-16 无框正文与音乐提示修正结构审查

- `PlaybackDock` 只增加空状态是否展示和本会话关闭状态；真实 audio、队列和快捷键职责未改变，文件仍远低于 200 行。
- `AppShell` 只传递当前是否位于音乐页，不复制播放器状态；空提示的页面可见性由 Shell 路由事实决定，关闭状态留在 Dock。
- 全宽正文与去边线完全由现有布局 CSS 修正，没有引入 ResizeObserver、窗口事件或新的布局组件；无数据/公共接口变化，R0 即可。

### 2026-08-16 行间距收尾补丁结构审查

- 行距节点属性进入独立 `LineHeight.ts` 扩展，工具栏只负责编排选择器和命令，不把 schema 定义继续堆入已接近 200 行的 `EditorToolbar.tsx`。
- `WritingView` 仅注册扩展，章节保存仍复用现有 Tiptap JSON 路径；无新依赖、状态字段、后端迁移或跨层职责，R0 保持现状。
### 2026-08-17 M8 伙伴成长与桌面形态结构审查

- M8 数据动作继续留在独立 `companionSlice`；主 store 只组合 slice，未加入窗口、记忆或成长实现。
- 桌面快照纯函数、主窗口桥接与桌面渲染分别位于 `companionDesktop.ts`、`CompanionDesktopBridge.tsx`、`DesktopCompanionWindow.tsx`，窗口职责没有塞回 `AppShell`。
- 形象/记忆/成长设置进入独立 `CompanionGrowthSection`，原 `CompanionSettingsSection` 继续只负责基础资料、provider 与读取权限。
- Rust command 主窗口守卫是安全横切职责，集中为 `require_main`，各 command 只增加注入窗口与单行守卫；无新依赖。

### 2026-08-19 角色包 Runtime 补丁结构审查

- 外部配置、导入计划、统一状态、控制器、React Runtime 与纯渲染器分别进入 `modules/companion/character|animation|rendering`；设置页只编排文件选择、导入和测试按钮，没有把动画定时器堆入 `CompanionGrowthSection`。
- 新增文件均低于 100 行且职责可单句描述；没有新增依赖或通用 `utils`。`CompanionGrowthSection` 通过独立 `CompanionCharacterPackageSection` 保持原记忆/成长职责边界。
- Rust 素材白名单集中在 command 边界，原 `AssetRepository` 路径校验和读取实现保持不变；主窗口关闭策略集中在 Tauri builder 的窗口生命周期回调。
