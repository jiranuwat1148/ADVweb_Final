const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const files = readdirSync(resolve('tests')).filter(name => name.endsWith('.test.ts')).map(name => join('tests', name));
if (!files.length) throw new Error('No backend test files found');
const result = spawnSync(process.execPath, ['--test', '--require', 'ts-node/register/transpile-only', ...files], {
  stdio: 'inherit',
  env: { ...process.env, DOTENV_CONFIG_PATH: resolve('tests', '__no_real_env__.env') },
});
process.exit(result.status ?? 1);
