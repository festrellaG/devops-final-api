# devops-final-api

API pequeña de tareas para aprender CI/CD. Implementada con JavaScript,
Node.js 24 y Express 5. Las tareas viven en memoria y se pierden al reiniciar.
No contiene autenticación ni base de datos: usar únicamente datos de laboratorio.

## Estado del proyecto

- Hito 1: especificación acordada en [spec.md](spec.md).
- Hito 2: API, pruebas, cobertura y arranque validados localmente en WSL.
- Hito 3, parte local: Build y prueba del paquete completados.
- CI/CD: webhook GitHub, pruebas, análisis SonarQube, Quality Gate, Docker build y publicación en ECR completados y validados en Jenkins.
- Pendiente opcional: implementar una Global Shared Library de Jenkins.
- No hace falta encender EC2 para los pasos de esta página.

## 1. Preparar el entorno local

Abrir una terminal **WSL** en la carpeta de este repositorio. Usar Node.js 24 LTS
y npm. Si utilizas nvm, `nvm use` selecciona la versión indicada en el proyecto.
La validación inicial se realizó con Node.js 24.15.0 y npm 11.12.1.

```bash
node --version
npm --version
npm ci
```

`npm ci` instala exactamente las dependencias del [package-lock.json](package-lock.json).
No alternar instalaciones Windows/WSL sobre el mismo directorio de dependencias;
al cambiar de entorno, reinstalar con `npm ci`. No versionar dependencias ni reportes.

## 2. Comprobar la API automáticamente

Ejecutar desde la raíz del repositorio:

```bash
npm run check
npm test
npm run test:coverage
```

| Comando | Qué comprueba |
| --- | --- |
| `npm run check` | Sintaxis de los archivos de ejecución; todavía no genera un paquete. |
| `npm test` | Contrato HTTP, validaciones, aislamiento y arranque del proceso real. |
| `npm run test:coverage` | Ejecuta las pruebas, genera LCOV/HTML y falla si alguna métrica queda por debajo de 80 %. |

Las pruebas abren puertos locales libres y cierran sus servidores al terminar.
No necesitan una API ya ejecutándose, acceso a AWS ni conexión a una base de datos.

El reporte LCOV para la futura integración SonarQube se genera en
[coverage/lcov.info](coverage/lcov.info), y el reporte visual en
[coverage/lcov-report/index.html](coverage/lcov-report/index.html).
Estos reportes se generan localmente, están ignorados por Git y no existirán en un
clon nuevo hasta ejecutar cobertura.

La cobertura incluye [src/app.js](src/app.js) y
[src/error-handler.js](src/error-handler.js). Se excluye solamente
[src/server.js](src/server.js), porque su arranque y apagado se comprueban como
proceso real en [test/server.test.js](test/server.test.js).
En Windows nativo, enviar SIGTERM no reproduce el cierre POSIX: para verificar
el cierre ordenado del futuro contenedor Linux, ejecutar estas pruebas en WSL/Linux.

## 3. Arrancar para una prueba manual

```bash
npm start
```

Dejar esa terminal abierta. La aplicación escucha en `0.0.0.0:3000`; abrir
<http://localhost:3000/health> para ver `{ "status": "ok" }` y
<http://localhost:3000/tasks> para ver inicialmente `[]`.

No abrir puertos del firewall para esta prueba local. Esta aplicación no debe
exponerse públicamente con datos sensibles.

Para utilizar otro puerto en WSL:

```bash
PORT=3001 npm start
```

En PowerShell, establecer `$env:PORT = '3001'` antes de `npm start`.
Detener con **Ctrl+C**. En WSL/Linux se espera el mensaje `Servidor cerrado.`.

## 4. Probar un ciclo completo en otra terminal WSL

### Crear una tarea

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Aprender Jenkins"}'
```

Resultado esperado: **201** y un objeto con `id`, `title` y `completed: false`.
Copiar el identificador devuelto en los ejemplos siguientes, sustituyendo `ID`.

### Listar

```bash
curl -i http://localhost:3000/tasks
```

Resultado: **200**, con la tarea en un array.

### Completar

```bash
curl -i -X PATCH http://localhost:3000/tasks/ID \
  -H 'Content-Type: application/json' \
  -d '{"completed":true}'
```

Resultado: **200**, con `completed: true`. Enviar `false` permite reabrirla.

### Eliminar

```bash
curl -i -X DELETE http://localhost:3000/tasks/ID
```

Resultado: **204**, sin cuerpo. Al listar otra vez ya no aparece.

### Probar una validación

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"   "}'
```

Resultado: **400**, con un mensaje en `error`. El título se recorta y debe tener
entre 1 y 120 caracteres. POST solo acepta `title`; PATCH solo acepta `completed`.

Estos ejemplos usan sintaxis bash de WSL, no PowerShell. También se pueden realizar
las mismas peticiones con Postman usando cuerpo JSON.

## 5. Estructura para entender el código

| Archivo | Responsabilidad |
| --- | --- |
| [src/app.js](src/app.js) | Crea la aplicación, sus rutas y un almacén nuevo por instancia. No abre un puerto. |
| [src/error-handler.js](src/error-handler.js) | Convierte errores en respuestas JSON sin exponer trazas internas. |
| [src/server.js](src/server.js) | Lee PORT, abre el puerto y atiende SIGTERM/SIGINT. |
| [test/app.test.js](test/app.test.js) | Peticiones HTTP reales y prueba del error interno genérico. |
| [test/server.test.js](test/server.test.js) | Arranque real, health, SIGTERM y rechazo de puertos inválidos. |
| [package.json](package.json) | Dependencias, comandos y umbrales de cobertura. |
| [spec.md](spec.md) | Requisitos de aplicación y plan de entrega por hitos. |

## 6. Evidencia del hito local

Validación realizada el 2026-10-02 en WSL con Node.js 24.15.0:

- Instalación reproducible con `npm ci` y comprobación de sintaxis satisfactorias.
- 40 pruebas aprobadas, cero fallos, incluyendo arranque y cierre real por SIGTERM.
- Cobertura de app y manejador de errores: 100 % en líneas, sentencias, funciones y ramas.
- El audit ejecutado durante la instalación no reportó vulnerabilidades conocidas;
  esto no garantiza ausencia de vulnerabilidades futuras o no detectadas.

Para tu presentación, guarda la salida de las pruebas y una captura de la petición
de creación y su listado. No guardar tokens ni datos personales en las evidencias.

## 7. Build local: producir y comprobar el artefacto

En Maven, `mvn clean compile` produce clases; normalmente `mvn package` produce
el JAR. Aquí el código JavaScript no se compila a bytecode: Build comprueba la
sintaxis y genera un paquete npm comprimido `.tgz`. Es un artefacto distribuible,
no un ejecutable equivalente a `java -jar` ni una imagen de contenedor.

Desde la raíz del repositorio, en WSL con Node.js 24, npm y `tar` disponibles:

```bash
npm run build
npm run test:package
```

### Qué hace Build

1. Comprueba la sintaxis con `npm run check`.
2. Prepara una carpeta temporal con una lista explícita de archivos.
3. Incluye una copia de [package-lock.json](package-lock.json) con el nombre de lockfile distribuible de npm, `npm-shrinkwrap.json`. npm excluye el lockfile habitual al empaquetar; este formato sí se incluye y permite `npm ci` después de extraerlo.
4. Ejecuta `npm pack` y verifica que solo se empaquetaron los cinco archivos esperados.
5. Guarda el resultado en [dist/devops-final-api-1.0.0.tgz](dist/devops-final-api-1.0.0.tgz) y elimina la carpeta temporal.

El artefacto contiene la metadata del paquete, su lockfile distribuible y los tres
archivos de ejecución. No contiene dependencias instaladas, pruebas, reportes,
scripts de Build ni archivos de secretos. La metadata conserva las dependencias
de desarrollo para mantener coherencia con el lockfile, pero la instalación de
producción no las instala. Dentro del paquete solo se ofrece el comando `start`.

El Build no borra la cobertura: podrá ejecutarse en paralelo con Sonar después
de que las pruebas produzcan LCOV. No ejecutar dos Builds simultáneos en la misma
carpeta. Repetir el Build reemplaza el artefacto de la misma versión; no limpia
otras versiones de la carpeta de salida. Las pruebas se ejecutan por separado,
no están implícitas en `npm run build`.

### Qué hace la prueba del paquete

1. Lee el artefacto generado; falla si no existe o si su contenido no coincide con lo esperado.
2. Lo extrae en una carpeta temporal fuera del repositorio y verifica fuentes y lockfile contra la versión local.
3. Instala dependencias con `npm ci --omit=dev --ignore-scripts`, usando el lockfile incluido. Necesita acceso al registry npm o los paquetes ya disponibles en caché.
4. Comprueba que c8 no esté instalado y arranca la aplicación extraída en un puerto libre.
5. Verifica `/health`, creación y listado de una tarea; luego cierra el proceso y elimina la carpeta temporal.

No usa las dependencias del directorio de trabajo, no toca las tareas de tu API
abierta en 3000 y no publica nada. Se desactivan scripts de instalación porque las
dependencias actuales no los requieren; reconsiderar esto si cambian.

Resultado comprobado el 2026-10-02: paquete generado, instalación productiva y
prueba HTTP satisfactorias. Las 40 pruebas originales siguen aprobadas y la
cobertura funcional permanece en 100 %. Los scripts de empaquetado se verifican
mediante esta prueba de integración; no se incluyen en ese porcentaje.

La implementación está en [scripts/build.js](scripts/build.js) y
[scripts/test-package.js](scripts/test-package.js). El artefacto está ignorado
por Git: en un clon nuevo se genera con Build, no se descarga del repositorio.

## 8. Configurar el webhook GitHub → Jenkins

El repositorio usa un webhook para que cada push a `main` inicie el job. El
webhook no es un stage del pipeline: GitHub envía un POST a Jenkins y el plugin
GitHub relaciona el evento con el job.

### Jenkins

1. En **Manage Jenkins → Plugins → Installed**, confirma que **GitHub plugin** esté habilitado.
2. En el job `proyecto-final-api`, confirma **Pipeline script from SCM**, el repositorio `https://github.com/festrellaG/devops-final-api.git`, la rama `*/main` y el script `Jenkinsfile`.
3. En **Configure → Build Triggers**, activa **GitHub hook trigger for GITScm polling**. El Jenkinsfile también declara `githubPush()`.

### GitHub

1. En el repositorio, abre **Settings → Webhooks → Add webhook**.
2. Configura **Payload URL** como `http://IP_PUBLICA_ACTUAL_EC2:8090/github-webhook/`.
3. Selecciona `application/json`, **Just the push event** y deja el webhook activo.
4. Guarda y revisa **Recent Deliveries**. La respuesta `200` y un build de Jenkins con causa **Started by GitHub push** confirman la entrega y el trigger. La consola debe mostrar el SHA del commit enviado.

La ruta `/github-webhook/` es el endpoint del plugin de Jenkins, no un alias
libre. La URL del laboratorio usa HTTP, así que la opción de verificación SSL de
GitHub no aplica; HTTP no cifra el payload. Si se configura HTTPS, mantener la
verificación SSL habilitada y usar un certificado confiable. Deshabilitar SSL no
soluciona errores de conexión.

### IP pública dinámica de EC2

La EC2 usa una IPv4 pública asignada automáticamente. Después de **detener e
iniciar** la instancia, esa IP puede cambiar. Consulta la IPv4 actual en los
detalles de la instancia y actualiza el **Payload URL** del webhook si cambió.
También verifica que Jenkins responda en `http://IP_PUBLICA_ACTUAL_EC2:8090`.
El Security Group debe permitir TCP `8090` para la entrega de GitHub y el acceso
administrativo autorizado. Si una entrega falla, primero confirma IP, estado de
Jenkins y regla de red; luego usa **Redeliver** en GitHub. GitHub no reintenta
automáticamente una entrega fallida.

Si configuraste una **Jenkins URL** externa en **Manage Jenkins → System**,
actualízala cuando cambie la IP para que los enlaces generados por Jenkins sigan
apuntando a la instancia actual. El webhook de SonarQube usa la dirección interna
de Docker `http://jenkins:8080/sonarqube-webhook/` y no cambia con la IP pública.

## 9. Credenciales AWS y publicación en ECR

El Jenkinsfile define `AWS_REGION=us-east-1` y `ECR_REPOSITORY=devops-final-api`.
La cuenta AWS se obtiene con STS durante la etapa de publicación; no se escribe
su número ni una clave en el repositorio.

En **Manage Jenkins → Credentials → System → Global credentials**, agrega dos
credenciales de tipo **Secret text**:

| ID en Jenkins | Secreto |
| --- | --- |
| `aws-access-key-id` | Access key ID de un usuario/rol IAM del laboratorio. |
| `aws-secret-access-key` | Secret access key correspondiente. |

El Jenkinsfile las enlaza solamente dentro de `Publish to ECR` mediante
`withCredentials`. No pegues los valores en el Jenkinsfile, README, logs ni
capturas. Para un entorno permanente, es preferible usar un IAM role asociado a
la EC2 en lugar de claves de larga duración.

La identidad necesita `ecr:GetAuthorizationToken`, `ecr:DescribeRepositories`,
`ecr:CreateRepository` y permisos para subir capas e imágenes (`ecr:BatchCheckLayerAvailability`,
`ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` y
`ecr:PutImage`). Limita los permisos de publicación al repositorio previsto
cuando sea posible. Si el repositorio no existe, el pipeline lo crea; luego
publica una etiqueta basada en el número de build y el SHA corto. El éxito se
confirma con `Finished: SUCCESS` y la etiqueta visible en ECR.

ECR almacena las imágenes y puede generar cargos por almacenamiento. Revisa el
presupuesto y elimina imágenes antiguas según una política acordada; apagar la
EC2 no elimina el repositorio ni sus imágenes.
