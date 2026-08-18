# ZCode CLI：从桌面版迁移渠道、模型与推理设置（macOS）

本指南面向已经安装 ZCode 桌面版的用户，以及协助用户配置 ZCode CLI 的 Agent。目标是将**桌面版中已登记的渠道和模型参数**迁移到 CLI，补齐用户明确提供的 API Key，并让用户自己选择 CLI 的主模型和推理强度。

> 不要把真实 API Key 写进聊天、文档、Git、终端输出或截图。本文全部使用占位符。

## 1. 关键文件与 CLI 路径

| 用途 | 路径 |
| --- | --- |
| ZCode CLI | `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` |
| 桌面版配置 | `~/.zcode/v2/config.json` |
| CLI 配置 | `~/.zcode/cli/config.json` |

桌面版与 CLI 的配置文件是两套独立文件。桌面版能使用某个模型，**不代表** CLI 已能调用它。

先验证 CLI 可用：

```bash
ZCODE_CLI='/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs'
node "$ZCODE_CLI" version
node "$ZCODE_CLI" --help
```

> 当前测试的 ZCode 桌面包中，CLI 适合通过 `--prompt` 进行无交互调用；不要把配置或执行流程建立在 TUI 上。未来版本若官方另行提供 TUI，仍应以其官方文档为准。

## 2. Agent 的默认迁移流程

当用户说“帮我把桌面版 ZCode 模型同步到 CLI”时，Agent 应按下列顺序工作。

### 第一步：脱敏盘点桌面端已有渠道

只读取 `~/.zcode/v2/config.json` 的非敏感字段，汇总渠道名、接口类型、接口地址、模型和模型参数。**绝不显示、复制或请求输出桌面配置中的 API Key。**

可使用类似的只读命令：

```bash
jq '
  .provider | to_entries | map({
    id: .key,
    name: .value.name,
    kind: .value.kind,
    enabled: .value.enabled,
    baseURL: .value.options.baseURL,
    models: ((.value.models // {}) | to_entries | map({
      id: .key,
      name: .value.name,
      limit: .value.limit,
      modalities: .value.modalities,
      reasoning: .value.reasoning
    }))
  })
' ~/.zcode/v2/config.json
```

向用户展示一个简洁、无密钥的清单，而不是整份原始 JSON。

### 第二步：主动向用户确认迁移范围和密钥

盘点完成后，Agent 应主动询问以下三件事：

1. **迁移范围**：要迁移全部渠道，还是只迁移其中几个？
2. **API Key**：请用户为每个要迁移的渠道提供 CLI 使用的 API Key；即使桌面配置看起来已有密钥，也不要从那里摘录或回显。
3. **主模型**：请用户选择 `渠道 / 模型` 作为 CLI 的 `model.main`。不要替用户预设或推荐某个模型。

若用户希望指定思考强度，还要询问：该主模型使用哪个已支持的 effort，例如 `low`、`high`、`max` 或 `off`。

只有在用户明确同意“帮我配置这些渠道”并提供所需密钥后，才写入 `~/.zcode/cli/config.json`。

为减少来回沟通，Agent 应将确认集中在一条消息中，例如：

> 我已从桌面版发现以下渠道和模型（已隐藏密钥）。请一次回复：① 要迁移的渠道（全部或名称列表）；② 每个选中渠道给 CLI 使用的 API Key；③ CLI 的主模型，格式为“渠道 / 模型”；④ 可选的默认 effort；⑤ 是否逐渠道执行一次无副作用连通测试。

### 第三步：转换模型数据

从桌面端复制到 CLI 的是以下**非敏感**信息：

- provider 名称、`kind`、`baseURL`、启用状态；
- 每个模型的 ID、别名、上下文窗口、最大输出、输入/输出模态；
- 已知的推理档位。

转换规则：

| 桌面版字段 | CLI 字段 |
| --- | --- |
| `provider.<id>.models` | `provider.<id>.models` |
| `limit.context` / `limit.output` | 原样保留 |
| `modalities` | 原样保留 |
| `reasoning.variants` | `reasoning.levels` |
| `reasoning.defaultVariant` | `reasoning.defaultLevel` |

CLI 不使用桌面端的 `variants/defaultVariant` 作为 effort 选择。迁移后应改为 `levels/defaultLevel`。

`providerOptionsByLevel` 是实际向 API 传递推理强度的请求参数。除非确认某个服务商的格式，否则不要猜测或编造这些参数；错误参数可能造成请求失败。没有这组参数时，CLI 可以记录和选择 effort 档位，但服务端是否据此改变推理强度取决于该接口。

### 第四步：写入、验证和测试

1. 保留 CLI 配置中既有的 `mcp`、`skills`、`plugins` 等无关设置；仅合并 `model` 与 `provider`。
2. 使用 `apply_patch` 或等价的精确 JSON 编辑方式，避免覆盖整份配置。
3. 校验 JSON：

   ```bash
   jq empty ~/.zcode/cli/config.json
   ```

4. 限制密钥文件权限：

   ```bash
   chmod 600 ~/.zcode/cli/config.json
   ```

5. 用一个无副作用的固定提示词测试用户选择的主模型：

   ```bash
   node "$ZCODE_CLI" --mode plan --prompt 'Only reply with: ZCODE_CLI_OK'
   ```

6. 若用户要求测试多个渠道，使用临时 settings 文件分别测试；不要反复修改全局 `model.main`。详见第 6 节的运行脚本。

## 3. CLI 配置的最小结构

CLI 至少需要一个主模型和与之对应的 provider：

```json
{
  "model": {
    "main": "YOUR_PROVIDER_ID/YOUR_MODEL_ID"
  },
  "provider": {
    "YOUR_PROVIDER_ID": {
      "name": "Provider label",
      "kind": "anthropic",
      "options": {
        "apiKey": "USER_SUPPLIED_API_KEY",
        "baseURL": "https://provider.example/api"
      },
      "enabled": true,
      "source": "custom",
      "models": {
        "YOUR_MODEL_ID": {
          "name": "Model label",
          "limit": {
            "context": 200000,
            "output": 32000
          },
          "modalities": {
            "input": ["text"],
            "output": ["text"]
          }
        }
      }
    }
  }
}
```

`model.main` 必须精确匹配 `provider-id/model-id`。其中模型 ID 必须是同一 provider 的 `models` 对象中的键。

### 协议类型

| 接口协议 | `kind` |
| --- | --- |
| Anthropic Messages 兼容 | `anthropic` |
| OpenAI Chat Completions 兼容 | `openai-compatible` |

不要只根据模型名称猜协议；应根据服务商文档或桌面端已保存的 `kind` 决定。

## 4. 迁移多个渠道的示例

一个 CLI 配置可以有多个 provider。用户可自行决定哪个作为 `model.main`：

```json
{
  "model": {
    "main": "provider-a/model-one"
  },
  "provider": {
    "provider-a": {
      "name": "Provider A",
      "kind": "anthropic",
      "options": {
        "apiKey": "USER_KEY_A",
        "baseURL": "https://provider-a.example/anthropic"
      },
      "models": {
        "model-one": {
          "limit": { "context": 200000, "output": 32000 },
          "modalities": { "input": ["text"], "output": ["text"] }
        }
      }
    },
    "provider-b": {
      "name": "Provider B",
      "kind": "openai-compatible",
      "options": {
        "apiKey": "USER_KEY_B",
        "baseURL": "https://provider-b.example/v1"
      },
      "models": {
        "model-two": {
          "limit": { "context": 1000000, "output": 128000 },
          "modalities": { "input": ["text"], "output": ["text"] }
        }
      }
    }
  }
}
```

## 5. 推理强度（thinking effort）

对支持推理档位的模型，CLI 配置使用：

```json
"reasoning": {
  "enabled": true,
  "levels": ["low", "high", "max"],
  "defaultLevel": "max"
}
```

这意味着当用户没有指定 effort 时，CLI 使用该模型的 `defaultLevel`。当用户指定 effort 时，Agent 必须先确认该值在 `levels` 中；不支持时应说明，而不是自行替换成别的档位。

### 已验证的 BigModel GLM-5.3 映射

对于 BigModel 的 Anthropic 兼容 GLM-5.3，已验证可使用以下完整配置：

```json
"reasoning": {
  "enabled": true,
  "levels": ["low", "high", "max"],
  "defaultLevel": "max",
  "providerOptionsByLevel": {
    "low": {
      "output_config": { "effort": "low" },
      "thinking": { "type": "enabled", "budgetTokens": 8000 }
    },
    "high": {
      "output_config": { "effort": "high" },
      "thinking": { "type": "enabled", "budgetTokens": 16000 }
    },
    "max": {
      "output_config": { "effort": "max" },
      "thinking": { "type": "enabled", "budgetTokens": 32000 }
    }
  }
}
```

其他 provider 需要使用其自身文档规定的请求字段。Agent 不应把 BigModel 的参数套用到未验证的第三方接口。

## 6. 配置完成后的直接调用

对每个任务，优先使用运行脚本临时选择模型和 effort。脚本位于已安装的 `zcode-cli` 技能内：

```bash
"$HOME/.codex/skills/zcode-cli/scripts/run-zcode.sh" \
  --mode yolo \
  --cwd "/target/directory" \
  --prompt "明确说明任务目标、文件范围和验收条件"
```

- `--mode yolo` 表示 ZCode 在该任务中拥有完整工具权限，只在用户授权写文件、运行命令或联网时使用。
- 只读分析使用 `--mode plan`。
- 不传 `--model` 或 `--effort` 时，脚本使用配置中的 `model.main` 及该模型的 `defaultLevel`。

### 单次任务临时指定模型和 effort

```bash
"$HOME/.codex/skills/zcode-cli/scripts/run-zcode.sh" \
  --cwd "/target/directory" \
  --mode yolo \
  --model "provider-id/model-id" \
  --effort "max" \
  --prompt "明确说明任务目标、文件范围和验收条件"
```

脚本会：

1. 验证目标模型与 effort 已在 CLI 配置中登记；
2. 验证该 effort 有 `providerOptionsByLevel` 的真实请求映射；
3. 生成仅当前进程使用、权限为 `600` 的临时 settings 文件；
4. 通过 CLI 的 `--settings` 运行任务；
5. 无论任务成功、失败或中断，都自动删除临时文件。

因此它不会修改持久的 `~/.zcode/cli/config.json`，也不会影响桌面版 ZCode。若所选模型没有该 effort 的请求映射，脚本会拒绝运行并提示原因，避免“看似切换成功、实际服务端未生效”。

## 7. 常见错误

### `Model config is missing`

依次检查：

1. `~/.zcode/cli/config.json` 存在且是有效 JSON；
2. 存在 `model.main`；
3. `model.main` 为 `provider-id/model-id`；
4. 对应 provider 和模型在 `provider` 中存在。

### 接口请求失败

确认：

1. `kind` 与接口协议一致；
2. `baseURL` 含有服务商要求的完整路径；
3. 用户提供的 API Key 有效且具备模型权限；
4. 模型 ID 与服务商实际 ID 完全一致；
5. 网络、代理和自定义证书设置允许访问该接口。

## 8. 安全清单

- 不输出 API Key、Authorization 头、完整配置文件或进程环境变量。
- 不从桌面端配置中复制或回显旧密钥；向用户索取用于 CLI 的密钥。
- 不把 `~/.zcode/cli/config.json` 提交到 Git、上传或分享。
- 用 `chmod 600 ~/.zcode/cli/config.json` 限制访问。
- 若密钥曾被粘贴到公开或多人可见的聊天记录，应建议用户轮换该密钥。
