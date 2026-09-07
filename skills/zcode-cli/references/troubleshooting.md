# Diagnostic actions

| Code | Agent action |
| --- | --- |
| CLI_NOT_FOUND | Check installation; inspect doctor candidates and select --cli. |
| CLI_AMBIGUOUS | Ask which detected installation to use if not already specified. |
| CLI_VERSION_FAILED | Check native Node and compatibility with the selected bundle. |
| CLI_VERSION_UNVERIFIED / CLI_PROBE_FAILED | Run the local probe; inspect this build before claiming support. |
| CONFIG_UNREADABLE | In setup, locate/create the user config; in a run, verify --config. |
| CONFIG_INVALID_JSON | Use a local editor; do not print the raw parse exception or file. |
| CONFIG_NORMALIZATION_AVAILABLE | Temporary normalization is available; preview repair for a durable update. |
| PROVIDER_FIELD_CONFLICT | Resolve divergent options/top-level values locally. |
| MODEL_REQUIRED / MODEL_NOT_FOUND | Choose an exact existing provider/model; do not lowercase or substitute. |
| EFFORT_UNSUPPORTED / EFFORT_MAPPING_MISSING | Check model capability and SDK namespace; do not fake a mapping. |
| AUTH_REQUIRED | Use local credential entry or existing user secret mechanism. |
| PROJECT_MODEL_OVERRIDE | Reconcile project model overrides before running; no silent rerouting. |
| OUTPUT_EXISTS / OUTPUT_IS_INPUT | Choose a new migration output. |
| CONFIG_CHANGED / CONFIG_LOCKED | Re-read the config; inspect an abandoned lock before removing it. |
| INSTALL_TARGET_UNRECOGNIZED | Choose a proper skill directory; never overwrite unrelated data. |

3007/captcha, 401/403, quota and gateway-session errors belong to the selected
endpoint/authentication workflow. Do not classify them as Windows-only errors
or automatically switch billing channels. A desktop session-bound gateway is
not interchangeable with a standard API-key endpoint.

doctor exits 0 when the selected configuration is ready, 2 for actionable
problems. run preserves CLI exit status, uses 124 for timeout, 130/143 for handled
cancellation. Errors emitted by the runner are structured and suppress raw
configuration/JSON exceptions. Known configured API-key values are redacted from
relayed CLI output; arbitrary secrets in model-generated text cannot be guaranteed
safe, so never ask a model to print secrets.
