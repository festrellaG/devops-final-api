import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT debe ser un entero entre 0 y 65535.');
  process.exit(1);
}

const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`API escuchando en puerto ${server.address().port}`);
});

server.on('error', (error) => {
  console.error(`No se pudo iniciar el servidor: ${error.code}`);
  process.exitCode = 1;
});

function shutdown() {
  console.log('Cerrando servidor...');
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exitCode = 1;
  }, 5000);
  deadline.unref();

  server.close(() => {
    clearTimeout(deadline);
    console.log('Servidor cerrado.');
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);