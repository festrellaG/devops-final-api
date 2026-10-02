# Hito 3 — Primer job de Jenkins

## Qué está preparado y qué falta

El [Jenkinsfile](../Jenkinsfile) contiene el pipeline inicial. Los comandos npm
se comprobaron localmente; la ejecución y validación definitiva del pipeline
deben realizarse en tu Jenkins. No confundir comprobación local con un build
exitoso en la EC2.

En esta etapa no se configura webhook, Sonar, Quality Gate, construcción de imagen
ni ECR. La API ya publicada no implica que este nuevo archivo también esté en GitHub:
hay que confirmar y publicar estos cambios antes de crear el job desde SCM.

## 1. Publicar la definición del pipeline

En la carpeta del repositorio, revisar los cambios. Seleccionar únicamente los
archivos de este hito, crear el commit y hacer push con la cuenta festrellaG.
Verificar después que la rama `main` en GitHub muestra el archivo de pipeline en
la raíz. Nunca subir dependencias, cobertura, artefactos ni credenciales.

## 2. Preparar Jenkins existente

1. Encender la EC2 existente y consultar su IP pública actual.
2. Abrir Jenkins en el puerto 8090. Si no responde, comprobar contenedores y reglas de acceso; no recrear datos ni instalar otro Jenkins.
3. En Manage Jenkins → Plugins → Installed, comprobar Pipeline (incluido Declarative), Git y Docker Pipeline. Este último proporciona `agent { docker { ... } }`; no confundirlo con el plugin Docker de aprovisionamiento de agentes.
4. Si el pipeline queda esperando un ejecutor, comprobar Manage Jenkins → Nodes: necesita un nodo Linux en línea con Git, Docker CLI y acceso al motor Docker.

El entorno del curso monta el socket Docker en Jenkins. La imagen Node se
ejecutará como otro contenedor del motor de la EC2, no como una nueva EC2 ni como
una imagen de nuestra API. La primera descarga de `node:24-bookworm` puede tardar
y consumir disco y transferencia; no implica costo adicional de otra instancia.
Su consumo sigue sujeto a las condiciones de tu cuenta.

Usar el controlador como ejecutor es una simplificación del laboratorio, no la
arquitectura recomendada para producción. No ejecutar código de terceros no confiable.

## 3. Crear un job independiente

Dentro de la carpeta `pipelines-as-code`:

1. Pulsar **New Item**.
2. Nombre: `proyecto-final-api`.
3. Tipo: **Pipeline**; pulsar **OK**.
4. Dejar desactivados los triggers por ahora.
5. En Pipeline → Definition elegir **Pipeline script from SCM**.
6. SCM: **Git**.
7. Repository URL: `https://github.com/festrellaG/devops-final-api.git`.
8. Credentials: **none**, porque el repositorio es público y solo se leerá. Si se vuelve privado, configurar una credencial de lectura en Jenkins.
9. Branch Specifier: `*/main`.
10. Script Path: `Jenkinsfile` (con J mayúscula, en la raíz).
11. Mantener **Lightweight checkout** activado y guardar.

No usar el alias SSH del equipo Windows como URL en Jenkins: no se configura
automáticamente en la EC2. No modificar los jobs existentes de los laboratorios.

## 4. Primera ejecución manual

Pulsar **Build Now**, abrir la nueva ejecución y después **Console Output**.

| Stage | Qué hace y qué comprobar |
| --- | --- |
| Get Source | Limpia exclusivamente el workspace del nuevo job, hace checkout e imprime el SHA. |
| Preparar | Inicia el entorno Node.js 24 y ejecuta `npm ci` con el lockfile versionado. |
| Pruebas y cobertura | Ejecuta las 40 pruebas y valida el umbral de cobertura del 80 %. |
| Build | Valida sintaxis, empaqueta y verifica los cinco archivos del artefacto. |
| Prueba del paquete | Instala dependencias productivas en un directorio temporal y comprueba la API extraída. |
| Archivar artefactos | Conserva paquete y LCOV en Jenkins con huella de identificación. |

Preparar, pruebas, Build y prueba del paquete están agrupados bajo
**Validacion Node.js**, compartiendo un contenedor temporal y workspace. No están
en paralelo todavía: ese cambio llegará al integrar Sonar. `reuseNode true`
mantiene el checkout inicial y `skipDefaultCheckout(true)` evita otro checkout
automático en los agentes. Leer inicialmente el pipeline desde SCM sigue siendo
necesario y no es lo mismo que obtener el código en Get Source.

## 5. Resultado y evidencia

- Resultado final esperado: **SUCCESS**.
- El SHA impreso debe corresponder al commit construido de `main`.
- En la página de la ejecución deben aparecer el paquete y LCOV como artefactos descargables.
- Guardar captura del pipeline y consola sin credenciales; compartir el resultado antes de continuar con Sonar.

## Si falla

| Síntoma | Primera comprobación |
| --- | --- |
| No encuentra el archivo de pipeline | Confirmar push, rama `main` y Script Path en la raíz. |
| Tipo de agente Docker inválido | Comprobar Docker Pipeline y compatibilidad con Jenkins. |
| Docker no encontrado o daemon inaccesible | Revisar CLI y montaje del socket en el nodo que ejecutó el job. |
| No encuentra la configuración npm dentro del contenedor | Revisar montajes del workspace y registro de `docker run`; socket montado no garantiza que las rutas del host y Jenkins coincidan. |
| Error de descarga de la imagen | Revisar salida a Internet, límite de descargas, espacio y disponibilidad del tag. |
| Código 137 o proceso terminado | Revisar memoria de EC2; no cambiar a una instancia de pago sin comprobar cobertura y acordarlo. |
| Pruebas aprobadas pero resultado distinto de SUCCESS | Revisar el primer stage que falló: el paquete y su prueba son pasos independientes. |

No cambiar varias configuraciones a la vez: compartir el primer error y unas
líneas de contexto, ocultando cualquier secreto.
