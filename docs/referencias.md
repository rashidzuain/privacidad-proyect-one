# Referencias de las integraciones

Estas son las fuentes oficiales para revisar una configuración o adaptar el proyecto cuando cambien las APIs. El archivo de diseño inicial sirve para entender el recorrido; para las rutas y los parámetros de los servicios, usá sus referencias actuales.

- [n8n: importar y exportar workflows](https://docs.n8n.io/workflows/export-import/): cómo cargar los JSON en el editor.
- [n8n: HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/): autenticación, cuerpos JSON y multipart, respuestas y paginación.
- [n8n: Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/): URLs de prueba y producción, autenticación y recepción de archivos.
- [Airtable: Personal Access Tokens](https://support.airtable.com/articles/9934989703-creating-personal-access-tokens): permisos y bases accesibles para una credencial.
- [Airtable: Web API](https://support.airtable.com/articles/6292134965-getting-started-with-airtable-s-web-api): lectura de registros por páginas y límites de la API.
- [HeyGen: generación de video con avatar](https://developers.heygen.com/generate-avatar-video): creación con guion, voz y avatar, y consulta del resultado.
- [HeyGen: comparación de versiones](https://developers.heygen.com/endpoint-version-comparison): diferencias entre la API actual y las rutas del diseño inicial.
- [Slack: chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/): envío de avisos y respuestas de error.
- [Slack: permiso chat:write](https://docs.slack.dev/reference/scopes/chat.write): permiso para enviar mensajes como la aplicación.
- [Groq: transcripción de audio](https://console.groq.com/docs/speech-to-text): endpoint compatible con multipart, modelos y formatos admitidos.
- [Groq: límites de uso](https://console.groq.com/docs/rate-limits): cuotas de la organización y límites del nivel gratuito.
- [Groq: whisper-large-v3-turbo](https://console.groq.com/docs/model/whisper-large-v3-turbo): características y precio publicado del modelo elegido.
- [HeyGen: créditos y precios de API](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-credits-explained): acceso de API y cobro según motor y duración.

## Una diferencia importante del diseño inicial

`MP4` identifica el formato del archivo de video. La resolución es otra opción: por ejemplo, `720p` o `1080p`. La implementación debe mantener esas configuraciones separadas y usar la API v3 de HeyGen; las rutas v1 del archivo original se conservan como parte del historial del diseño.

## Elección de servicios

Groq con `whisper-large-v3-turbo` es la opción inicial para transcribir: tiene soporte multilingüe, un nivel gratuito con cuotas y un endpoint que permite mantener el envío multipart del diseño. El límite del proyecto es 20 MiB por archivo; el límite efectivo también depende de la instancia de n8n. En el nivel gratuito de Groq, la documentación consultada indica hasta 25 MB por archivo.

Airtable y Slack se conservan porque ya forman parte del diseño. Revisá las cuotas de sus planes y el uso esperado antes de ampliar el número de registros o avisos.

HeyGen usa créditos de API con pago por uso y su costo depende del motor, el avatar y la duración. La generación queda deshabilitada en la configuración inicial para que el primer video se solicite cuando ya elegiste la cuenta y las opciones.

Como referencia, el precio publicado para la transcripción con `whisper-large-v3-turbo` era de USD 0,04 por hora de audio al consultar la documentación el 1 de noviembre de 2026. No es una cotización del costo total del proyecto: los planes, las cuotas y las tarifas pueden cambiar. Las páginas oficiales enlazadas son la fuente para confirmar las condiciones de tu cuenta.
