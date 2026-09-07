# ZCode CLI Windows 配置与调用指南

本指南对应 `skills/zcode-cli-windows`，适用于 Windows 上通过 Git Bash 使用 ZCode CLI 的场景。配置结构与 macOS 相同，差异集中在 CLI 路径、shell、Node 配置读写和 Windows 路径转换。

## 1. Windows 与 macOS 的差异

| 维度 | macOS | Windows |
| --- | --- | --- |
| CLI 入口 | `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` | 默认探测 `D:\ZCode\resources\glm\zcode.cjs` 等候选路径 |
| shell | `/bin/bash` | Git Bash；不支持 WSL 或 PowerShell |
| 配置校验 | `node` + `jq` | 仅 `node`，不依赖 `jq` |
| 单次模型覆盖 | 临时 `HOME` + 配置副本 | 临时 `USERPROFILE`/`HOME` + 配置副本 |
| 路径传递 | POSIX 路径 | 传给 Node 前通过 `cygpath -w` 转换 |
| `chmod 600` | 可作为 POSIX 权限约束 | NTFS 上基本无效，实际依赖用户目录 ACL |

两边都不要依赖 CLI help 中实际不可用的 `--settings` 参数。当前 `0.16.5` 的 runner 通过临时 profile 隔离单次覆盖。

## 2. 安装与路径

从 Git Bash 检查 Node 和路径转换工具：

```bash
node --version
cygpath --version
```

默认配置文件为：

```text
%USERPROFILE%\\.zcode\\cli\\config.json
```

如果 CLI 不在 `D:\ZCode\resources\glm\zcode.cjs`，设置：

```bash
export ZCODE_CLI_PATH='E:\\Apps\\ZCode\\resources\\glm\\zcode.cjs'
```

也可以为某次调用直接传入环境变量：

```bash
ZCODE_CLI_PATH='D:\\ZCode\\resources\\glm\\zcode.cjs' \
  skills/zcode-cli-windows/scripts/run-zcode.sh \
  --cwd 'D:\\work\\project' \
  --mode plan \
  --prompt 'Only reply with: ZCODE_CLI_OK'
```

## 3. 配置迁移

桌面版和 CLI 使用独立配置文件。桌面端配置位于：

```text
%USERPROFILE%\\.zcode\\v2\\config.json
```

安全导出脱敏 provider：

```bash
node skills/zcode-cli-windows/scripts/migrate-desktop-provider.mjs \
  --provider-id builtin:bigmodel-coding-plan \
  --output ./bigmodel-provider.fragment.json
```

脚本默认使用 `os.homedir()` 定位配置，因此同一脚本也可在 macOS 使用。它不会输出或复制 API Key，也不会生成 `model.main`；用户应在审阅后手工合并并补充 CLI 专用密钥。

BigModel 的 provider ID 需要显式转换：

```text
builtin:bigmodel-coding-plan/GLM-5.3-Flash -> bigmodel/GLM-5.3-Flash
builtin:bigmodel-coding-plan/glm-5.3       -> bigmodel/glm-5.3
```

CLI provider 的 `baseURL`、`apiKey` 应放在 provider 顶层。桌面配置中的 `options.baseURL` 可以迁移为顶层 `baseURL`，但不要只保留 `options`。

## 4. 调用 runner

默认使用 CLI 配置中的 `model.main`：

```bash
skills/zcode-cli-windows/scripts/run-zcode.sh \
  --mode yolo \
  --cwd 'D:\\work\\project' \
  --prompt '明确说明任务目标、文件范围和验收条件'
```

单次选择模型和 effort：

```bash
skills/zcode-cli-windows/scripts/run-zcode.sh \
  --mode plan \
  --cwd 'D:\\work\\project' \
  --model 'bigmodel/GLM-5.3-Flash' \
  --effort max \
  --prompt 'Only reply with: ZCODE_CLI_OK'
```

支持的参数与 macOS runner 一致：`--cwd`、`--prompt`、`--mode`、`--model`、`--effort`。`--cwd` 可以使用 `D:/work/project`、`/d/work/project` 或 `D:\\work\\project`。

临时覆盖运行时，脚本会短暂复制完整 CLI 配置到临时 profile，并同时设置 `USERPROFILE` 与 `HOME`，以确保 Windows Node 的 `os.homedir()` 指向该副本。任务结束后自动清理。共享电脑上不要忽略这段时间内 API Key 位于 `%TEMP%` 的风险。

## 5. 常见问题

### `cygpath not found`

当前 shell 不是 Git Bash，或 Git for Windows 未正确安装。不要改用 WSL/PowerShell 继续运行此模块。

### `ZCode CLI not found`

先确认 `D:\ZCode\resources\glm\zcode.cjs` 是否存在；如果安装在其他位置，设置 `ZCODE_CLI_PATH`。不要移动固定安装目录而忘记同步环境变量。

### `Unknown option: --settings`

这是 CLI `0.16.5` 的实际解析行为。使用本模块的 runner；不要向命令行手工追加 `--settings`。

### `3007 captcha verify failed`

`zcode.z.ai` 套餐渠道可能需要桌面端会话上下文。优先改用标准 API key 渠道（例如 `open.bigmodel.cn`）或已验证的自定义渠道。

### `\\r: command not found`

脚本被保存成 CRLF。用 `dos2unix` 转为 LF，或从仓库重新获取文件。仓库通过 `.gitattributes` 强制 `.sh` 与 `.mjs` 使用 LF。

## 6. 安全清单

- 不把 API Key、完整配置、Authorization 头或环境变量输出到日志或聊天；
- 不把 `%USERPROFILE%\\.zcode\\cli\\config.json` 或临时 profile 提交到 Git；
- 迁移工具只输出脱敏 provider 片段；
- 使用共享电脑时，任务完成前不要让其他用户访问 `%TEMP%`；
- CLI 升级后重新执行一次无副作用冒烟测试：`--prompt 'Only reply with: ZCODE_CLI_OK'`。
