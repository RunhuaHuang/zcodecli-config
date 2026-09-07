# zcodecli-config

为 Agent 提供 macOS / Windows 共用的 ZCode CLI 安装、诊断、配置迁移和任务运行工具。
当前版本 0.3.0：一个自包含 skill、一套原生 Node 实现，不依赖 jq 或 Git Bash。

## 安装与自适应诊断

在仓库目录中运行，macOS、PowerShell、CMD 均可使用：

~~~text
node skills/zcode-cli/scripts/install.mjs
node skills/zcode-cli/scripts/install.mjs --apply
~~~

默认安装到 CODEX_HOME/skills/zcode-cli，未设置 CODEX_HOME 时使用 ~/.codex/skills/zcode-cli。
首次命令预览；--apply 执行安装，旧 skill 及本地修改保留在 skill-backups 中。
现有会话可能需要重新加载 skill。安装不修改模型配置或默认渠道。

让 Agent 读取安装后的 SKILL.md，然后运行：

~~~text
node "<skill-directory>/scripts/zcode.mjs" doctor --json --probe
~~~

诊断会检查原生 Node 平台、CLI 候选路径与版本、配置和认证是否齐备，并返回下一步动作。
--cli 选择非标准安装位置；多个安装不会静默选第一个。Windows 不要求 D:\ZCode。
--probe 使用真实 CLI 向本地模拟接口发请求，验证配置读取和 effort 参数转换，不使用真实 API Key。
真实服务的额度、认证和模型权限由另一次经授权的 smoke 测试验证。

## 调用

~~~text
node "<skill-directory>/scripts/zcode.mjs" run --cwd "<task-directory>" --mode plan --prompt "<明确的任务>"
node "<skill-directory>/scripts/zcode.mjs" run --cwd "<task-directory>" --mode build --model "<provider/model>" --effort max --prompt "<已授权的修改>"
node "<skill-directory>/scripts/zcode.mjs" smoke --cwd "<task-directory>" --model "<provider/model>"
~~~

支持 --config、--cli 和 --timeout-ms；默认 mode 是 plan。凭据不作为命令行参数传递。
Windows 路径可写 D:/work；Git Bash 包装和 PowerShell 包装都转交同一 Node 核心。

## 配置与迁移

- [统一配置指南](./ZCode%20CLI%20模型配置指南.md)
- [Windows 指南](./ZCode%20CLI%20Windows%20配置指南.md)
- [安装与修复流程](./skills/zcode-cli/references/setup.md)
- [schema 和 effort 说明](./skills/zcode-cli/references/configuration.md)

0.16.5 的用户配置使用 provider.<id>.options.apiKey/baseURL。
先前提交中“只用顶层字段”的说明有误，0.3.0 已修正。
Anthropic effort 必须使用 SDK 命名空间，例如 reasoning.providerOptionsByLevel.max.anthropic.effort；
HTTP 的 output_config 是转换结果，不能直接当作 SDK 配置。
bigmodel 是本仓库选择的显式迁移 ID，不是 CLI 自动别名。

~~~text
node "<skill-directory>/scripts/zcode.mjs" repair
node "<skill-directory>/scripts/zcode.mjs" repair --apply
~~~

repair 先预览，apply 创建备份并合并；run 只规范化临时副本。
迁移不导出密钥、不覆盖输入/已有输出；已有配置与用户明确选择优先。
需要新凭据时在本地输入，避免粘贴到聊天。

## 验证与范围

~~~text
npm test
~~~

CI 在 macOS / Windows 原生环境及 Node 20/22/24 上执行合成配置、取消清理、
路径、安装回滚/备份和迁移保真测试，无需真实密钥。
设置 ZCODE_TEST_CLI 为本地真实 zcode.cjs 路径可增加真实 CLI 本地请求测试。
CI 测试通过不等于每个服务商渠道都通过，服务端是否按 effort 执行也不能仅凭 OK 证明。

当前兼容适配针对 0.16.5；其他版本运行前会通过本地请求探测。
适配在 CLI 子进程内隔离 os.homedir()，保留 HOME/USERPROFILE 给它启动的工具。
详见[平台限制](./skills/zcode-cli/references/platforms.md)。

旧 skills/zcode-cli-windows 仅保留转发入口，新安装统一使用 skills/zcode-cli。
