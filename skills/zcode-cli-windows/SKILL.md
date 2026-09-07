---
name: zcode-cli-windows
description: Use the preconfigured ZCode CLI from Git Bash on Windows, including safe model/effort overrides and desktop-provider migration.
---

# ZCode CLI Windows runner

这个模块专用于 Windows 上的 Git Bash。不要在 WSL、PowerShell 或普通的
Linux shell 中运行它；Windows 版 Node、Git Bash 的路径转换和 `os.homedir()`
行为是本模块的一部分。

## 前置条件

- 已安装 Git for Windows，并从 Git Bash 启动 Agent 或脚本；
- `node` 可执行；本模块不依赖 `jq`；
- ZCode CLI 通常位于 `D:\ZCode\resources\glm\zcode.cjs`。如果安装位置不同，设置 `ZCODE_CLI_PATH`；
- CLI 配置位于 `%USERPROFILE%\.zcode\cli\config.json`，桌面版配置位于 `%USERPROFILE%\.zcode\v2\config.json`。

当前适配针对实测的 ZCode CLI `0.16.5`。帮助文本虽然列出了
`--settings`，headless 参数解析器实际会拒绝它，因此本模块通过临时
`USERPROFILE`/`HOME` 和配置副本实现单次覆盖。

## 运行任务

运行器与 macOS 版本保持相同的参数接口：

```bash
"$HOME/.codex/skills/zcode-cli-windows/scripts/run-zcode.sh" \
  --mode yolo \
  --cwd "D:/work/project" \
  --prompt "明确说明任务目标、文件范围和验收条件"
```

也可以直接使用仓库内的脚本。`--cwd` 支持 Git Bash 路径和 Windows 路径，脚本会在传给 Node CLI 前用 `cygpath -w` 转换：

```bash
skills/zcode-cli-windows/scripts/run-zcode.sh \
  --cwd "D:\\work\\project" \
  --model "bigmodel/GLM-5.3-Flash" \
  --effort max \
  --mode plan \
  --prompt "Only reply with: ZCODE_CLI_OK"
```

脚本会：

1. 自动探测 `D:\ZCode`、`C:\ZCode`、常见用户安装目录中的 CLI；
2. 用 Node 校验 JSON、provider、模型和 effort，不需要 `jq`；
3. 需要覆盖模型或 effort 时，在临时目录创建配置副本；
4. 同时设置临时 `USERPROFILE` 和 `HOME`，让 Windows Node 的 `os.homedir()` 读取临时 profile；
5. 将临时目录中的配置和工作目录转换为 Windows 路径后启动 CLI；
6. 退出时删除临时目录。

`chmod 600` 会被保留以兼容 macOS，但 NTFS 上它不是有效的权限边界；Windows 实际依赖用户 profile 的 ACL。临时 profile 会短暂包含 API Key，共享电脑上应谨慎使用。

## 配置和模型名

CLI 与 macOS 共用以下配置结构：`model.main`、`provider`、`reasoning.levels`、`reasoning.defaultLevel` 和 `providerOptionsByLevel`。

桌面版的内置渠道名不是 CLI provider ID。BigModel 的显式映射是：

```text
builtin:bigmodel-coding-plan/GLM-5.3-Flash -> bigmodel/GLM-5.3-Flash
builtin:bigmodel-coding-plan/glm-5.3       -> bigmodel/glm-5.3
```

CLI provider 的 `apiKey` 和 `baseURL` 应放在 provider 顶层，而不是只放在桌面端常见的 `options` 对象里。不要将真实 API Key 写入仓库、日志、聊天或命令输出。

## 从桌面版导出脱敏 provider

仓库中的 `scripts/migrate-desktop-provider.mjs` 是纯 Node 脚本，默认通过
`os.homedir()` 查找当前用户的桌面配置；因此 macOS 和 Windows 都能使用：

```bash
node skills/zcode-cli-windows/scripts/migrate-desktop-provider.mjs \
  --provider-id builtin:bigmodel-coding-plan \
  --output ./bigmodel-provider.fragment.json
```

输出只包含 provider、模型元数据和顶层 `baseURL`，不会复制 API Key、桌面端 `options` 或 `model.main`。生成片段后，用户必须自行确认 CLI provider ID、补充用户明确提供的 API Key，并选择 `model.main`。

## Windows 专属注意事项

- 不要把 macOS 的 runner 直接复制到 Windows；macOS 版依赖 `jq`，且路径和临时 profile 逻辑不同；
- 不要使用 WSL 的 `bash` 或 PowerShell；必须使用 Git Bash；
- 不要移动或重命名 `D:\ZCode`，除非同时设置 `ZCODE_CLI_PATH`；
- `.sh` 和 `.mjs` 文件必须保持 LF 行尾；若看到 `\r: command not found`，先用 `dos2unix` 修复；
- `zcode.z.ai` 的套餐渠道可能需要桌面会话上下文，出现 `3007 captcha verify failed` 时改用标准 API key 渠道或已验证的自定义渠道；
- CLI 升级后重新运行一次 `--prompt 'Only reply with: ZCODE_CLI_OK'` 冒烟测试。

## 安全要求

- 不打印 API Key、完整配置、Authorization 头或进程环境；
- 不从桌面配置复制旧密钥，CLI 密钥必须由用户明确提供；
- 不提交 `%USERPROFILE%\\.zcode\\cli\\config.json`、临时 profile 或生成的 provider 片段；
- 共享机器上，注意临时 profile 在任务期间会含有完整配置。
