// Pure transformations shared by the exported n8n Code nodes and the tests.
// No requests, credentials, files, or n8n global state live here.
export function validateConfig(cfg, mode = 'video') {
  const required = mode === 'video'
    ? ['airtableBaseId', 'videosTableId', 'slackVideosChannel', 'slackErrorsChannel']
    : ['airtableBaseId', 'audiosTableId', 'slackAudioChannel', 'slackErrorsChannel', 'transcriptionModel'];
  for (const key of required) {
    if (typeof cfg[key] !== 'string' || !cfg[key].trim() || /CONFIGURAR/.test(cfg[key])) {
      throw new Error('Configurá el campo ' + key + ' en el nodo Configuracion.');
    }
  }
  const allowed = {
    airtableBaseUrl: 'https://api.airtable.com/v0',
    heygenBaseUrl: 'https://api.heygen.com/v3',
    slackBaseUrl: 'https://slack.com/api',
    transcriptionBaseUrl: 'https://api.groq.com/openai/v1',
  };
  for (const [key, expected] of Object.entries(allowed)) {
    if (mode === 'video' && key === 'transcriptionBaseUrl') continue;
    if (mode === 'audio' && key === 'heygenBaseUrl') continue;
    const value = cfg[key];
    const localMock = cfg.allowLocalMock === true && /^http:\/\/127\.0\.0\.1:\d+(?:\/[^?#]*)?$/.test(value);
    const alternative = key === 'transcriptionBaseUrl' && value === 'https://api.openai.com/v1';
    if (value !== expected && !alternative && !localMock) throw new Error('URL no permitida: ' + key);
  }
  if (mode === 'video') {
    if (typeof cfg.generationEnabled !== 'boolean') throw new Error('generationEnabled debe ser true o false.');
    if (!Number.isInteger(cfg.maxPolls) || cfg.maxPolls < 1 || cfg.maxPolls > 120) throw new Error('maxPolls debe estar entre 1 y 120.');
    if (!Number.isInteger(cfg.pollIntervalSeconds) || cfg.pollIntervalSeconds < 1 || cfg.pollIntervalSeconds > 300) throw new Error('pollIntervalSeconds debe estar entre 1 y 300.');
    if (!Number.isInteger(cfg.maxRecordsPerRun) || cfg.maxRecordsPerRun < 0) throw new Error('maxRecordsPerRun debe ser 0 o un entero positivo.');
    if (!['720p', '1080p'].includes(cfg.resolution)) throw new Error('resolution debe ser 720p o 1080p.');
    if (!['auto', '16:9', '9:16', '1:1', '4:5', '5:4'].includes(cfg.aspectRatio)) throw new Error('aspectRatio no admitido.');
    if (cfg.generationEnabled && (!cfg.avatarId || !cfg.voiceId || /CONFIGURAR/.test(cfg.avatarId + cfg.voiceId))) throw new Error('Configurá avatarId y voiceId antes de permitir generación.');
  }
  if (mode === 'audio' && (!Number.isInteger(cfg.maxAudioBytes) || cfg.maxAudioBytes < 1 || cfg.maxAudioBytes > 20 * 1024 * 1024)) throw new Error('maxAudioBytes debe estar entre 1 y 20971520.');
  return { ...cfg };
}

export function responseOk(response) {
  return !!response && !response.error && Number(response.statusCode) >= 200 && Number(response.statusCode) < 300;
}

export function flattenAirtablePages(pages, cfg) {
  const records = [];
  const seen = new Set();
  for (const page of pages) {
    if (!responseOk(page) || !Array.isArray(page.body?.records)) throw new Error('No se pudo leer Airtable. Revisá credencial, base y tabla.');
    for (const record of page.body.records) {
      if (!record?.id || seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    }
  }
  // Reaching a configured pagination cap must never look like a complete scan.
  if (pages.at(-1)?.body?.offset) throw new Error('La lectura de Airtable quedó incompleta; no se procesó ningún registro.');
  const selected = cfg.maxRecordsPerRun === 0 ? records : records.slice(0, cfg.maxRecordsPerRun);
  return selected.length ? selected : [{ empty: true }];
}

export function prepareVideoRecord(record, cfg) {
  if (record.empty) return { cfg, action: 'skip', outcome: 'empty', message: 'No hay videos pendientes.' };
  const f = record.fields || {};
  const ctx = { cfg, recordId: record.id, title: String(f.Titulo || '').trim(), script: String(f.Descripcion || '').trim(), videoId: String(f.HeyGen_VideoID || '').trim(), state: f.Estado, pollAttempt: 0 };
  if (!/^rec[a-zA-Z0-9]+$/.test(ctx.recordId)) return { ...ctx, action: 'error', outcome: 'invalid', message: 'El identificador de Airtable no es válido.' };
  if (ctx.videoId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(ctx.videoId)) return { ...ctx, action: 'error', outcome: 'invalid', message: 'Revisá el identificador de HeyGen.' };
    return { ...ctx, action: 'poll' };
  }
  if (f.Estado === 'En Proceso') return { ...ctx, action: 'error', outcome: 'manual_review', message: 'El registro está En Proceso sin ID de video. Revisá HeyGen antes de cambiarlo a Pendiente.' };
  if (f.Estado !== 'Pendiente') return { ...ctx, action: 'skip', outcome: 'skipped', message: 'Estado no procesable.' };
  if (!ctx.title || !ctx.script || ctx.script.length > 10000) return { ...ctx, action: 'error', outcome: 'invalid', message: 'Completá Titulo y Descripcion (hasta 10000 caracteres de guion).' };
  if (!cfg.generationEnabled) return { ...ctx, action: 'skip', outcome: 'generation_disabled', message: 'La generación está deshabilitada en Configuracion.' };
  return { ...ctx, action: 'create', requestBody: { fields: { Estado: 'En Proceso' } } };
}

export function claimResult(response, ctx) {
  if (!responseOk(response) || response.body?.id !== ctx.recordId || response.body?.fields?.Estado !== 'En Proceso') return { ...ctx, action: 'error', outcome: 'claim_failed', message: 'No se confirmó la reserva en Airtable. No se solicitó ningún video.' };
  return { ...ctx, claimed: true, action: 'create', requestBody: { type: 'avatar', avatar_id: ctx.cfg.avatarId, script: ctx.script, voice_id: ctx.cfg.voiceId, title: ctx.title, resolution: ctx.cfg.resolution, aspect_ratio: ctx.cfg.aspectRatio, output_format: 'mp4' } };
}

export function generationResult(response, ctx) {
  const id = response.body?.data?.video_id;
  if (!responseOk(response) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) return { ...ctx, action: 'error', outcome: 'manual_review', message: 'No se confirmó el resultado de la creación. No vuelvas a generar: revisá el registro en HeyGen.' };
  return { ...ctx, videoId: id, action: 'persist', requestBody: { fields: { Estado: 'En Proceso', HeyGen_VideoID: id } } };
}

export function persistedVideoResult(response, ctx) {
  if (!responseOk(response) || response.body?.id !== ctx.recordId || response.body?.fields?.HeyGen_VideoID !== ctx.videoId) return { ...ctx, action: 'error', outcome: 'manual_review', message: 'HeyGen aceptó el video pero Airtable no confirmó su ID. Recuperá el ID de esta ejecución y guardalo antes de reintentar.' };
  return { ...ctx, action: 'poll' };
}

export function preparePoll(ctx) {
  return { ...ctx, pollAttempt: ctx.pollAttempt + 1 };
}

export function interpretVideoStatus(response, ctx) {
  if (!responseOk(response)) return { ...ctx, action: 'error', outcome: 'status_unavailable', message: 'No se pudo consultar HeyGen. El ID guardado permite reanudar en otra ejecución.' };
  const data = response.body?.data || {};
  if (data.status === 'completed') {
    const url = data.video_url;
    if (typeof url !== 'string' || !/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s<>"\\]*)?$/i.test(url)) return { ...ctx, action: 'error', outcome: 'invalid_url', message: 'HeyGen informó finalización sin una URL HTTPS válida.' };
    return { ...ctx, action: 'complete', videoUrl: url, requestBody: { fields: { Estado: 'Completado', URL_VideoGenerado: url } } };
  }
  if (data.status === 'failed') return { ...ctx, action: 'failed', outcome: 'provider_failed', message: 'HeyGen informó que la generación falló. Revisá el detalle en su panel.', requestBody: { fields: { Estado: 'Error' } } };
  if (!['pending', 'processing'].includes(data.status)) return { ...ctx, action: 'error', outcome: 'unknown_status', message: 'HeyGen devolvió un estado no reconocido.' };
  if (ctx.pollAttempt >= ctx.cfg.maxPolls) return { ...ctx, action: 'error', outcome: 'poll_timeout', message: 'Se alcanzó el límite de consultas. El registro queda En Proceso para reanudar sin crear otro video.' };
  return { ...ctx, action: 'wait' };
}

export function completedVideoResult(response, ctx) {
  if (!responseOk(response) || response.body?.id !== ctx.recordId || response.body?.fields?.Estado !== 'Completado' || response.body?.fields?.URL_VideoGenerado !== ctx.videoUrl) return { ...ctx, action: 'error', outcome: 'completion_not_saved', message: 'El video está listo pero Airtable no confirmó su URL. Reanudá con el ID existente.' };
  return { ...ctx, action: 'notify', outcome: 'completed', message: 'Video listo.' };
}

export function failedVideoResult(response, ctx) {
  return { ...ctx, action: 'error', message: responseOk(response) ? ctx.message : ctx.message + ' No se pudo actualizar su estado en Airtable.' };
}

export function prepareVideoNotice(ctx) {
  const good = ctx.outcome === 'completed';
  return { ...ctx, notice: { channel: good ? ctx.cfg.slackVideosChannel : ctx.cfg.slackErrorsChannel, text: good ? 'Video listo: ' + ctx.title + '\nRegistro: ' + ctx.recordId + '\n' + ctx.videoUrl : 'Revisar video: ' + (ctx.title || ctx.recordId || 'sin registro') + '\nRegistro: ' + (ctx.recordId || '-') + (ctx.videoId ? '\nID HeyGen: ' + ctx.videoId : '') + '\n' + ctx.message, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false } };
}

export function notificationResult(response, ctx) {
  return { recordId: ctx.recordId || null, videoId: ctx.videoId || null, outcome: ctx.outcome, message: ctx.message, notified: responseOk(response) && response.body?.ok === true, needsNotificationRetry: !(responseOk(response) && response.body?.ok === true) };
}

export function validateAudioMetadata(input, sizeBytes, cfg) {
  const requestId = String(input.json?.body?.request_id || '');
  const keys = Object.keys(input.binary || {});
  const file = input.binary?.audio;
  const base = { cfg, requestId };
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)) return { ...base, action: 'invalid', responseCode: 400, message: 'Enviá request_id: entre 8 y 128 letras, números, guiones o guiones bajos.' };
  if (keys.length !== 1 || !file) return { ...base, action: 'invalid', responseCode: 400, message: 'Enviá un solo archivo en el campo multipart audio.' };
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > cfg.maxAudioBytes) return { ...base, action: 'invalid', responseCode: 413, message: 'El audio debe tener contenido y pesar como máximo 20 MiB.' };
  if (!/\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i.test(file.fileName || '')) return { ...base, action: 'invalid', responseCode: 415, message: 'Formato de audio no admitido.' };
  if (!/^(audio\/|video\/|application\/octet-stream)/i.test(file.mimeType || '')) return { ...base, action: 'invalid', responseCode: 415, message: 'El tipo de archivo no corresponde a audio o video.' };
  return { ...base, action: 'lookup' };
}

export function audioLookupResult(response, ctx) {
  if (!responseOk(response) || !Array.isArray(response.body?.records)) return { ...ctx, action: 'error', responseCode: 502, message: 'No se pudo comprobar request_id en Airtable.' };
  const records = response.body.records;
  if (records.length) {
    const record = records[0];
    return { ...ctx, action: 'duplicate', responseCode: 200, recordId: record.id, fields: record.fields, duplicate: true, message: 'Este request_id ya está guardado. No se volvió a transcribir.' };
  }
  return { ...ctx, action: 'transcribe' };
}

export function makeAudioRecord(response, ctx, now) {
  const text = response.body?.text;
  if (!responseOk(response) || typeof text !== 'string' || !text.trim()) return { ...ctx, action: 'error', responseCode: 502, message: 'El servicio no devolvió una transcripción válida.' };
  if (text.length > 90000) return { ...ctx, action: 'error', responseCode: 422, message: 'La transcripción supera el tamaño que este flujo guarda en Airtable.' };
  const clean = text.trim();
  const cut = (value, max) => { const chars = Array.from(value); return chars.length <= max ? value : chars.slice(0, max - 3).join('') + '...'; };
  const title = cut(clean, 50);
  const fields = { SolicitudID: ctx.requestId, Titulo: title, Descripcion: cut(clean, 200), PromptVideo: 'Crea un video educativo basado en este contenido: ' + title + '. Enfócate en los puntos principales.', FormatoVideo: 'MP4', TranscripcionOriginal: clean, FechaCreacion: now };
  return { ...ctx, action: 'save', fields, requestBody: { fields } };
}

export function audioPersistResult(response, ctx) {
  if (!responseOk(response) || !response.body?.id || response.body?.fields?.SolicitudID !== ctx.requestId) return { ...ctx, action: 'error', responseCode: 502, message: 'No se confirmó el guardado en Airtable. Antes de reenviar, buscá request_id en la tabla para evitar un duplicado.' };
  const excerptChars = Array.from(ctx.fields.TranscripcionOriginal);
  const excerpt = excerptChars.slice(0, 100).join('') + (excerptChars.length > 100 ? '...' : '');
  return { ...ctx, action: 'notify', responseCode: 200, recordId: response.body.id, message: 'Audio transcrito y guardado.', notice: { channel: ctx.cfg.slackAudioChannel, text: 'Audio transcrito y guardado.\nSolicitud: ' + ctx.requestId + '\nRegistro: ' + response.body.id + '\nTranscripción (extracto): ' + excerpt, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false } };
}

export function audioNotificationResult(response, ctx) {
  return { ...ctx, notified: responseOk(response) && response.body?.ok === true };
}

export function audioErrorNotice(ctx) {
  return { ...ctx, notice: { channel: ctx.cfg.slackErrorsChannel, text: 'No se pudo completar la transcripción.\nSolicitud: ' + ctx.requestId + '\n' + ctx.message, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false } };
}

export function audioResponse(ctx) {
  if (ctx.responseCode >= 400) return { ok: false, request_id: ctx.requestId || null, message: ctx.message };
  return { ok: true, request_id: ctx.requestId, record_id: ctx.recordId, duplicate: ctx.duplicate === true, transcription: ctx.fields?.TranscripcionOriginal || '', title: ctx.fields?.Titulo || '', notified: ctx.notified ?? null, message: ctx.message };
}
