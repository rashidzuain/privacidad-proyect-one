# Proyect One · Diseño de automatización audiovisual

Dos flujos de trabajo para organizar la generación de videos y la transcripción de audio mediante Airtable, HeyGen, una API de transcripción y Slack. El repositorio también incluye una página HTML de política de privacidad.

**Contenido publicado:** diseño de integración. El JSON documenta los pasos y los datos previstos; su implementación ejecutable en n8n no está incluida.

[Explorar el diseño](agente%20ia%20videos.json) · [Ver la página de privacidad](https://rashidzuain.github.io/privacidad-proyect-one/)

## Qué incluye

| Archivo | Contenido |
| --- | --- |
| [`agente ia videos.json`](agente%20ia%20videos.json) | Especificación de los dos flujos, sus operaciones, campos, conexiones y avisos de error. |
| [`index.html`](index.html) | Página estática de política de privacidad de Proyect One. |
| [`LICENSE`](LICENSE) | Licencia MIT. |

## Los dos flujos

### 1. De Airtable a un video con HeyGen

El diseño parte de una ejecución manual y contempla:

1. Leer registros de Airtable con estado `Pendiente`.
2. Enviar el título y la descripción a HeyGen, con un avatar y una voz por configurar.
3. Guardar el identificador del video y marcar el registro como `En Proceso`.
4. Esperar y consultar la URL del video.
5. Guardar la URL en Airtable, marcar el registro como `Completado` y enviar un aviso por Slack.

También se describen avisos de error para las solicitudes a HeyGen.

### 2. De un audio a una transcripción en Airtable

El segundo diseño recibe audio mediante un webhook y contempla:

1. Guardar temporalmente el archivo recibido.
2. Enviarlo a una API de transcripción por configurar.
3. Crear un título y una descripción mediante recortes del texto transcrito, junto con un prompt de video.
4. Guardar esos campos y la transcripción original en Airtable.
5. Enviar un aviso de resultado o error por Slack.

Los flujos están descritos por separado. El archivo actual no conecta automáticamente la transcripción con la generación de video ni incluye descarga de videos o extracción de su audio.

## Cómo explorar el proyecto

- Abrí [`index.html`](index.html) en un navegador o visitá la [página publicada](https://rashidzuain.github.io/privacidad-proyect-one/).
- Revisá [`agente ia videos.json`](agente%20ia%20videos.json) para conocer los pasos, las expresiones y los campos previstos.

El JSON utiliza una estructura descriptiva propia (`workflow_name`, `flows`, `node_type` y `configuration`). **No es una exportación nativa de n8n lista para importar.** Para llevar el diseño a ejecución, hay que construir los nodos y sus conexiones en n8n y configurar las integraciones.

## Qué falta para ejecutar este diseño

- Crear una exportación nativa de n8n para cada flujo.
- Configurar las credenciales, bases y tablas de Airtable, avatar y voz de HeyGen, canales de Slack y proveedor de transcripción.
- Validar los endpoints, los formatos de solicitud y las respuestas de cada servicio.
- Revisar cómo se conservan los identificadores de Airtable entre pasos y cómo se manejan los archivos binarios.
- Incorporar comprobación del estado del video, reintentos y respuesta del webhook.
- Documentar una ejecución de ejemplo con datos de prueba y resultados reproducibles.

Los valores `YOUR_..._HERE` del archivo son marcadores de configuración. El repositorio no incluye pruebas de ejecución de extremo a extremo.

## Tecnologías presentes en el diseño

**n8n · Airtable · HeyGen · Slack · HTTP/JSON · JavaScript · HTML**

El proveedor de transcripción está pendiente de elección; los servicios mencionados en el JSON son ejemplos.

## Aportes

Las ideas, correcciones y propuestas de implementación son bienvenidas. Podés abrir un issue con el problema que encontraste o enviar un pull request explicando el cambio y cómo lo comprobaste.

## Licencia

[MIT](LICENSE) · Rashid Zuain.
