import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// Real n8n webhook + native multipart HTTP Request + Code + response nodes.
// Every downstream service is a loopback mock; no provider is contacted.
const cli = process.env.N8N_CLI_PATH;
if (!cli) throw new Error('Falta N8N_CLI_PATH.');
mkdirSync('.test-output', { recursive: true });
const sandbox = mkdtempSync(resolve('.test-output/n8n-audio-'));
const env = { ...process.env, N8N_USER_FOLDER: sandbox, DB_TYPE: 'sqlite', DB_SQLITE_DATABASE: join(sandbox, 'database.sqlite'),
  N8N_ENCRYPTION_KEY: 'proyect-one-audio-test-only-not-for-production', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false', N8N_RUNNERS_BROKER_PORT: '15689', N8N_PORT: '15688',
  N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_HOST: '127.0.0.1', N8N_PROTOCOL: 'http', WEBHOOK_URL: 'http://127.0.0.1:15688/',
  N8N_RUNNERS_ENABLED: 'true', N8N_RUNNERS_AUTH_TOKEN: 'local-audio-qa-runner-token-not-for-production', NO_COLOR: '1' };
let commandIndex = 0;
const children = new Set();
function start(args) {
  const chunks = [];
  const child = spawn(process.env.N8N_NODE_EXECUTABLE || process.execPath, [resolve(cli), ...args], { env, windowsHide: true });
  children.add(child);
  child.stdout.on('data', (chunk) => chunks.push(chunk.toString())); child.stderr.on('data', (chunk) => chunks.push(chunk.toString()));
  child.once('exit', () => children.delete(child));
  return { child, chunks };
}
async function run(args) {
  const { child, chunks } = start(args); const timer = setTimeout(() => child.kill(), 180000);
  const code = await new Promise((fulfill, reject) => { child.once('error', reject); child.once('exit', fulfill); }); clearTimeout(timer);
  const output = chunks.join(''); writeFileSync(join(sandbox, `${++commandIndex}-${args[0].replaceAll(':', '-')}.log`), output);
  if (code !== 0) throw new Error(output.slice(-6000)); return output;
}
const calls = []; let saved = null;
const server = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk); const bytes = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://127.0.0.1');
  const multipart = /multipart\/form-data/.test(req.headers['content-type'] || '');
  const body = bytes.length && !multipart ? JSON.parse(bytes.toString()) : null;
  calls.push({ method: req.method, path: url.pathname, body, multipart, bytes: bytes.length });
  const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.headers['x-qa'] !== 'local-mock-only') return reply(401, { error: 'dummy credential absent' });
  if (url.pathname === '/airtable/appQA/tblAudios' && req.method === 'GET') return reply(200, { records: saved ? [saved] : [] });
  if (url.pathname === '/transcription/audio/transcriptions') {
    if (!multipart || !bytes.includes(Buffer.from('RIFF')) || !bytes.includes(Buffer.from('whisper-large-v3-turbo'))) return reply(400, { error: 'multipart incorrecto' });
    return reply(200, { text: 'Esta transcripción viene de un servidor de prueba local.' });
  }
  if (url.pathname === '/airtable/appQA/tblAudios' && req.method === 'POST') { saved = { id: 'recAudioQA', fields: body.fields }; return reply(200, saved); }
  if (url.pathname === '/slack/chat.postMessage') return reply(200, { ok: false, error: 'mock_slack_failure' });
  return reply(404, { error: 'unexpected mock route' });
});
await new Promise((fulfill) => server.listen(0, '127.0.0.1', fulfill));
const base = `http://127.0.0.1:${server.address().port}`;
let instance;
try {
  const credentialFile = join(sandbox, 'dummy-credentials.json');
  writeFileSync(credentialFile, JSON.stringify([{ id: 'qa-header', name: 'QA header local', type: 'httpHeaderAuth', data: { name: 'X-QA', value: 'local-mock-only' } }]));
  const flow = JSON.parse(readFileSync('workflows/02-audio-a-airtable.json', 'utf8')); flow.id = 'qaAudioMock';
  const config = { airtableBaseUrl: base + '/airtable', airtableBaseId: 'appQA', videosTableId: 'tblVideos', audiosTableId: 'tblAudios',
    heygenBaseUrl: base + '/heygen', avatarId: 'avatar-qa', voiceId: 'voice-qa', resolution: '720p', aspectRatio: '16:9', generationEnabled: false,
    maxRecordsPerRun: 1, maxPolls: 3, pollIntervalSeconds: 1, slackBaseUrl: base + '/slack', slackVideosChannel: 'CVIDEO', slackAudioChannel: 'CAUDIO', slackErrorsChannel: 'CERROR',
    transcriptionBaseUrl: base + '/transcription', transcriptionModel: 'whisper-large-v3-turbo', maxAudioBytes: 20 * 1024 * 1024, allowLocalMock: true };
  flow.nodes.find((node) => node.name === 'Configuracion').parameters.jsCode = flow.nodes.find((node) => node.name === 'Configuracion').parameters.jsCode.replace(/const cfg = [\s\S]*?;\n/, `const cfg = ${JSON.stringify(config)};\n`);
  flow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook').parameters.path = 'qa-audio-test';
  for (const node of flow.nodes) if (node.credentials) node.credentials = { httpHeaderAuth: { id: 'qa-header', name: 'QA header local' } };
  const flowFile = join(sandbox, 'audio.json'); writeFileSync(flowFile, JSON.stringify(flow));
  await run(['import:credentials', `--input=${credentialFile}`]); await run(['import:workflow', `--input=${flowFile}`]);
  await run(['publish:workflow', '--id=qaAudioMock']);
  instance = start(['start']);
  const readyBy = Date.now() + 90000;
  while (true) {
    if (instance.child.exitCode !== null) throw new Error(instance.chunks.join('').slice(-6000));
    try { const r = await fetch('http://127.0.0.1:15688/healthz'); if (r.ok) break; } catch {}
    if (Date.now() >= readyBy) throw new Error('Instancia QA no inició a tiempo.');
    await new Promise((fulfill) => setTimeout(fulfill, 500));
  }
  // Only a synthetic WAV header/quiet sample is sent. The mock checks the bytes;
  // it does not pretend to decode/transcribe real speech.
  const wav = Buffer.alloc(364); wav.write('RIFF'); wav.writeUInt32LE(356, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(320, 40);
  const upload = async ({ auth = true, filename = 'silencio.wav', requestId = 'qa-audio-1234' } = {}) => {
    const form = new FormData(); form.append('request_id', requestId); form.append('audio', new Blob([wav], { type: 'audio/wav' }), filename);
    return fetch('http://127.0.0.1:15688/webhook/qa-audio-test', { method: 'POST', headers: auth ? { 'X-QA': 'local-mock-only' } : {}, body: form, signal: AbortSignal.timeout(60000) });
  };
  let unauthorized; const webhookReadyBy = Date.now() + 45000;
  while (true) {
    unauthorized = await upload({ auth: false });
    if (unauthorized.status !== 404 || Date.now() >= webhookReadyBy) break;
    await new Promise((fulfill) => setTimeout(fulfill, 500));
  }
  assert.ok([401, 403].includes(unauthorized.status), 'Webhook rechaza clave ausente: ' + unauthorized.status); assert.equal(calls.length, 0);
  const response = await upload(); const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.ok, true); assert.equal(body.record_id, 'recAudioQA'); assert.equal(body.notified, false);
  assert.equal(body.transcription, 'Esta transcripción viene de un servidor de prueba local.');
  const duplicateResponse = await upload(); const duplicate = await duplicateResponse.json(); assert.equal(duplicate.duplicate, true);
  assert.equal(calls.filter((call) => call.path === '/transcription/audio/transcriptions').length, 1, 'reenvío guardado no vuelve a transcribir');
  const invalid = await upload({ requestId: 'short' }); assert.equal(invalid.status, 400);
  const wrongFile = await upload({ filename: 'program.exe', requestId: 'qa-invalid-file' }); assert.equal(wrongFile.status, 415);
  const result = { status: 'passed', runtime: 'real n8n webhook', services: 'loopback mocks only', audio: 'synthetic WAV bytes; no real speech transcription', scenarios: ['authentication rejected', 'multipart binary delivered', 'transcription saved', 'Slack failure visible', 'duplicate deduplicated', 'invalid request ID', 'invalid extension'], sandbox };
  writeFileSync(join(sandbox, 'result.json'), JSON.stringify(result, null, 2)); writeFileSync(join(sandbox, 'mock-calls.json'), JSON.stringify(calls, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally {
  if (instance) writeFileSync(join(sandbox, 'server.log'), instance.chunks.join(''));
  for (const child of children) child.kill(); server.close();
}
