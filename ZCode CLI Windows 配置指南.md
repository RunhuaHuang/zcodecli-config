# ZCode CLI Windows 配置指南

Windows 与 macOS 现在安装同一个 skills/zcode-cli，不再维护两套配置逻辑。
在 PowerShell、CMD 或 Git Bash 中都可以直接运行：

~~~text
node skills/zcode-cli/scripts/install.mjs --apply
node skills/zcode-cli/scripts/zcode.mjs doctor --json --probe
~~~

上面第二条在仓库中测试；日常使用应运行安装目录中的脚本。
安装位置优先 CODEX_HOME，默认 %USERPROFILE%\.codex\skills\zcode-cli。

- 使用 Windows 原生 Node，最低 Node 20；CLI 本身的 Node 兼容性由实际探测确认。
- 不需要 jq，也不要求 Agent 从 Git Bash 启动。
- 自动查找 LOCALAPPDATA、Program Files、卸载注册表和候选路径。
- 非标准安装位置使用 --cli "E:/Apps/ZCode/resources/glm/zcode.cjs"。
- 多个候选由用户选择，D:\ZCode 仅是兼容历史机器的候选之一。
- 路径推荐 "D:/工作项目"；PowerShell 可直接调用 Node，无需修改执行策略。
- WSL/Linux Node 与 Windows Node 分别诊断，不混用配置目录和可执行文件。
- .gitattributes 固定脚本 LF 行尾；Git Bash 包装避免误转换 prompt 内的路径文本。
- NTFS 文件访问由 ACL 控制，不能把 chmod 600 当作 Windows 的保护承诺。

认证错误按实际 endpoint、套餐与会话处理，不自动改成其他渠道。
用户提供的 3007 captcha 经验只是特定环境观察，不是所有 Windows 安装的结论。

详见[统一安装流程](./skills/zcode-cli/references/setup.md)、
[配置契约](./skills/zcode-cli/references/configuration.md)和
[平台实现与限制](./skills/zcode-cli/references/platforms.md)。
