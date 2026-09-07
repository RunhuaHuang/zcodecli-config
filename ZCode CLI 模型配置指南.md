# ZCode CLI 配置指南（macOS / Windows）

两个平台共用一套 skill 和 Node 实现。先阅读
[安装流程](./skills/zcode-cli/references/setup.md)，运行 doctor --json。
仅在遇到平台路径问题时阅读[平台说明](./skills/zcode-cli/references/platforms.md)。

1. 探测 Node 平台、CLI 路径、实际版本和现有配置；已有有效配置优先。
2. 安装/更新整个 zcode-cli skill；备份旧版本，避免只更新脚本而留下旧说明。
3. 若要迁移桌面渠道，使用 migrate 导出脱敏片段；用户已有选择无需重复询问。
4. 用 repair 预览合并，已授权后使用 --apply；缺失凭据在本地补充。
5. 用 doctor --probe 验证 CLI 请求，再按授权用 smoke 验证真实渠道。

配置字段与完整示例集中维护在[配置契约](./skills/zcode-cli/references/configuration.md)。
当前实测 CLI 0.16.5 从 provider.<id>.options 读取 baseURL/apiKey。
不要根据内部 SDK provider 对象的字段位置反推用户 JSON 的结构。

桌面 builtin:bigmodel-coding-plan 可显式迁移为 bigmodel；它是工具选择的映射，
用户也可以使用其他 provider ID。模型 ID 精确匹配，不自动转换大小写。

reasoning.levels/defaultLevel 定义选择；providerOptionsByLevel 的 SDK 命名空间
定义实际请求。Anthropic 的 max 档位应在 anthropic 下声明 effort/thinking。
禁止仅根据固定 OK 回复宣称 effort 已生效。

所有命令、参数和恢复步骤以 skill 内参考文件为准。问题按
[诊断代码](./skills/zcode-cli/references/troubleshooting.md)处理。
