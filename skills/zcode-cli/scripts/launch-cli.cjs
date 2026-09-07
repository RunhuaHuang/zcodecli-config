// ZCode CLI 0.16.5 resolves its config from os.homedir(), but rejects --settings.
// Override that function only inside this CLI process. Do not change HOME or
// USERPROFILE and do not inject NODE_OPTIONS into subprocesses. Git, SSH and
// child Node programs retain the real user environment.
const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const [profile, cli, ...args] = process.argv.slice(2);
if (!profile || !cli || !fs.existsSync(path.join(profile, '.zcode', 'cli', 'config.json'))) {
  process.stderr.write('PROFILE_INVALID: launcher requires a prepared profile.\n');
  process.exit(2);
}
os.homedir = () => profile;
syncBuiltinESMExports();
process.argv = [process.execPath, cli, ...args];
require(cli);
