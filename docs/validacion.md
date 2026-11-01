# Qué se comprobó

Este registro corresponde a la revisión del 1 de noviembre de 2026. Distingue las pruebas del código, la importación en n8n y la conexión con los servicios externos.

## Pruebas locales

`npm run verify` regenera las exportaciones y ejecuta las pruebas de dominio, estructura y sintaxis. La revisión inicial pasó 20 pruebas: 13 de lógica y 7 de invariantes de los workflows. Los contadores pueden cambiar si se agregan casos; el resultado que muestra el comando es la referencia para tu copia.

Las pruebas revisan, entre otros casos, la conservación del ID de Airtable, la lectura de páginas, los estados de video, los límites de consulta, las respuestas inválidas, los metadatos del audio y los reintentos de solicitudes ya guardadas.

El workflow de GitHub Actions ejecuta la verificación local y comprueba que regenerar los archivos no deje cambios pendientes en `workflows/`. No usa las claves de tus cuentas.

## Importación en n8n

Se comprobó la importación y exportación de los dos workflows con **n8n 2.22.6** en una base local aislada. Ambos quedaron inactivos. Esa comprobación no modificó la base de datos de la instancia de uso ni conectó credenciales reales.

Para repetirla, necesitás una instalación local de n8n. Definí `N8N_CLI_PATH` con la ruta a su archivo `bin/n8n` y ejecutá:

```sh
npm run verify:n8n-import
```

El script crea una carpeta propia dentro de `.test-output/`, importa los JSON y los vuelve a exportar. Revisa la cantidad de flujos, sus nombres, sus nodos y que sigan inactivos. Importar un archivo no equivale a ejecutar todas sus ramas.

## Ejecución con servicios simulados

Los comandos `npm run verify:n8n-mocks` y `npm run verify:n8n-audio` comprueban el motor real de n8n con servidores HTTP locales y credenciales ficticias.

El recorrido de video pasó en n8n 2.22.6: se leyeron dos páginas de Airtable y se procesaron tres registros. Se solicitó un solo video nuevo; otro se reanudó con su ID existente. El tercero estaba `En Proceso` sin ID y generó un aviso de revisión en lugar de pedir otro video. La ejecución incluyó 14 llamadas a los servicios HTTP simulados y comprobó los resultados guardados y los avisos de Slack.

El webhook de audio también pasó en n8n 2.22.6. Se envió un WAV sintético al webhook real y se comprobó que el nodo HTTP entregara sus bytes como multipart al proveedor simulado. La prueba verificó el rechazo de una solicitud sin clave, el guardado de la transcripción simulada, la respuesta con `notified = false` ante un fallo de Slack, la recuperación de un `request_id` ya guardado sin otra transcripción y los errores para un identificador o una extensión inválidos.

El WAV contiene silencio de prueba. El texto fue una respuesta controlada del servidor local: esta comprobación valida el transporte binario y el recorrido del workflow, no la calidad de reconocimiento de voz de Groq.

Las simulaciones permiten preparar respuestas de error y éxito sin enviar contenido a Airtable, HeyGen, Groq o Slack. No validan la disponibilidad ni los permisos de las cuentas reales.

## Lo que falta comprobar con tus cuentas

Todavía no se realizó una ejecución integrada con credenciales reales de Airtable, HeyGen, Groq y Slack. No se generó un video real, no se transcribió un audio con una cuenta conectada y no se enviaron avisos reales por estos workflows durante las comprobaciones locales.

Para esa prueba quedan por confirmar los IDs de tablas y canales, las credenciales, el avatar y la voz, las cuotas de la cuenta y el resultado de cada recorrido. La [guía de puesta en marcha](puesta-en-marcha.md) detalla los pasos.

La generación de videos sigue deshabilitada en la configuración que se comparte. Usar los servicios reales es una etapa aparte; no hace falta habilitarla para revisar el código o ejecutar las simulaciones.
