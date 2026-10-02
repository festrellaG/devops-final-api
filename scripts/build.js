import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Ejecutar mediante npm run build.');
const staging = await mkdtemp(join(tmpdir(), 'devops-build-'));

try {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  // El paquete solo ofrece start; check/test/build son herramientas del repositorio.
  manifest.scripts = { start: manifest.scripts.start };
  delete manifest.c8;
  manifest.files = ['src/', 'npm-shrinkwrap.json'];
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(staging, 'src'));
  // Lista explícita: no copiar .env, pruebas, reportes ni dependencias instaladas.
  for (const name of ['app.js', 'server.js', 'error-handler.js']) {
    await copyFile(join(root, 'src', name), join(staging, 'src', name));
  }
  // npm pack excluye package-lock.json; npm-shrinkwrap.json sí viaja en el paquete.
  // Es el mismo lockfile, sin resolver ni actualizar versiones durante el Build.
  await copyFile(join(root, 'package-lock.json'), join(staging, 'npm-shrinkwrap.json'));
  const output = execFileSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts'], {
    cwd: staging, encoding: 'utf8', timeout: 60000,
  });
  const [packed] = JSON.parse(output);
  const expected = [
    'package.json', 'npm-shrinkwrap.json', 'src/app.js', 'src/server.js', 'src/error-handler.js',
  ].sort();
  const actual = packed.files.map((file) => file.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Contenido inesperado del paquete: ${actual.join(', ')}`);
  }
  const dist = join(root, 'dist');
  await mkdir(dist, { recursive: true });
  // Reemplaza únicamente el artefacto de esta versión, sin borrar dist ni cobertura.
  const destination = join(dist, packed.filename);
  const pending = `${destination}.tmp`;
  await copyFile(join(staging, packed.filename), pending);
  await rename(pending, destination);
  console.log(`Artefacto generado: dist/${packed.filename}`);
  console.log(`Contenido verificado (${actual.length} archivos):\n${actual.join('\n')}`);
  console.log(`Tamaño comprimido: ${packed.size} bytes`);
} finally {
  await rm(staging, { recursive: true, force: true });
}