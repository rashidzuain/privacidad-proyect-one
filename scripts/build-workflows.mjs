import { mkdir, writeFile } from 'node:fs/promises';
import * as logic from '../src/domain.mjs';

const cfg = {
  airtableBaseUrl: 'https://api.airtable.com/v0',
  airtableBaseId: 'CONFIGURAR_BASE_ID',
  videosTableId: 'CONFIGURAR_TABLA_VIDEOS',
  audiosTableId: 'CONFIGURAR_TABLA_AUDIOS',
  heygenBaseUrl: 'https://api.heygen.com/v3',
  avatarId: 'CONFIGURAR_AVATAR_ID', voiceId: 'CONFIGURAR_VOICE_ID',
  resolution: '1080p', aspectRatio: 'auto',
  generationEnabled: false, maxRecordsPerRun: 1,
  maxPolls: 60, pollIntervalSeconds: 15,
  slackBaseUrl: 'https://slack.com/api',
  slackVideosChannel: 'CONFIGURAR_CANAL_VIDEOS',
  slackAudioChannel: 'CONFIGURAR_CANAL_AUDIOS',
  slackErrorsChannel: 'CONFIGURAR_CANAL_ERRORES',
  transcriptionBaseUrl: 'https://api.groq.com/openai/v1',
  transcriptionModel: 'whisper-large-v3-turbo', maxAudioBytes: 20 * 1024 * 1024,
  allowLocalMock: false,
};
const credentials = {
  airtable: { httpHeaderAuth: { id: 'CONFIGURAR_AIRTABLE', name: 'Proyect One - Airtable' } },
  heygen: { httpHeaderAuth: { id: 'CONFIGURAR_HEYGEN', name: 'Proyect One - HeyGen' } },
  slack: { httpHeaderAuth: { id: 'CONFIGURAR_SLACK', name: 'Proyect One - Slack' } },
  transcription: { httpHeaderAuth: { id: 'CONFIGURAR_TRANSCRIPCION', name: 'Proyect One - Transcripcion' } },
  webhook: { httpHeaderAuth: { id: 'CONFIGURAR_WEBHOOK', name: 'Proyect One - Webhook' } },
};

// Embed exactly the pure functions exercised by the tests. No runtime module import is needed in n8n.
function sharedCode(source) {
  const functions = Object.entries(logic).filter(([, value]) => typeof value === 'function');
  const included = new Set();
  let expanded = source;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, value] of functions) {
      if (!included.has(name) && new RegExp('\\b' + name + '\\s*\\(').test(expanded)) {
        included.add(name); expanded += '\n' + value.toString(); changed = true;
      }
    }
  }
  return functions.filter(([name]) => included.has(name)).map(([, value]) => value.toString()).join('\n\n');
}
const E = value => '={{ ' + value + ' }}';
class Workflow {
  constructor(name, id) { this.name = name; this.id = id; this.nodes = []; this.connections = {}; }
  node(name, type, version, parameters, x, y, extra = {}) {
    this.nodes.push({ id: `${this.id}-${this.nodes.length + 1}`, name, type: 'n8n-nodes-base.' + type, typeVersion: version, position: [x, y], parameters, ...extra });
    return name;
  }
  code(name, code, x, y, mode = 'runOnceForEachItem') { return this.node(name, 'code', 2, { mode, jsCode: sharedCode(code) + '\n\n' + code }, x, y); }
  transform(name, call, x, y) { return this.code(name, 'return { json: ' + call + ' };', x, y); }
  condition(name, expression, x, y) {
    return this.node(name, 'if', 2.2, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'condition', leftValue: E(expression), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, x, y);
  }
  http(name, method, url, credential, x, y, { body, query, retry = false, pagination, multipart, timeout = 30000 } = {}) {
    const parameters = { method, url: E(url), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout, response: { response: { fullResponse: true, neverError: !retry, responseFormat: 'json' } } } };
    if (body) Object.assign(parameters, { sendBody: true, specifyBody: 'json', jsonBody: E(body) });
    if (query) Object.assign(parameters, { sendQuery: true, queryParameters: { parameters: query.map(([name, value]) => ({ name, value })) } });
    if (pagination) parameters.options.pagination = { pagination };
    if (multipart) Object.assign(parameters, { sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: multipart } });
    return this.node(name, 'httpRequest', 4.3, parameters, x, y, { credentials: credentials[credential], onError: 'continueRegularOutput', retryOnFail: retry, ...(retry ? { maxTries: 3, waitBetweenTries: 1500 } : {}) });
  }
  connect(from, to, output = 0) {
    this.connections[from] ||= { main: [] };
    this.connections[from].main[output] ||= [];
    this.connections[from].main[output].push({ node: to, type: 'main', index: 0 });
  }
  export() { return { name: this.name, active: false, nodes: this.nodes, connections: this.connections, settings: { executionOrder: 'v1', saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none', saveExecutionProgress: false, saveManualExecutions: false, timezone: 'America/Argentina/Buenos_Aires', executionTimeout: 7200 }, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: false } }; }
}
const C = '$("Configuracion").first().json';
const ctx = name => '$(' + JSON.stringify(name) + ').item.json';
const table = (which, ref = '$json') => `${ref}.cfg.airtableBaseUrl + '/' + encodeURIComponent(${ref}.cfg.airtableBaseId) + '/' + encodeURIComponent(${ref}.cfg.${which}TableId)`;
const recordUrl = ref => table('videos', ref) + ` + '/' + encodeURIComponent(${ref}.recordId)`;
const slackUrl = ref => `${ref}.cfg.slackBaseUrl + '/chat.postMessage'`;

const video = new Workflow('Proyect One - Videos de Airtable a HeyGen', 'proyectOneVideos');
video.node('Iniciar manualmente', 'manualTrigger', 1, {}, 0, 0);
video.code('Configuracion', `const cfg = ${JSON.stringify(cfg, null, 2)};\nreturn { json: validateConfig(cfg, 'video') };`, 220, 0);
video.http('Leer videos de Airtable', 'GET', `${C}.airtableBaseUrl + '/' + encodeURIComponent(${C}.airtableBaseId) + '/' + encodeURIComponent(${C}.videosTableId)`, 'airtable', 440, 0, {
  query: [['pageSize', '100'], ['filterByFormula', "OR({Estado}='Pendiente',{Estado}='En Proceso')"]], retry: true,
  pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'qs', name: 'offset', value: E('$response.body.offset || undefined') }] }, paginationCompleteWhen: 'other', completeExpression: E('!$response.body.offset || $response.statusCode >= 400'), limitPagesFetched: true, maxRequests: 1000, requestInterval: 250 },
});
video.code('Reunir registros', `return flattenAirtablePages($input.all().map(item => item.json), ${C}).map((record) => ({ json: record }));`, 660, 0, 'runOnceForAllItems');
video.node('Procesar de a uno', 'splitInBatches', 3, { batchSize: 1, options: {} }, 880, 0);
video.node('Regular ritmo de Airtable', 'wait', 1.1, { resume: 'timeInterval', amount: 1, unit: 'seconds' }, 1100, 100, { webhookId: '1a5dfe1d-8ee0-4e51-85d5-eaf0f111b003' });
video.code('Resumen', "const rows = $input.all().map(item => item.json);\nreturn [{ json: { total: rows.filter(r => r.outcome !== 'empty').length, results: rows.map(r => ({ recordId: r.recordId || null, videoId: r.videoId || null, outcome: r.outcome, message: r.message, notified: r.notified ?? null })) } }];", 1100, -300, 'runOnceForAllItems');
video.transform('Preparar registro', `prepareVideoRecord($json, ${C})`, 1100, 100);
video.condition('Necesita generar', "$json.action === 'create'", 1320, 100);
video.condition('Puede consultar video', "$json.action === 'poll'", 1540, 340);
video.condition('Requiere aviso inicial', "$json.action === 'error'", 1760, 540);
video.http('Reservar registro en Airtable', 'PATCH', recordUrl('$json'), 'airtable', 1540, -180, { body: '$json.requestBody', retry: true });
video.transform('Comprobar reserva', `claimResult($json, ${ctx('Preparar registro')})`, 1760, -180);
video.condition('Reserva confirmada', "$json.action === 'create'", 1980, -180);
video.http('Solicitar video a HeyGen', 'POST', "$json.cfg.heygenBaseUrl + '/videos'", 'heygen', 2200, -300, { body: '$json.requestBody' });
video.transform('Comprobar creacion', `generationResult($json, ${ctx('Comprobar reserva')})`, 2420, -300);
video.condition('HeyGen devolvio ID', "$json.action === 'persist'", 2640, -300);
video.http('Guardar ID antes de consultar', 'PATCH', recordUrl('$json'), 'airtable', 2860, -420, { body: '$json.requestBody', retry: true });
video.transform('Comprobar ID guardado', `persistedVideoResult($json, ${ctx('Comprobar creacion')})`, 3080, -420);
video.condition('ID guardado', "$json.action === 'poll'", 3300, -420);
video.transform('Preparar consulta', 'preparePoll($json)', 3520, 0);
video.http('Consultar estado en HeyGen', 'GET', "$json.cfg.heygenBaseUrl + '/videos/' + encodeURIComponent($json.videoId)", 'heygen', 3740, 0, { retry: true });
video.transform('Interpretar estado', `interpretVideoStatus($json, ${ctx('Preparar consulta')})`, 3960, 0);
video.condition('Video terminado', "$json.action === 'complete'", 4180, 0);
video.condition('Todavia procesando', "$json.action === 'wait'", 4400, 240);
video.node('Esperar antes de consultar', 'wait', 1.1, { resume: 'timeInterval', amount: E('$json.cfg.pollIntervalSeconds'), unit: 'seconds' }, 4620, 100, { webhookId: '1a5dfe1d-8ee0-4e51-85d5-eaf0f111b001' });
video.condition('HeyGen informo fallo', "$json.action === 'failed'", 4620, 420);
video.http('Marcar error de generacion', 'PATCH', recordUrl('$json'), 'airtable', 4840, 320, { body: '$json.requestBody', retry: true });
video.transform('Comprobar marca de error', `failedVideoResult($json, ${ctx('Interpretar estado')})`, 5060, 320);
video.http('Guardar video terminado', 'PATCH', recordUrl('$json'), 'airtable', 4400, -240, { body: '$json.requestBody', retry: true });
video.transform('Comprobar video guardado', `completedVideoResult($json, ${ctx('Interpretar estado')})`, 4620, -240);
video.transform('Preparar aviso', 'prepareVideoNotice($json)', 5280, 0);
video.http('Avisar por Slack', 'POST', slackUrl('$json'), 'slack', 5500, 0, { body: '$json.notice' });
video.transform('Resultado del registro', `notificationResult($json, ${ctx('Preparar aviso')})`, 5720, 0);
video.code('Resultado omitido', "return {json:{recordId:$json.recordId||null,videoId:$json.videoId||null,outcome:$json.outcome,message:$json.message}};", 1980, 720);
video.node('Antes de ejecutar', 'stickyNote', 1, { content: '## Preparación\nConfigurá los IDs en Configuracion y vinculá las credenciales.\nGeneración deshabilitada por defecto. Habilitala solo después de revisar el costo de HeyGen.\nEjecutá una sola instancia a la vez: Airtable no ofrece bloqueo atómico en este flujo.\nNo cambies a Pendiente un En Proceso sin ID sin revisar HeyGen.', height: 310, width: 500 }, 0, -480);
for (const node of video.nodes) {
  if (node.position[0] >= 1100 && !['Regular ritmo de Airtable', 'Resumen'].includes(node.name)) node.position[0] += 220;
}
const vc = (a, b, out = 0) => video.connect(a, b, out);
vc('Iniciar manualmente', 'Configuracion'); vc('Configuracion', 'Leer videos de Airtable'); vc('Leer videos de Airtable', 'Reunir registros'); vc('Reunir registros', 'Procesar de a uno');
vc('Procesar de a uno', 'Resumen', 0); vc('Procesar de a uno', 'Regular ritmo de Airtable', 1); vc('Regular ritmo de Airtable', 'Preparar registro'); vc('Preparar registro', 'Necesita generar');
vc('Necesita generar', 'Reservar registro en Airtable'); vc('Necesita generar', 'Puede consultar video', 1);
vc('Puede consultar video', 'Preparar consulta'); vc('Puede consultar video', 'Requiere aviso inicial', 1);
vc('Requiere aviso inicial', 'Preparar aviso'); vc('Requiere aviso inicial', 'Resultado omitido', 1); vc('Resultado omitido', 'Procesar de a uno');
vc('Reservar registro en Airtable', 'Comprobar reserva'); vc('Comprobar reserva', 'Reserva confirmada'); vc('Reserva confirmada', 'Solicitar video a HeyGen'); vc('Reserva confirmada', 'Preparar aviso', 1);
vc('Solicitar video a HeyGen', 'Comprobar creacion'); vc('Comprobar creacion', 'HeyGen devolvio ID'); vc('HeyGen devolvio ID', 'Guardar ID antes de consultar'); vc('HeyGen devolvio ID', 'Preparar aviso', 1);
vc('Guardar ID antes de consultar', 'Comprobar ID guardado'); vc('Comprobar ID guardado', 'ID guardado'); vc('ID guardado', 'Preparar consulta'); vc('ID guardado', 'Preparar aviso', 1);
vc('Preparar consulta', 'Consultar estado en HeyGen'); vc('Consultar estado en HeyGen', 'Interpretar estado'); vc('Interpretar estado', 'Video terminado');
vc('Video terminado', 'Guardar video terminado'); vc('Video terminado', 'Todavia procesando', 1); vc('Todavia procesando', 'Esperar antes de consultar'); vc('Esperar antes de consultar', 'Preparar consulta'); vc('Todavia procesando', 'HeyGen informo fallo', 1);
vc('HeyGen informo fallo', 'Marcar error de generacion'); vc('HeyGen informo fallo', 'Preparar aviso', 1); vc('Marcar error de generacion', 'Comprobar marca de error'); vc('Comprobar marca de error', 'Preparar aviso');
vc('Guardar video terminado', 'Comprobar video guardado'); vc('Comprobar video guardado', 'Preparar aviso'); vc('Preparar aviso', 'Avisar por Slack'); vc('Avisar por Slack', 'Resultado del registro'); vc('Resultado del registro', 'Procesar de a uno');

const audio = new Workflow('Proyect One - Audio a transcripcion en Airtable', 'proyectOneAudio');
audio.node('Recibir audio', 'webhook', 2.1, { httpMethod: 'POST', path: 'proyect-one-audio-v1', authentication: 'headerAuth', responseMode: 'responseNode', options: {} }, 0, 0, { webhookId: '1a5dfe1d-8ee0-4e51-85d5-eaf0f111b002', credentials: credentials.webhook });
audio.code('Configuracion', `const cfg = ${JSON.stringify(cfg, null, 2)};\ntry { return { json: {cfg: validateConfig(cfg, 'audio'), action:'validate'}, binary:$input.item.binary }; }\ncatch { return {json:{action:'invalid',responseCode:503,message:'La automatización todavía no está configurada.'}}; }`, 220, 0);
audio.condition('Configuracion lista', "$json.action === 'validate'", 440, 0);
audio.code('Validar archivo', `const original = $('Recibir audio').first();\nconst keys = Object.keys(original.binary || {});\nconst normalized = { json: original.json, binary: keys.length === 1 && /^(audio|audio0)$/.test(keys[0]) ? { audio: original.binary[keys[0]] } : original.binary };\nlet size = 0;\nif (normalized.binary?.audio && keys.length === 1) {\n  try { size = (await this.helpers.getBinaryDataBuffer(0, keys[0])).length; }\n  catch { return {json:{cfg:$json.cfg, action:'invalid',responseCode:400,message:'No se pudo leer el archivo de audio.'}}; }\n}\nreturn {json:validateAudioMetadata(normalized,size,$json.cfg),binary:normalized.binary};`, 660, -120);
audio.condition('Archivo valido', "$json.action === 'lookup'", 880, -120);
audio.http('Buscar solicitud existente', 'GET', table('audios'), 'airtable', 1100, -240, { query: [['maxRecords', '1'], ['filterByFormula', E('"{SolicitudID}=\'" + $json.requestId + "\'"')]], retry: true });
audio.transform('Comprobar solicitud', `audioLookupResult($json, ${ctx('Validar archivo')})`, 1320, -240);
audio.condition('Solicitud nueva', "$json.action === 'transcribe'", 1540, -240);
audio.condition('Solicitud ya guardada', "$json.action === 'duplicate'", 1760, 0);
audio.code('Recuperar archivo', `return {json:$json,binary:$('Validar archivo').item.binary};`, 1760, -400);
audio.http('Transcribir audio', 'POST', "$json.cfg.transcriptionBaseUrl + '/audio/transcriptions'", 'transcription', 1980, -400, { timeout: 90000, multipart: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'audio' }, { name: 'model', value: E('$json.cfg.transcriptionModel') }, { name: 'response_format', value: 'json' }, { name: 'temperature', value: '0' }] });
audio.transform('Preparar transcripcion', `makeAudioRecord($json, ${ctx('Comprobar solicitud')}, new Date().toISOString())`, 2200, -400);
audio.condition('Transcripcion valida', "$json.action === 'save'", 2420, -400);
audio.http('Guardar transcripcion', 'POST', table('audios'), 'airtable', 2640, -560, { body: '$json.requestBody' });
audio.transform('Comprobar guardado', `audioPersistResult($json, ${ctx('Preparar transcripcion')})`, 2860, -560);
audio.condition('Transcripcion guardada', "$json.action === 'notify'", 3080, -560);
audio.http('Avisar audio por Slack', 'POST', slackUrl('$json'), 'slack', 3300, -700, { body: '$json.notice' });
audio.transform('Comprobar aviso de audio', `audioNotificationResult($json, ${ctx('Comprobar guardado')})`, 3520, -700);
audio.transform('Preparar aviso de error', 'audioErrorNotice($json)', 2860, 120);
audio.http('Avisar error por Slack', 'POST', slackUrl('$json'), 'slack', 3080, 120, { body: '$json.notice' });
audio.transform('Conservar error', ctx('Preparar aviso de error'), 3300, 120);
audio.code('Preparar respuesta', 'return { json: { responseCode:$json.responseCode || 500, body:audioResponse($json) } };', 3740, -100);
audio.node('Responder solicitud', 'respondToWebhook', 1.4, { respondWith: 'json', responseBody: E('$json.body'), options: { responseCode: E('$json.responseCode') } }, 3960, -100);
audio.node('Antes de activar', 'stickyNote', 1, { content: '## Entrada\nPOST multipart/form-data con un solo archivo audio y request_id (8–128 letras/números/_/-).\nCredencial Header Auth obligatoria: X-Proyect-One-Key.\n20 MiB como máximo; servidor/proxy deben aceptar ese tamaño.\nProveedor inicial Groq whisper-large-v3-turbo. No hay conversión ni extracción de audio.\nUna solicitud a la vez; request_id evita repetir las ya guardadas, no es un bloqueo concurrente.', height: 330, width: 520 }, 0, -500);
const ac = (a, b, out = 0) => audio.connect(a, b, out);
ac('Recibir audio', 'Configuracion'); ac('Configuracion', 'Configuracion lista'); ac('Configuracion lista', 'Validar archivo'); ac('Configuracion lista', 'Preparar respuesta', 1);
ac('Validar archivo', 'Archivo valido'); ac('Archivo valido', 'Buscar solicitud existente'); ac('Archivo valido', 'Preparar respuesta', 1);
ac('Buscar solicitud existente', 'Comprobar solicitud'); ac('Comprobar solicitud', 'Solicitud nueva'); ac('Solicitud nueva', 'Recuperar archivo'); ac('Solicitud nueva', 'Solicitud ya guardada', 1);
ac('Solicitud ya guardada', 'Preparar respuesta'); ac('Solicitud ya guardada', 'Preparar aviso de error', 1);
ac('Recuperar archivo', 'Transcribir audio'); ac('Transcribir audio', 'Preparar transcripcion'); ac('Preparar transcripcion', 'Transcripcion valida'); ac('Transcripcion valida', 'Guardar transcripcion'); ac('Transcripcion valida', 'Preparar aviso de error', 1);
ac('Guardar transcripcion', 'Comprobar guardado'); ac('Comprobar guardado', 'Transcripcion guardada'); ac('Transcripcion guardada', 'Avisar audio por Slack'); ac('Transcripcion guardada', 'Preparar aviso de error', 1);
ac('Avisar audio por Slack', 'Comprobar aviso de audio'); ac('Comprobar aviso de audio', 'Preparar respuesta'); ac('Preparar aviso de error', 'Avisar error por Slack'); ac('Avisar error por Slack', 'Conservar error'); ac('Conservar error', 'Preparar respuesta'); ac('Preparar respuesta', 'Responder solicitud');

await mkdir(new URL('../workflows/', import.meta.url), { recursive: true });
for (const [name, workflow] of [['01-videos-airtable-heygen.json', video], ['02-audio-a-airtable.json', audio]]) {
  await writeFile(new URL('../workflows/' + name, import.meta.url), JSON.stringify(workflow.export(), null, 2) + '\n');
  console.log('Built workflows/' + name);
}
