# Configuration contract

Verified with the local macOS ZCode CLI 0.16.5 on 2026-09-07 by observing
requests sent to a localhost Anthropic-compatible endpoint. This verifies CLI
translation, not a provider's entitlement or interpretation of effort.

## Provider connection fields

The user config consumed by this build uses provider.<id>.options:

~~~json
{
  "model": { "main": "my-provider/my-model" },
  "provider": {
    "my-provider": {
      "kind": "anthropic",
      "source": "custom",
      "enabled": true,
      "options": {
        "baseURL": "https://provider.example/anthropic",
        "apiKey": "LOCAL_KEY_PLACEHOLDER"
      },
      "models": {
        "my-model": {
          "limit": { "context": 200000, "output": 32000 }
        }
      }
    }
  }
}
~~~

Use the provider's actual model metadata, protocol and endpoint. Anthropic uses
kind anthropic; OpenAI Chat Completions compatibility uses openai-compatible.
Top-level apiKey/baseURL in older repository examples were incorrect for this
file schema. The internal runtime receives top-level fields after normalization;
that internal representation must not be confused with the user config format.

The runner moves unambiguous legacy top-level fields into options in its
temporary copy. If both forms disagree, it stops. repair can persist this
normalization with a backup.

## Provider and model IDs

model.main selects an exact provider object key and its model object key.
The migration helper chooses bigmodel for builtin:bigmodel-coding-plan.
That is this repository's explicit mapping, not an automatic alias or a universal
CLI naming requirement. A user can choose another ID with --target-id.
Retain model case and IDs; do not invent equivalent aliases.

## Reasoning options versus HTTP fields

An Anthropic SDK mapping example:

~~~json
{
  "enabled": true,
  "levels": ["max"],
  "defaultLevel": "max",
  "providerOptionsByLevel": {
    "max": {
      "anthropic": {
        "effort": "max",
        "thinking": { "type": "enabled", "budgetTokens": 8000 }
      }
    }
  }
}
~~~

This belongs under a model's reasoning property. The local probe verifies that
it becomes output_config.effort=max and thinking.budget_tokens=8000 in HTTP.
8000 is the probe's test budget, not a recommendation for every provider/model.
The actual service must support the chosen fields and level.

Putting raw output_config directly under providerOptionsByLevel.max can return
OK without transmitting effort. The runner recognizes and converts only the
old Anthropic shape used by this repository. Unknown shapes are not guessed.
OpenAI adapters use their own SDK namespaces and require separate verification.

An explicit or configured default effort must have a nonempty mapping in the
selected adapter namespace. Do not create empty mappings merely to pass validation.
