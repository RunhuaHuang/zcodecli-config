# zcodecli-config

一个供 Agent 使用的 macOS ZCode CLI 配置与调用包。它帮助 Agent 从已安装的 ZCode 桌面版中脱敏盘点渠道与模型、在获得用户明确授权和 API Key 后配置 CLI，并通过可复用脚本执行任务。

桌面版与 CLI 使用独立的 provider 命名空间。例如桌面版的
`builtin:bigmodel-coding-plan/GLM-5.3-Flash` 在 CLI 配置中应映射为
`bigmodel/GLM-5.3-Flash`；不要把桌面端的 `builtin:` provider ID 直接写入 CLI 的
`model.main`。

## 给 Agent 的使用方式

将整个仓库提供给 Agent，并要求它先阅读：

1. [`ZCode CLI 模型配置指南.md`](./ZCode%20CLI%20模型配置指南.md) — 配置、迁移和安全要求；
2. [`skills/zcode-cli/SKILL.md`](./skills/zcode-cli/SKILL.md) — 配置完成后的直接调用方法。

配置过程必须让用户自己选择迁移范围、提供用于 CLI 的 API Key，并确认默认模型。仓库不包含也不应提交任何真实密钥或 `~/.zcode/cli/config.json`。

## 内容

```text
ZCode CLI 模型配置指南.md       配置与从桌面端迁移的流程
skills/zcode-cli/               可安装或直接引用的 Codex skill
└── scripts/run-zcode.sh        单次任务运行器；模型/effort 覆盖不改持久配置
```

如果需要把调用 skill 安装到 Codex，可复制 `skills/zcode-cli` 至 `~/.codex/skills/`。也可让 Agent 直接使用仓库内的 `skills/zcode-cli/scripts/run-zcode.sh`。

## 运行环境与范围

- 面向 macOS 上已安装的 ZCode 桌面版；运行器依赖 `node` 与 `jq`。
- 本仓库仅覆盖无交互的 CLI 调用（`--prompt`）。当前验证的桌面包不提供可用 TUI；不要依赖 TUI 或 `/mode` 等交互命令。
- 运行器提供 `plan`、`build`、`edit`、`yolo` 四种权限模式。需要写入、命令执行或联网时，Agent 仍须取得用户对具体任务的授权。
- 针对已验证的 ZCode CLI `0.16.5`，运行器不会使用帮助文本中实际不可用的 `--settings` 参数；单次模型/effort 覆盖通过临时 `HOME` 和临时 `0600` CLI 配置副本实现，任务结束后自动清理。

## 安全

- 不要把 API Key、完整 CLI 配置、Authorization 头或环境变量提交到 Git。
- Agent 只可从桌面版读取非敏感模型元数据；用于 CLI 的 Key 必须由用户明确提供。
- CLI 配置文件应使用 `chmod 600 ~/.zcode/cli/config.json`。
