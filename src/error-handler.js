const parserErrors = new Map([
  ['entity.parse.failed', [400, 'JSON mal formado.']],
  ['entity.too.large', [413, 'El cuerpo supera el límite de 16 KiB.']],
  ['charset.unsupported', [415, 'Codificación de texto no soportada.']],
  ['encoding.unsupported', [415, 'Compresión no soportada.']],
]);

// Express reconoce los manejadores de errores por sus cuatro argumentos.
export function errorHandler(error, _request, response, _next) {
  const [status, message] = parserErrors.get(error.type)
    ?? [500, 'Error interno del servidor.'];
  response.status(status).json({ error: message });
}