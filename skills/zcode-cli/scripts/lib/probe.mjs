import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeCLI } from './runtime.mjs';

// No user key or external model service is used. The actual installed CLI must
// send the expected model and SDK effort to this loopback-only endpoint.
export async function probeCLI(cli) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-probe-'));
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', () => {
      let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end(); return; }
      requests.push({ model: body.model, effort: body.output_config?.effort ?? null, budget: body.thinking?.budget_tokens ?? null });
      const events = [
        ['message_start', { type: 'message_start', message: { id: 'msg_probe', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ZCODE_CLI_OK' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
        ['message_stop', { type: 'message_stop' }]
      ];
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(events.map(([name, value]) => 'event: ' + name + '\ndata: ' + JSON.stringify(value) + '\n\n').join(''));
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const config = {
      model: { main: 'runner-probe/probe-model' },
      provider: { 'runner-probe': { kind: 'anthropic', source: 'custom', enabled: true,
        options: { baseURL: 'http://127.0.0.1:' + server.address().port, apiKey: 'local-probe-placeholder' },
        models: { 'probe-model': { limit: { context: 200000, output: 32000 },
          reasoning: { enabled: true, levels: ['max'], defaultLevel: 'max',
            providerOptionsByLevel: { max: { anthropic: { effort: 'max', thinking: { type: 'enabled', budgetTokens: 8000 } } } } }
        }
      } } }
    };
    const env = { ...process.env };
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ZCODE_API_KEY', 'ZCODE_MODEL', 'ZCODE_BASE_URL', 'ZCODE_HTTP_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) delete env[k];
    env.NO_PROXY = '127.0.0.1,localhost';
    env.ZCODE_DATA_BASE_DIR = dir;
    const result = await executeCLI({ cli, config, configFile: path.join(dir, 'config.json'), cwd: dir, mode: 'plan', prompt: 'Only reply with: ZCODE_CLI_OK', capture: true, timeout: 20000, isolatedStorage: true, env });
    const passed = result.code === 0 && result.stdout.includes('ZCODE_CLI_OK') &&
      requests.some(r => r.model === 'probe-model' && r.effort === 'max' && r.budget === 8000);
    return { passed, exitCode: result.code, requests, scope: 'local-cli-anthropic-request-only', nextAction: passed ? 'Run an authorized smoke test for the selected real provider.' : 'Do not claim compatibility; inspect the CLI build and adapter.' };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
}
