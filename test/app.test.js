import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/error-handler.js';

async function startApp(t) {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  return async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      ...options,
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null, text };
  };
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function assertError(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(Object.keys(response.body), ['error']);
  assert.equal(typeof response.body.error, 'string');
  assert.ok(response.body.error.length > 0);
}

test('health responde JSON y no anuncia Express', async (t) => {
  const request = await startApp(t);
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('ciclo completo: listar, crear, completar, reabrir y eliminar', async (t) => {
  const request = await startApp(t);
  const initial = await request('/tasks');
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body, []);

  const created = await request('/tasks', json('POST', { title: '  Aprender Jenkins  ' }));
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.body).sort(), ['completed', 'id', 'title']);
  assert.match(created.body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(created.body.title, 'Aprender Jenkins');
  assert.equal(created.body.completed, false);

  const second = await request('/tasks', json('POST', { title: 'Probar Sonar' }));
  assert.notEqual(second.body.id, created.body.id);
  assert.deepEqual((await request('/tasks')).body, [created.body, second.body]);

  for (const completed of [true, false]) {
    const updated = await request(`/tasks/${created.body.id}`, json('PATCH', { completed }));
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body, { ...created.body, completed });
    assert.equal((await request('/tasks')).body[0].completed, completed);
  }

  const deleted = await request(`/tasks/${created.body.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.equal(deleted.text, '');
  assert.deepEqual((await request('/tasks')).body, [second.body]);
  assertError(await request(`/tasks/${created.body.id}`, { method: 'DELETE' }), 404);
  assertError(await request(`/tasks/${created.body.id}`, json('PATCH', { completed: true })), 404);
});

for (const [description, body] of [
  ['sin title', {}], ['title numérico', { title: 7 }], ['title null', { title: null }],
  ['título vacío', { title: '' }], ['solo espacios', { title: ' \t\n ' }],
  ['121 caracteres', { title: 'a'.repeat(121) }],
  ['campo adicional', { title: 'Tarea', other: true }],
  ['id del cliente', { title: 'Tarea', id: 'propio' }],
  ['estado del cliente', { title: 'Tarea', completed: true }],
  ['array', []], ['null', null], ['string', 'texto'], ['número', 42], ['boolean', false],
]) {
  test(`POST rechaza ${description} sin crear tareas`, async (t) => {
    const request = await startApp(t);
    assertError(await request('/tasks', json('POST', body)), 400);
    assert.deepEqual((await request('/tasks')).body, []);
  });
}

for (const length of [1, 120]) {
  test(`POST acepta límite válido de ${length} caracteres tras recortar`, async (t) => {
    const request = await startApp(t);
    const title = 'a'.repeat(length);
    const response = await request('/tasks', json('POST', { title: ` ${title} ` }));
    assert.equal(response.status, 201);
    assert.equal(response.body.title, title);
  });
}

for (const [description, body] of [
  ['sin completed', {}], ['string true', { completed: 'true' }],
  ['número', { completed: 1 }], ['valor null', { completed: null }],
  ['campo adicional', { completed: true, title: 'Cambio' }],
  ['array', []], ['null', null], ['primitivo', true],
]) {
  test(`PATCH rechaza ${description} y no altera la tarea`, async (t) => {
    const request = await startApp(t);
    const created = await request('/tasks', json('POST', { title: 'Original' }));
    assertError(await request(`/tasks/${created.body.id}`, json('PATCH', body)), 400);
    assert.deepEqual((await request('/tasks')).body, [created.body]);
  });
}

for (const id of ['no-es-uuid', randomUUID()]) {
  test(`PATCH y DELETE devuelven 404 para identificador ${id}`, async (t) => {
    const request = await startApp(t);
    assertError(await request(`/tasks/${id}`, json('PATCH', { completed: true })), 404);
    assertError(await request(`/tasks/${id}`, { method: 'DELETE' }), 404);
  });
}

for (const [method, path] of [['POST', '/tasks'], ['PATCH', '/tasks/no-existe']]) {
  test(`${method}: JSON mal formado, cuerpo vacío, tipo incorrecto y límite`, async (t) => {
    const request = await startApp(t);
    assertError(await request(path, {
      method, headers: { 'Content-Type': 'application/json' }, body: '{invalido',
    }), 400);
    assertError(await request(path, {
      method, headers: { 'Content-Type': 'application/json' },
    }), 400);
    assertError(await request(path, { method }), 415);
    assertError(await request(path, { method, body: 'texto' }), 415);
    assertError(await request(path, {
      method, headers: { 'Content-Type': 'application/xml' }, body: '<task/>',
    }), 415);
    assertError(await request(path, json(method, { title: 'x'.repeat(17 * 1024) })), 413);
    assertError(await request(path, {
      ...json(method, {}), headers: { 'Content-Type': 'application/json; charset=iso-8859-1' },
    }), 415);
    assertError(await request(path, {
      ...json(method, {}), headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'unknown' },
    }), 415);
  });
}

test('acepta JSON con charset UTF-8', async (t) => {
  const request = await startApp(t);
  const response = await request('/tasks', {
    ...json('POST', { title: 'Preparar presentación' }),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.title, 'Preparar presentación');
});

test('ruta desconocida devuelve un error JSON', async (t) => {
  const request = await startApp(t);
  assertError(await request('/desconocida'), 404);
});

test('cada instancia tiene almacenamiento independiente', async (t) => {
  const first = await startApp(t);
  const second = await startApp(t);
  await first('/tasks', json('POST', { title: 'Solo en la primera' }));
  assert.equal((await first('/tasks')).body.length, 1);
  assert.deepEqual((await second('/tasks')).body, []);
});

test('un error inesperado no expone su mensaje ni stack', () => {
  let actualStatus;
  let actualBody;
  const response = {
    status(value) { actualStatus = value; return this; },
    json(value) { actualBody = value; },
  };
  errorHandler(new Error('Información interna privada'), {}, response, () => {});
  assert.equal(actualStatus, 500);
  assert.deepEqual(actualBody, { error: 'Error interno del servidor.' });
});