import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// Runs real n8n nodes against an HTTP server bound to loopback. No real APIs,
// keys, videos or paid transcription services are involved.
const cli = process.env.N8N_CLI_PATH;
if (!cli) throw new Error('Falta N8N_CLI_PATH.');
mkdirSync('.test-output', { recursive: true });
const sandbox = mkdtempSync(resolve('.test-output/n8n-mocks-'));
const env = { ...process.env, N8N_USER_FOLDER: sandbox, DB_TYPE: 'sqlite', DB_SQLITE_DATABASE: join(sandbox, 'database.sqlite'),
  N8N_ENCRYPTION_KEY: 'proyect-one-mock-test-only-not-for-production', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false', N8N_RUNNERS_BROKER_PORT: '15679', N8N_PORT: '15678',
  N8N_RUNNERS_ENABLED: 'true', N8N_RUNNERS_AUTH_TOKEN: 'local-qa-runner-token-not-for-production', NO_COLOR: '1' };
let commandIndex = 0;
async function run(args) {
  const log = [];
  const child = spawn(process.env.N8N_NODE_EXECUTABLE || process.execPath, [resolve(cli), ...args], { env, windowsHide: true });
  child.stdout.on('data', (chunk) => log.push(chunk.toString()));
  child.stderr.on('data', (chunk) => log.push(chunk.toString()));
  const timer = setTimeout(() => child.kill(), 180000);
  const result = await new Promise((fulfill, reject) => { child.once('error', reject); child.once('exit', (code) => fulfill(code)); });
  clearTimeout(timer);
  const text = log.join('');
  writeFileSync(join(sandbox, `${++commandIndex}-${args[0].replaceAll(':', '-')}.log`), text);
  if (result !== 0) throw new Error(`n8n ${args[0]} terminó con ${result}: ${text.slice(-6000)}`);
  return text;
}

let calls = [];
const states = new Map();
const records = [
  { id: 'recCreate', fields: { Estado: 'Pendiente', Titulo: 'Prueba nueva', Descripcion: 'Guion de prueba.' } },
  { id: 'recResume', fields: { Estado: 'En Proceso', Titulo: 'Prueba reanudada', HeyGen_VideoID: 'existing-video' } },
  { id: 'recAmbiguous', fields: { Estado: 'En Proceso', Titulo: 'No regenerar' } },
];
for (const record of records) states.set(record.id, structuredClone(record));
const server = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = text ? JSON.parse(text) : {};
  calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (req.headers['x-qa'] !== 'local-mock-only') return reply(401, { error: 'dummy credential absent' });
  if (url.pathname === '/airtable/appQA/tblVideos' && req.method === 'GET') {
    return reply(200, url.searchParams.get('offset') === 'page-two' ? { records: records.slice(1) } : { records: records.slice(0, 1), offset: 'page-two' });
  }
  if (url.pathname.startsWith('/airtable/appQA/tblVideos/') && req.method === 'PATCH') {
    const id = url.pathname.split('/').at(-1); const record = states.get(id);
    if (!record) return reply(404, {});
    record.fields = { ...record.fields, ...body.fields }; return reply(200, record);
  }
  if (url.pathname === '/heygen/videos' && req.method === 'POST') return reply(200, { data: { video_id: 'new-video' } });
  if (url.pathname.startsWith('/heygen/videos/') && req.method === 'GET') {
    const id = url.pathname.split('/').at(-1);
    const count = calls.filter((call) => call.method === 'GET' && call.path === url.pathname).length;
    return reply(200, { data: count === 1 ? { status: 'processing' } : { status: 'completed', video_url: `https://example.org/${id}.mp4` } });
  }
  if (url.pathname === '/slack/chat.postMessage') return reply(200, { ok: body.channel !== 'CERROR', error: body.channel === 'CERROR' ? 'mock_slack_error' : undefined });
  return reply(404, { error: 'Unexpected mock route' });
});
await new Promise((fulfill) => server.listen(0, '127.0.0.1', fulfill));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const credentials = [{ id: 'qa-header', name: 'QA header local', type: 'httpHeaderAuth', data: { name: 'X-QA', value: 'local-mock-only' } }];
  const credentialFile = join(sandbox, 'dummy-credentials.json'); writeFileSync(credentialFile, JSON.stringify(credentials));
  const flow = JSON.parse(readFileSync('workflows/01-videos-airtable-heygen.json', 'utf8'));
  flow.id = 'qaVideoMock';
  const config = { airtableBaseUrl: base + '/airtable', airtableBaseId: 'appQA', videosTableId: 'tblVideos', audiosTableId: 'tblAudios',
    heygenBaseUrl: base + '/heygen', avatarId: 'avatar-qa', voiceId: 'voice-qa', resolution: '720p', aspectRatio: '16:9', generationEnabled: true,
    maxRecordsPerRun: 0, maxPolls: 3, pollIntervalSeconds: 1, slackBaseUrl: base + '/slack', slackVideosChannel: 'CVIDEO', slackAudioChannel: 'CAUDIO', slackErrorsChannel: 'CERROR',
    transcriptionBaseUrl: base + '/transcription', transcriptionModel: 'whisper-large-v3-turbo', maxAudioBytes: 20 * 1024 * 1024, allowLocalMock: true };
  const configNode = flow.nodes.find((node) => node.name === 'Configuracion');
  configNode.parameters.jsCode = configNode.parameters.jsCode.replace(/const cfg = [\s\S]*?;\n/, `const cfg = ${JSON.stringify(config)};\n`);
  for (const node of flow.nodes) if (node.credentials) node.credentials = { httpHeaderAuth: { id: 'qa-header', name: 'QA header local' } };
  const flowFile = join(sandbox, 'video.json'); writeFileSync(flowFile, JSON.stringify(flow));
  await run(['import:credentials', `--input=${credentialFile}`]);
  await run(['import:workflow', `--input=${flowFile}`]);
  const output = await run(['execute', '--id=qaVideoMock', '--rawOutput']);
  const first = output.indexOf('{\n'); const last = output.lastIndexOf('}');
  const result = JSON.parse(output.slice(first, last + 1));
  if (result.data?.resultData?.error) throw new Error(JSON.stringify(result.data.resultData.error));
  const summaries = result.data.resultData.runData.Resumen;
  const summary = summaries.at(-1).data.main[0][0].json;
  assert.equal(summary.total, 3);
  assert.equal(calls.filter((call) => call.path === '/heygen/videos' && call.method === 'POST').length, 1, 'una sola generación nueva');
  assert.equal(calls.filter((call) => call.path === '/airtable/appQA/tblVideos' && call.method === 'GET').length, 2, 'dos páginas reales HTTPRequest');
  assert.equal(states.get('recCreate').fields.Estado, 'Completado');
  assert.equal(states.get('recCreate').fields.HeyGen_VideoID, 'new-video');
  assert.equal(states.get('recResume').fields.Estado, 'Completado');
  assert.equal(states.get('recAmbiguous').fields.Estado, 'En Proceso');
  assert.ok(summary.results.some((item) => item.recordId === 'recAmbiguous' && item.outcome === 'manual_review'));
  const completionIndex = calls.findIndex((call) => call.method === 'PATCH' && call.body.fields?.HeyGen_VideoID === 'new-video');
  const firstPollIndex = calls.findIndex((call) => call.method === 'GET' && call.path === '/heygen/videos/new-video');
  assert.ok(completionIndex >= 0 && completionIndex < firstPollIndex, 'video ID se guarda antes del polling');
  const final = { status: 'passed', providerCalls: 'local mocks only', runtimeExecution: true, scenario: 'video-pagination-create-resume-ambiguous-slack-error', requests: calls.length, summary, sandbox };
  writeFileSync(join(sandbox, 'result.json'), JSON.stringify(final, null, 2));
  writeFileSync(join(sandbox, 'mock-calls.json'), JSON.stringify(calls, null, 2));
  console.log(JSON.stringify(final, null, 2));
} finally { server.close(); }
