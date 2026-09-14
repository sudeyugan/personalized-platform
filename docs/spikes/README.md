# M0 技术验证索引

| 验证项 | 结论 | 已验证 | 尚待验证 |
|---|---|---|---|
| 编辑器与 10 万字 | 暂采用 Tiptap，长章建议拆分 | 10 万字符计数与 JSON 序列化 | 真实 IME、Tiptap 10 万字输入/滚动、图片块 |
| DOCX/PDF/Markdown | 调整：Markdown 作为透明兜底 | DOCX fixture 生成/重开、PDF 重开、Markdown 源文本 | 浮动图、字体、复杂分页和嵌套列表 |
| 加密 vault | 采用 Argon2id + XChaCha20-Poly1305 | 算法加解密与密文原字节扫描 | 标题/资源/缩略图/版本/索引的完整 vault 扫描 |
| 一致性备份 | 采用 SQLite 一致快照 + `.partial` 提交 | 主库损坏后快照读取、恢复草稿原子提交 | 附件校验清单、完整 `.yiyu-backup` 恢复 |
| 桌面伙伴窗口 | 调整：能力隔离完成前不发布 | capability 权限边界评审 | 可运行透明/置顶/拖动第二窗口原型 |

依赖与许可证冻结至 M2：Tauri（Apache-2.0/MIT）、React（MIT）、Tiptap 核心（MIT）、SQLite/rusqlite（MIT）、Argon2（MIT/Apache-2.0）、RustCrypto XChaCha20-Poly1305（MIT/Apache-2.0）、docx（MIT）、Mammoth（BSD-2-Clause）、pdf-lib（MIT）。最终分发前仍需由发布流程生成第三方许可证清单。
