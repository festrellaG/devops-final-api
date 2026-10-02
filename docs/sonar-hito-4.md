# Hito 4, paso 1 — Análisis Sonar secuencial

## Estado y alcance

La ejecución inicial de Jenkins terminó en SUCCESS según la evidencia del usuario.
El proyecto SonarQube `devops-final-api` está creado. Jenkins obtuvo una respuesta
UP desde `http://sonarqube:9000` y el servidor reportó versión 26.9.0.129388.

Este cambio agrega el stage Sonar después de la validación Node.js. Todavía NO
implementa paralelismo, espera de Quality Gate ni publicación de imágenes.
La ejecución remota y los permisos del token siguen pendientes de comprobar.

## Configuración que se reutiliza

| Elemento | Valor |
| --- | --- |
| Conexión en Manage Jenkins → System | `sonarqube-server` |
| URL interna que debe estar guardada en esa conexión | `http://sonarqube:9000` |
| Credencial seleccionada en la conexión | `sonar-token` |
| Herramienta en Manage Jenkins → Tools | `sonar-scanner` |
| Scanner mostrado por el usuario | 8.1.0.6389, instalación automática |
| Project key esperado | `devops-final-api` |

La credencial debe ser válida y tener Execute Analysis para este proyecto. Si es
un token limitado a otro proyecto, no servirá para esta API: habrá que generar uno
específico y usarlo solo para este job, sin sustituir credenciales de laboratorios.
No enviar el token por chat ni guardarlo en Git.

## Qué hace el nuevo stage

1. Comprueba que el reporte LCOV existe y no está vacío.
2. Resuelve la herramienta `sonar-scanner` configurada en Jenkins.
3. `withSonarQubeEnv` proporciona la URL y autenticación de `sonarqube-server`.
4. Ejecuta el scanner en el nodo Jenkins, fuera del contenedor temporal Node.
5. El scanner lee [sonar-project.properties](../sonar-project.properties), analiza los fuentes, importa LCOV y envía el reporte a SonarQube.

El workspace se conserva entre etapas. El scanner no necesita que la API esté
encendida: realiza análisis estático. Las pruebas y su cobertura ya se ejecutaron
en el contenedor Node. La disponibilidad de Java y el aprovisionamiento de runtimes
del scanner se verificarán en esta primera ejecución; no se instala Java en la EC2
por separado como sustituto de comprobar el entorno real de Jenkins.

Se analizan `src` como fuentes y `test` como pruebas. Los scripts de empaquetado
no están en el alcance inicial. El arranque del servidor se analiza estáticamente,
pero se excluye solo de cobertura, igual que en c8, porque sus pruebas son de proceso.

## Publicar y ejecutar

1. Confirmar que la URL interna está guardada en Jenkins y el project key coincide.
2. Revisar y publicar únicamente los cambios de este paso: [Jenkinsfile](../Jenkinsfile), [sonar-project.properties](../sonar-project.properties) y esta guía.
3. En el job existente `proyecto-final-api`, pulsar Build Now. No crear otro job.
4. Abrir Console Output y localizar el stage Sonar.
5. Comprobar envío exitoso del análisis y después abrir Projects → devops-final-api en SonarQube. Esperar a que termine el procesamiento de Background Tasks.
6. Revisar Overview, Issues y Measures/Coverage. Compartir el resultado antes de pasar al paralelismo.

La primera ejecución puede descargar el scanner, analizadores o runtimes y tardar
más. Si el enlace de la consola usa el nombre interno `sonarqube`, abrir manualmente
SonarQube desde la IP pública actual en el navegador; no cambiar la conexión interna.

## Qué demuestra y qué no

- Un scanner exitoso demuestra que pudo analizar y enviar el reporte.
- SonarQube calcula después el Quality Gate; puede fallar aunque Jenkins termine en SUCCESS en este paso.
- La cobertura global esperada para el alcance indicado es 100 %, según LCOV local. Las métricas de New Code pueden diferir o no estar disponibles en un primer análisis.
- No se desactivarán reglas para forzar un resultado verde: revisar los hallazgos antes de corregirlos.
- En el paso posterior agregaremos el webhook interno de SonarQube y la espera del Quality Gate. No se necesita ese webhook para enviar este primer análisis.

## Diagnóstico inicial

| Error | Qué revisar |
| --- | --- |
| Herramienta o conexión no encontrada | Los nombres deben coincidir exactamente con la configuración de Jenkins. |
| Connection refused, timeout o DNS | URL interna guardada, servicio SonarQube UP y agente que ejecuta el scanner. |
| Not authorized o project not found | Project key, token vigente y permiso Execute Analysis para esta API. |
| Java o runtime no disponible | Versión y entorno del proceso scanner dentro del nodo Jenkins; compartir el error concreto. |
| No encuentra LCOV o no resuelve sus fuentes | Reporte generado antes del stage, workspace compartido y rutas de fuentes del reporte. |
| Jenkins SUCCESS pero Quality Gate rojo | Esperable hasta agregar la espera: revisar las condiciones fallidas en SonarQube. |

No incluir tokens en capturas. Este paso no hace commit/push ni modifica Jenkins
automáticamente; el usuario reproduce y confirma la ejecución remota.
