import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Uses the real n8n Server CLI in a new local database. It does not publish,
// execute workflows, connect credentials or touch a user's existing database.
const cli = process.env.N8N_CLI_PATH;
const executable = process.env.N8N_NODE_EXECUTABLE || process.execPath;
if (!cli || !existsSync(cli)) {
  console.error('Definí N8N_CLI_PATH con la ruta del archivo bin/n8n de una instalación local de n8n.');
  process.exit(2);
}
const qaRoot = resolve('.test-output');
mkdirSync(qaRoot, { recursive: true });
const sandbox = mkdtempSync(join(qaRoot, 'n8n-import-'));
const env = {
  ...process.env,
  N8N_USER_FOLDER: sandbox,
  DB_TYPE: 'sqlite',
  DB_SQLITE_DATABASE: join(sandbox, 'database.sqlite'),
  N8N_ENCRYPTION_KEY: 'proyect-one-isolated-import-test-not-for-production',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
};
function run(args, logName) {
  const result = spawnSync(executable, [resolve(cli), ...args], { env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  const log = `${result.stdout || ''}\n${result.stderr || ''}`;
  writeFileSync(join(sandbox, logName), log);
  if (result.error || result.status !== 0) {
    console.error(log.slice(-8000));
    throw new Error(`n8n ${args[0]} falló: ${result.error?.message || result.status}`);
  }
  return log;
}
const version = run(['--version'], 'version.log').trim();
run(['import:workflow', '--separate', `--input=${resolve('workflows')}`], 'import.log');
const exported = join(sandbox, 'exported.json');
run(['export:workflow', '--all', `--output=${exported}`], 'export.log');
const received = JSON.parse(readFileSync(exported, 'utf8'));
const expected = readdirSync('workflows').filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(join('workflows', file), 'utf8')));
if (!Array.isArray(received) || received.length !== expected.length) throw new Error('La cantidad de flujos importados no coincide.');
for (const workflow of expected) {
  const actual = received.find((item) => item.name === workflow.name);
  if (!actual || actual.active || actual.nodes.length !== workflow.nodes.length) throw new Error(`Importación incompleta: ${workflow.name}`);
}
const result = { status: 'passed', n8nVersion: version, count: received.length, activated: false, executed: false, sandbox };
writeFileSync(join(sandbox, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
