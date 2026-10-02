import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));

test('proceso real: PORT, health y cierre por SIGTERM', { timeout: 15000 }, async (t) => {
  // PORT=0 pide un puerto libre al SO: no interfiere con una API abierta en 3000.
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error('El servidor salió antes de estar listo.')));
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = /API escuchando en puerto (\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  child.kill('SIGTERM');
  const [code, signal] = await closed;
  // Windows termina el proceso al enviar SIGTERM; POSIX ejecuta el manejador.
  if (process.platform !== 'win32') {
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.match(output, /Servidor cerrado\./);
  }
});

test('rechaza puertos inválidos', { concurrency: 4, timeout: 15000 }, async (t) => {
  await Promise.all(['abc', '-1', '65536', '3.5'].map((port) => t.test(`PORT=${port}`, async (t) => {
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: port }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    const closed = once(child, 'close');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    const [code] = await closed;
    assert.equal(code, 1);
    assert.match(errors, /PORT debe ser un entero/);
  })));
});