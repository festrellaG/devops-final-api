import { randomUUID } from 'node:crypto';
import express from 'express';
import { errorHandler } from './error-handler.js';

function requireJson(request, response, next) {
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return response.status(415).json({ error: 'Se requiere Content-Type: application/json.' });
  }
  next();
}

function hasOnlyField(body, field) {
  return body !== null
    && typeof body === 'object'
    && !Array.isArray(body)
    && Object.keys(body).length === 1
    && Object.hasOwn(body, field);
}

export function createApp() {
  const app = express();
  const tasks = new Map();
  app.disable('x-powered-by');

  // strict:false permite que nuestras validaciones rechacen también valores JSON primitivos.
  const parseJson = express.json({ limit: '16kb', strict: false });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/tasks', (_request, response) => {
    response.json([...tasks.values()]);
  });

  app.post('/tasks', requireJson, parseJson, (request, response) => {
    const body = request.body;
    if (!hasOnlyField(body, 'title') || typeof body.title !== 'string') {
      return response.status(400).json({ error: 'Enviar únicamente title de tipo string.' });
    }

    const title = body.title.trim();
    if (title.length < 1 || title.length > 120) {
      return response.status(400).json({ error: 'title debe tener entre 1 y 120 caracteres.' });
    }

    const task = { id: randomUUID(), title, completed: false };
    tasks.set(task.id, task);
    return response.status(201).json(task);
  });

  app.patch('/tasks/:id', requireJson, parseJson, (request, response) => {
    const body = request.body;
    if (!hasOnlyField(body, 'completed') || typeof body.completed !== 'boolean') {
      return response.status(400).json({ error: 'Enviar únicamente completed de tipo boolean.' });
    }

    const task = tasks.get(request.params.id);
    if (!task) {
      return response.status(404).json({ error: 'Tarea no encontrada.' });
    }

    task.completed = body.completed;
    return response.json(task);
  });

  app.delete('/tasks/:id', (request, response) => {
    if (!tasks.delete(request.params.id)) {
      return response.status(404).json({ error: 'Tarea no encontrada.' });
    }
    return response.status(204).end();
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);
  return app;
}