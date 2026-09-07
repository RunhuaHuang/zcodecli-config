# Native PowerShell entry; Git Bash is not required.
$runnerNode = if ($env:ZCODE_NODE_BIN) { $env:ZCODE_NODE_BIN } else { "node" }
& $runnerNode (Join-Path $PSScriptRoot "zcode.mjs") run @args
exit $LASTEXITCODE
