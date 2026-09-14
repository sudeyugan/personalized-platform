# Quality Gates

> 验证强度按风险和交付时机匹配。日常开发、合并验证和正式发布不得混为一次动作。历史门禁证据已移至 [`docs/archive/QUALITY_GATES_HISTORY.md`](../docs/archive/QUALITY_GATES_HISTORY.md)。

## 命令

| 目的 | 命令 | 内容 |
|---|---|---|
| 定向内循环 | `pnpm verify:quick -- <test-file...>` | 仅运行指定 Vitest 文件；不构建、不打包、不改状态 |
| UI 合并验证 | `pnpm verify:ui` | typecheck、lint、Web build；不自动运行测试、不生成安装包 |
| 跨层合并验证 | `pnpm verify:full` | UI 合并验证 + 前端全量测试 + Rust 测试；不生成安装包 |
| 本地候选打包 | `pnpm release:build` | 仅 Tauri/NSIS；不更新发布状态或哈希记录 |
| 正式里程碑发布 | `pnpm release:prepare ...` | 完整验证、Tauri/NSIS、状态、文档和哈希收口 |
| 正式跨层补丁 | `pnpm release:patch -- <version> <summary>` | 完整验证、Tauri/NSIS、状态和哈希收口 |
| 正式纯 UI 补丁 | `pnpm release:patch:ui -- <version> <summary>` | typecheck、lint、Tauri/NSIS、状态和哈希；不跑前端/Rust测试 |
| 文档检查 | `pnpm docs:test` / `pnpm docs:check` | 文档自动化测试与一致性检查 |

## 默认工作流

1. 普通开发默认先完成代码，不自动运行测试；允许明确交付为“代码已完成，未自动验证，等待用户体验”。
2. 用户反馈足以验证的 UI、文案、布局和交互手感，由用户实际使用发现问题；Agent 不为形式完整主动扩展测试。
3. 只有修复复杂逻辑、容易复发的缺陷或用户明确要求时，才用 `verify:quick` 跑少量相关测试。
4. 一批 UI 代码需要静态收口时可运行 `verify:ui`；高风险跨层改动或正式大版本使用 `verify:full`。
5. 只有用户明确需要可安装包、正式补丁或里程碑发布时，才运行 Tauri/NSIS、状态和哈希门禁；不提前重复其包含的检查。
6. 同一公开版本不得对应多个不同二进制；未公开候选可由 `release:build` 本地覆盖，但不登记为正式发布。

## 风险分级

| 改动 | 最低验证 |
|---|---|
| 纯文档 | 相关格式/链接检查；触及生成区块或状态规则时再跑 `docs:test`、`docs:check` |
| 文案、CSS、局部组件 | 默认不跑测试；用户体验或代码审查即可，必要时 `verify:quick` |
| 前端领域逻辑、编辑 schema、依赖 | 只跑最相关测试；批次收口可用 `verify:ui`，不默认全量 |
| Rust、Cargo/Tauri 配置、数据库、文件仓储 | 定向 Rust/前端测试；交付代码前 `verify:full` |
| 备份、恢复、加密、权限和秘密 | `verify:full` + 相关失败路径与安全边界复核 |
| 正式安装包 | 对应风险验证 + Tauri/NSIS + 哈希与发布文档 |

`verify:ui` 不运行任何测试，仅提供静态检查和 Web 构建。Rust、Cargo/Tauri、数据库、文件仓储、备份恢复、加密、秘密或权限边界仍使用 `verify:full`；普通低风险任务可以不运行任何 verify 命令，但必须在交付时如实说明。

## 文档与状态触发

- 普通修复、定向测试通过和中间实现步骤不更新全套状态文档。
- 只有里程碑、发布状态、计划、架构、风险、用户决策或验收结果发生实质变化时，才更新对应文档。
- 同版本未发布反馈只更新原反馈项；形成正式补丁版本时再更新 CHANGELOG、发布状态和安装包记录。
- README、产品文档和 Roadmap 只在其事实确实变化时更新，不作为每个任务的固定打卡项。

## 当前基线

- 最近迁移验证：前端 69/69、Rust 26/26、TypeScript、oxlint、生产 Web build 与文档一致性通过。
- M8 `2.0.0` 仍为已交付待自然体验；桌面 E2E 和设备手感继续按真实反馈针对性验证。
- 历史版本的详细测试、安装包和哈希证据见 `docs/*验收与发布说明.md`、CHANGELOG 与归档文件。
