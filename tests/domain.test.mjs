import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../src/domain.mjs';

const config = {
  airtableBaseId: 'appExample', videosTableId: 'tblVideos', audiosTableId: 'tblAudios',
  slackVideosChannel: 'CVideos', slackAudioChannel: 'CAudios', slackErrorsChannel: 'CErrors',
  airtableBaseUrl: 'https://api.airtable.com/v0', heygenBaseUrl: 'https://api.heygen.com/v3',
  slackBaseUrl: 'https://slack.com/api', transcriptionBaseUrl: 'https://api.groq.com/openai/v1',
  transcriptionModel: 'whisper-large-v3-turbo', maxAudioBytes: 20 * 1024 * 1024,
  maxPolls: 3, pollIntervalSeconds: 5, maxRecordsPerRun: 0, generationEnabled: true,
  resolution: '720p', aspectRatio: '16:9', avatarId: 'avatar-example', voiceId: 'voice-example',
};
const ok = (body) => ({ statusCode: 200, body });
const pending = (id = 'recABC123') => ({ id, fields: { Estado: 'Pendiente', Titulo: 'Video de ejemplo', Descripcion: 'Guion de prueba.' } });
const initial = () => d.prepareVideoRecord(pending(), config);
const validInput = () => ({ json: { body: { request_id: 'test-request-123' } }, binary: { audio: { fileName: 'prueba.wav', mimeType: 'audio/wav' } } });
const audio = () => d.validateAudioMetadata(validInput(), 42, config);

test('configuración válida y endpoints fijos impiden desviar credenciales', () => {
  assert.equal(d.validateConfig(config).maxPolls, 3);
  assert.throws(() => d.validateConfig({ ...config, airtableBaseUrl: 'https://attacker.invalid' }), /URL/);
  assert.throws(() => d.validateConfig({ ...config, slackBaseUrl: 'http://127.0.0.1:9999' }), /URL/);
  assert.equal(d.validateConfig({ ...config, slackBaseUrl: 'http://127.0.0.1:9999', allowLocalMock: true }).allowLocalMock, true);
  assert.throws(() => d.validateConfig({ ...config, maxPolls: Infinity }));
  assert.throws(() => d.validateConfig({ ...config, pollIntervalSeconds: 0 }));
  assert.throws(() => d.validateConfig({ ...config, generationEnabled: 'false' }));
  assert.throws(() => d.validateConfig({ ...config, maxAudioBytes: Infinity }, 'audio'));
  assert.throws(() => d.validateConfig({ ...config, maxAudioBytes: 20 * 1024 * 1024 + 1 }, 'audio'));
});

test('Airtable procesa varias páginas, deduplica IDs y rechaza una lectura cortada', () => {
  const pages = [ok({ records: [pending('recOne')], offset: 'next' }), ok({ records: [pending('recOne'), pending('recTwo')] })];
  assert.deepEqual(d.flattenAirtablePages(pages, config).map((record) => record.id), ['recOne', 'recTwo']);
  assert.equal(d.flattenAirtablePages(pages, { ...config, maxRecordsPerRun: 1 }).length, 1);
  assert.throws(() => d.flattenAirtablePages([pages[0]], config), /incompleta/);
  assert.throws(() => d.flattenAirtablePages([{ statusCode: 429, body: {} }], config), /Airtable/);
  assert.equal(d.flattenAirtablePages([ok({ records: [] })], config)[0].empty, true);
});

test('generación desactivada y datos inválidos nunca llegan a crear video', () => {
  assert.equal(d.prepareVideoRecord(pending(), { ...config, generationEnabled: false }).action, 'skip');
  assert.equal(d.prepareVideoRecord({ ...pending(), id: '../../other' }, config).action, 'error');
  assert.equal(d.prepareVideoRecord({ ...pending(), fields: { Estado: 'Pendiente', Titulo: 'Sin guion' } }, config).action, 'error');
});

test('fallo al reservar Airtable detiene la generación', () => {
  const ctx = initial();
  assert.equal(d.claimResult({ statusCode: 503, body: {} }, ctx).action, 'error');
  assert.equal(d.claimResult(ok({ id: 'recOther', fields: { Estado: 'En Proceso' } }), ctx).action, 'error');
  assert.equal(d.claimResult(ok({ id: ctx.recordId, fields: { Estado: 'En Proceso' } }), ctx).claimed, true);
});

test('un POST HeyGen ambiguo y un ID no persistido requieren revisión, no recreación', () => {
  const ctx = initial();
  const ambiguous = d.generationResult({ error: { message: 'timeout' } }, ctx);
  assert.equal(ambiguous.outcome, 'manual_review');
  const accepted = d.generationResult(ok({ data: { video_id: 'vid123' } }), ctx);
  assert.equal(accepted.recordId, ctx.recordId);
  assert.equal(accepted.action, 'persist');
  assert.equal(d.persistedVideoResult({ statusCode: 500 }, accepted).outcome, 'manual_review');
  const rerun = d.prepareVideoRecord({ ...pending(), fields: { ...pending().fields, Estado: 'En Proceso' } }, config);
  assert.equal(rerun.outcome, 'manual_review');
  assert.notEqual(rerun.action, 'create');
});

test('un registro con ID existente reanuda consultas conservando el ID de Airtable', () => {
  const resumed = d.prepareVideoRecord({ ...pending(), fields: { Estado: 'En Proceso', HeyGen_VideoID: 'vid-saved' } }, config);
  assert.equal(resumed.action, 'poll');
  assert.equal(resumed.recordId, 'recABC123');
  assert.equal(resumed.videoId, 'vid-saved');
});

test('polling termina en límite finito y reconoce fallo/error/estado desconocido', () => {
  let ctx = { ...initial(), videoId: 'vid123' };
  for (let attempt = 1; attempt <= config.maxPolls; attempt++) {
    ctx = d.preparePoll(ctx);
    ctx = d.interpretVideoStatus(ok({ data: { status: 'processing' } }), ctx);
    assert.equal(ctx.action, attempt < config.maxPolls ? 'wait' : 'error');
  }
  assert.equal(ctx.outcome, 'poll_timeout');
  assert.equal(ctx.videoId, 'vid123');
  assert.equal(d.interpretVideoStatus(ok({ data: { status: 'failed' } }), ctx).action, 'failed');
  assert.equal(d.interpretVideoStatus({ statusCode: 401 }, ctx).outcome, 'status_unavailable');
  assert.equal(d.interpretVideoStatus(ok({ data: { status: 'surprise' } }), ctx).outcome, 'unknown_status');
});

test('solo finalización confirmada con URL HTTPS puede marcarse completada', () => {
  const ctx = { ...initial(), videoId: 'vid123' };
  for (const url of ['javascript:alert(1)', 'http://example.org/video', 'https://example.org/<bad>', '']) {
    assert.equal(d.interpretVideoStatus(ok({ data: { status: 'completed', video_url: url } }), ctx).action, 'error');
  }
  const completed = d.interpretVideoStatus(ok({ data: { status: 'completed', video_url: 'https://example.org/video.mp4' } }), ctx);
  assert.equal(completed.action, 'complete');
  assert.equal(d.completedVideoResult(ok({ id: ctx.recordId, fields: { Estado: 'Completado', URL_VideoGenerado: completed.videoUrl } }), completed).action, 'notify');
  assert.equal(d.completedVideoResult(ok({ id: 'recOther', fields: {} }), completed).action, 'error');
});

test('un fallo Slack no cambia un video completado ni interpreta HTTP 200 como éxito de Slack', () => {
  const ctx = { ...initial(), outcome: 'completed', videoUrl: 'https://example.org/x', message: 'Video listo.' };
  const notice = d.prepareVideoNotice(ctx);
  assert.equal(notice.notice.mrkdwn, false);
  assert.equal(notice.notice.unfurl_links, false);
  const failed = d.notificationResult(ok({ ok: false, error: 'channel_not_found' }), notice);
  assert.equal(failed.outcome, 'completed');
  assert.equal(failed.needsNotificationRetry, true);
});

test('audio exige request_id seguro, un archivo y tamaño acotado', () => {
  assert.equal(audio().action, 'lookup');
  assert.equal(d.validateAudioMetadata(validInput(), 0, config).responseCode, 413);
  assert.equal(d.validateAudioMetadata(validInput(), config.maxAudioBytes + 1, config).responseCode, 413);
  const malicious = validInput(); malicious.json.body.request_id = "x') OR TRUE()";
  assert.equal(d.validateAudioMetadata(malicious, 42, config).responseCode, 400);
  const files = validInput(); files.binary.second = files.binary.audio;
  assert.equal(d.validateAudioMetadata(files, 42, config).responseCode, 400);
  const executable = validInput(); executable.binary.audio.fileName = 'program.exe';
  assert.equal(d.validateAudioMetadata(executable, 42, config).responseCode, 415);
});

test('request_id ya guardado evita otra transcripción secuencial', () => {
  const ctx = audio();
  const result = d.audioLookupResult(ok({ records: [{ id: 'recAudio', fields: { TranscripcionOriginal: 'Guardada' } }] }), ctx);
  assert.equal(result.action, 'duplicate');
  assert.equal(d.audioResponse(result).transcription, 'Guardada');
  assert.equal(d.audioLookupResult({ statusCode: 503 }, ctx).action, 'error');
});

test('transcripción crea campos completos con límites Unicode y conserva el texto', () => {
  const text = '😀'.repeat(250);
  const record = d.makeAudioRecord(ok({ text }), audio(), '2026-11-01T00:00:00.000Z');
  assert.equal(record.action, 'save');
  assert.equal(Array.from(record.fields.Titulo).length, 50);
  assert.equal(Array.from(record.fields.Descripcion).length, 200);
  assert.equal(record.fields.TranscripcionOriginal, text);
  assert.equal(record.fields.SolicitudID, 'test-request-123');
  assert.equal(record.fields.FechaCreacion, '2026-11-01T00:00:00.000Z');
  assert.equal(d.makeAudioRecord(ok({ text: ' ' }), audio(), '').action, 'error');
  assert.equal(d.makeAudioRecord({ statusCode: 429, body: { text: 'falsa' } }, audio(), '').action, 'error');
  assert.equal(d.makeAudioRecord(ok({ text: 'a'.repeat(90001) }), audio(), '').responseCode, 422);
});

test('guardar audio ambiguo exige comprobar Airtable; Slack fallido mantiene respuesta explícita', () => {
  const ctx = d.makeAudioRecord(ok({ text: 'Texto de prueba' }), audio(), '2026-11-01');
  assert.equal(d.audioPersistResult({ statusCode: 500 }, ctx).responseCode, 502);
  const saved = d.audioPersistResult(ok({ id: 'recAudio', fields: { SolicitudID: ctx.requestId } }), ctx);
  const notified = d.audioNotificationResult(ok({ ok: false }), saved);
  const response = d.audioResponse(notified);
  assert.equal(response.ok, true);
  assert.equal(response.notified, false);
  assert.equal(response.record_id, 'recAudio');
});
