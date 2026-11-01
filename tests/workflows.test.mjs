import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowDir = resolve('workflows');
const files = () => readdirSync(workflowDir).filter((file) => file.endsWith('.json'));
const workflow = (file) => JSON.parse(readFileSync(resolve(workflowDir, file), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('se entregan dos flujos nativos n8n, inactivos y sin ejecuciones guardadas', () => {
  assert.equal(files().length, 2);
  for (const file of files()) {
    const flow = workflow(file);
    assert.equal(flow.active, false, `${file} debe estar inactivo`);
    assert.ok(Array.isArray(flow.nodes) && flow.nodes.length > 3);
    assert.equal(typeof flow.connections, 'object');
    assert.ok(!flow.pinData || Object.keys(flow.pinData).length === 0, 'sin audio/transcripciones de ejemplo fijadas');
    assert.equal(flow.id, undefined, 'no sobreescribir IDs de otro entorno al importar');
    assert.equal(flow.shared, undefined);
  }
});

test('IDs y nombres únicos; conexiones únicamente a nodos reales', () => {
  for (const file of files()) {
    const flow = workflow(file);
    const names = new Set(flow.nodes.map((node) => node.name));
    assert.equal(names.size, flow.nodes.length, `${file}: nombres repetidos`);
    assert.equal(new Set(flow.nodes.map((node) => node.id)).size, flow.nodes.length, `${file}: IDs repetidos`);
    for (const [source, outputs] of Object.entries(flow.connections)) {
      assert.ok(names.has(source), `origen inexistente: ${source}`);
      for (const branches of Object.values(outputs)) {
        for (const branch of branches) {
          for (const edge of branch) {
            assert.ok(names.has(edge.node), `destino inexistente: ${edge.node}`);
            assert.ok(Number.isInteger(edge.index) && edge.index >= 0);
          }
        }
      }
    }
    for (const node of flow.nodes) {
      assert.ok(node.type.startsWith('n8n-nodes-base.'), `solo nodos integrados: ${node.type}`);
      assert.ok(Number.isFinite(node.typeVersion));
      assert.ok(Array.isArray(node.position) && node.position.length === 2);
    }
  }
});

test('el webhook de audio exige autenticación y respuesta explícita', () => {
  const flows = files().map(workflow);
  const audio = flows.find((flow) => flow.nodes.some((node) => node.type === 'n8n-nodes-base.webhook'));
  assert.ok(audio, 'falta flujo webhook');
  const webhook = audio.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.ok(webhook.parameters.authentication && webhook.parameters.authentication !== 'none');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.ok(audio.nodes.some((node) => node.type === 'n8n-nodes-base.respondToWebhook'));
});

test('ninguna solicitud de generación de video se reintenta automáticamente', () => {
  const requests = files().flatMap((file) => workflow(file).nodes).filter((node) =>
    node.type === 'n8n-nodes-base.httpRequest' && node.parameters.method === 'POST' && /heygen/i.test(JSON.stringify(node)));
  assert.ok(requests.length > 0, 'falta solicitud de generación HeyGen');
  for (const request of requests) {
    assert.notEqual(request.retryOnFail, true, 'un POST ambiguo puede cobrar dos veces');
  }
});

test('todo camino hacia el POST HeyGen pasa primero por la reserva en Airtable', () => {
  const video = files().map(workflow).find((flow) => flow.nodes.some((node) => node.type === 'n8n-nodes-base.manualTrigger'));
  const create = video.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest' && node.parameters.method === 'POST' && /heygen/i.test(JSON.stringify(node)));
  const claim = video.nodes.find((node) => node.parameters.method === 'PATCH' && /Reservar registro/.test(node.name));
  assert.ok(claim, 'falta reserva anterior a una generación potencialmente facturable');
  const start = video.nodes.find((node) => node.type === 'n8n-nodes-base.manualTrigger');
  const seen = new Set();
  const queue = [start.name];
  while (queue.length) {
    const name = queue.shift();
    if (name === claim.name || seen.has(name)) continue;
    assert.notEqual(name, create.name, 'generación alcanzable sin reservar registro');
    seen.add(name);
    for (const branches of Object.values(video.connections[name] || {})) {
      for (const branch of branches) for (const edge of branch) queue.push(edge.node);
    }
  }
});

test('el código embebido y las expresiones n8n tienen sintaxis JavaScript válida', () => {
  const visit = (value, label) => {
    if (typeof value === 'string' && value.startsWith('={{') && value.endsWith('}}')) {
      assert.doesNotThrow(() => new Function(`return (${value.slice(3, -2).trim()});`), label);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, label + '.' + key);
    }
  };
  for (const file of files()) {
    for (const node of workflow(file).nodes) {
      if (node.type === 'n8n-nodes-base.code') assert.doesNotThrow(() => new AsyncFunction(node.parameters.jsCode), `${file}: ${node.name}`);
      visit(node.parameters, `${file}: ${node.name}`);
    }
  }
});

test('los archivos no embeben claves reales ni usan nodos de comandos o disco', () => {
  const forbidden = new Set(['n8n-nodes-base.executeCommand', 'n8n-nodes-base.readWriteFile', 'n8n-nodes-base.writeBinaryFile']);
  for (const file of files()) {
    const flow = workflow(file);
    const content = JSON.stringify(flow);
    assert.doesNotMatch(content, /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(content, /\bxox[baprs]-[A-Za-z0-9-]{10,}/);
    assert.doesNotMatch(content, /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]{20,}/);
    for (const node of flow.nodes) assert.ok(!forbidden.has(node.type), `nodo no portable: ${node.type}`);
  }
});
