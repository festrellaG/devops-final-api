import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const artifact = join(root, 'dist', `${manifest.name}-${manifest.version}.tgz`);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Ejecutar mediante npm run test:package.');
await access(artifact); // Falla si todavía no se ha construido el artefacto.
const temporary = await mkdtemp(join(tmpdir(), 'devops-package-test-'));
let child;
let closed;

try {
  const expected = [
    'package/package.json', 'package/npm-shrinkwrap.json',
    'package/src/app.js', 'package/src/server.js', 'package/src/error-handler.js',
  ].sort();
  const entries = execFileSync('tar', ['-tzf', artifact], {
    encoding: 'utf8', timeout: 10000,
  }).trim().split(/\r?\n/).sort();
  assert.deepEqual(entries, expected, 'El paquete debe contener solo los cinco archivos acordados.');
  execFileSync('tar', ['-xzf', artifact, '-C', temporary], { timeout: 10000 });
  const extracted = join(temporary, 'package');
  for (const name of ['app.js', 'server.js', 'error-handler.js']) {
    assert.deepEqual(
      await readFile(join(extracted, 'src', name)),
      await readFile(join(root, 'src', name)),
      `El paquete no corresponde al código actual: ${name}. Ejecutar npm run build.`,
    );
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(extracted, 'npm-shrinkwrap.json'), 'utf8')),
    JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')),
    'El lockfile del paquete debe coincidir con el del proyecto.',
  );
  console.log('Contenido y lockfile del paquete verificados.');
  console.log('Instalando exclusivamente dependencias de producción en un directorio temporal...');
  execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: extracted, stdio: 'inherit', timeout: 120000,
  });
  await assert.rejects(access(join(extracted, 'node_modules', 'c8')), { code: 'ENOENT' });
  child = spawn(process.execPath, ['src/server.js'], {
    cwd: extracted, env: { ...process.env, PORT: '0', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  closed = once(child, 'close');
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('El paquete no arrancó en 10 segundos.')), 10000);
    const fail = (error) => { clearTimeout(deadline); reject(error); };
    child.once('error', fail);
    child.once('exit', () => fail(new Error('El paquete terminó antes de estar listo.')));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = /API escuchando en puerto (\d+)/.exec(output);
      if (match) { clearTimeout(deadline); resolve(Number(match[1])); }
    });
  });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...options, signal: AbortSignal.timeout(5000),
  });
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const created = await request('/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Probar el artefacto' }),
  });
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.equal(task.title, 'Probar el artefacto');
  assert.equal(task.completed, false);
  const listed = await request('/tasks');
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [task]);
  console.log('Paquete aprobado: /health 200, POST /tasks 201 y GET /tasks 200.');
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 7000);
  let exit;
  try { exit = await closed; } finally { clearTimeout(killTimer); }
  if (process.platform !== 'win32') {
    assert.deepEqual(exit, [0, null], 'El paquete debe cerrar sin errores.');
    assert.match(output, /Servidor cerrado\./);
  }
  console.log('Prueba finalizada; servidor temporal detenido.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  if (closed) await closed;
  await rm(temporary, { recursive: true, force: true });
}