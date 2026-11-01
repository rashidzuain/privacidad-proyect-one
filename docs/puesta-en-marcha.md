# Poner los flujos en marcha

La configuración se hace en tu instancia de n8n. Los archivos del repositorio incluyen los nodos y sus conexiones, pero no las credenciales de tus cuentas.

La versión de referencia para esta entrega es **n8n 2.22.6**, que corresponde a la instancia local revisada. El alcance de las comprobaciones en esa versión se detalla en el [registro de validación](validacion.md).

## 1. Prepará las cuentas y las tablas

Necesitás una base de Airtable con las tablas de [esta guía](airtable.md), acceso a la API de HeyGen, un workspace de Slack donde puedas instalar un bot y una clave de Groq para la transcripción.

La elección inicial es Groq con `whisper-large-v3-turbo`: permite transcribir en varios idiomas y tiene un nivel gratuito con límites. Airtable y Slack se mantienen para respetar el recorrido del diseño original. HeyGen requiere revisar el acceso y los créditos de API de tu cuenta; una suscripción a su aplicación no equivale necesariamente a esos créditos. Consultá las [referencias de servicios y costos](referencias.md) antes de la primera llamada real.

## 2. Importá los dos workflows

En el menú del workflow de n8n, elegí **Import from File** y cargá estos archivos, uno por vez:

- [`01-videos-airtable-heygen.json`](../workflows/01-videos-airtable-heygen.json).
- [`02-audio-a-airtable.json`](../workflows/02-audio-a-airtable.json).

Guardalos y mantenelos sin publicar mientras completás la configuración. El archivo `agente ia videos.json` conserva el diseño inicial y no es el que tenés que importar.

## 3. Cargá y vinculá las credenciales

Creá cinco credenciales de tipo **Header Auth**. Los nombres de esta tabla ayudan a reconocerlas; lo importante es elegir la credencial correcta en cada nodo que la usa.

| Nombre sugerido | Nombre del encabezado | Valor que guardás en la credencial |
| --- | --- | --- |
| `Proyect One - Airtable` | `Authorization` | `Bearer ` seguido del Personal Access Token de Airtable. |
| `Proyect One - HeyGen` | `X-Api-Key` | Tu clave de API de HeyGen. |
| `Proyect One - Slack` | `Authorization` | `Bearer ` seguido del token del bot de Slack. |
| `Proyect One - Transcripcion` | `Authorization` | `Bearer ` seguido de tu clave de Groq. |
| `Proyect One - Webhook` | `X-Proyect-One-Key` | Un secreto propio para quien envía los audios. |

Los archivos usan referencias `CONFIGURAR_*` para que no se confundan con credenciales reales. Abrí los nodos HTTP y el nodo Webhook y seleccioná las credenciales de tu instancia. Crear una credencial con el mismo nombre no la vincula por sí solo.

Para Airtable, el token necesita leer y escribir registros y tener acceso a la base elegida. Para Slack, usá un bot con `chat:write` e invitalo a los canales donde enviará los avisos. Copiá el **ID** de cada canal, no el texto `#nombre-del-canal`; con IDs conocidos no hace falta agregar permisos para listar canales.

## 4. Completá el nodo Configuracion

Cada flujo tiene un nodo `Configuracion`. Abrilo y completá el objeto `cfg`. Los IDs y las opciones de trabajo van ahí; las claves siguen dentro de las credenciales.

Los dos flujos comparten `airtableBaseId` y `slackErrorsChannel`. El flujo de video usa `videosTableId` y `slackVideosChannel`; el de audio usa `audiosTableId` y `slackAudioChannel`. Usá IDs de tablas, base y canales de tu entorno de prueba.

Para video, configurá además:

- `avatarId` y `voiceId`: un avatar y una voz disponibles para tu cuenta de HeyGen.
- `resolution`: `1080p` por defecto; también se admite `720p`.
- `aspectRatio`: `auto` por defecto. También podés elegir `16:9`, `9:16`, `1:1`, `4:5` o `5:4`.
- `maxPolls`: hasta 60 consultas por defecto.
- `pollIntervalSeconds`: 15 segundos entre consultas por defecto.
- `maxRecordsPerRun`: `1` para empezar. Con `0`, se procesan todos los registros seleccionados después de leer todas las páginas.
- `generationEnabled`: empieza en `false`. Mantenelo así mientras trabajes con presupuesto cero. Cambialo a `true` únicamente después de revisar y autorizar el uso de créditos de la API de HeyGen.

El formato de salida es MP4; no se usa `FormatoVideo = MP4` como si fuera una resolución. El guion viene de `Descripcion`. `PromptVideo` se conserva en Airtable, pero no genera un guion nuevo.

El límite de registros controla cuántos se procesan, no cuántas páginas se leen al principio. La lectura de pendientes y videos en proceso recorre las páginas de Airtable antes de seleccionar el lote; tenelo en cuenta al estimar el consumo de llamadas de la cuenta.

Para audio, la configuración inicial usa:

- `transcriptionBaseUrl`: `https://api.groq.com/openai/v1`.
- `transcriptionModel`: `whisper-large-v3-turbo`.
- Un máximo de 20 MiB por archivo.

Las URLs de Airtable, HeyGen y Slack apuntan a sus APIs oficiales. `allowLocalMock` pertenece a las pruebas locales: dejalo en `false` cuando trabajes con cuentas reales. La alternativa compatible con OpenAI requiere cambiar tanto la URL/modelo como la credencial; no basta con poner una clave distinta.

## 5. Hacé una primera prueba de video

Dejá un solo registro de prueba con `Estado = Pendiente`. Completá su título y guion. Cuando las credenciales y el avatar estén listos y hayas autorizado el uso de créditos para esa prueba, habilitá `generationEnabled` y ejecutá el flujo manualmente. Si seguís con presupuesto cero, conservá la generación deshabilitada y usá las comprobaciones locales.

La ejecución marca el registro `En Proceso` antes de pedir el video. Cuando HeyGen devuelve su ID, lo guarda antes de consultar el resultado. Un registro con ID existente se reanuda consultando ese video: no se vuelve a crear.

Si se alcanza el límite de consultas, el registro conserva el estado `En Proceso` y el ID para otra ejecución. Si queda `En Proceso` sin ID, revisá el panel de HeyGen antes de cambiarlo a `Pendiente`; el servicio podría haber aceptado una solicitud cuya respuesta se perdió.

## 6. Probá el webhook de audio

Abrí el nodo Webhook y elegí **Listen for Test Event**. Copiá su Test URL. El endpoint recibe un `POST` multipart con:

- Un único archivo en el campo `audio`.
- `request_id`, de 8 a 128 caracteres: letras, números, guiones o guiones bajos.
- El encabezado `X-Proyect-One-Key` con el valor configurado en la credencial del Webhook.

El path del workflow es `proyect-one-audio-v1`. Usá la URL que muestre tu instancia; no copies una URL de ejemplo como si fuera la tuya.

En PowerShell, con la clave ya cargada por vos en `PROYECT_ONE_WEBHOOK_KEY` y la URL en `PROYECT_ONE_AUDIO_URL`:

```powershell
curl.exe --request POST "$env:PROYECT_ONE_AUDIO_URL" `
  --header "X-Proyect-One-Key: $env:PROYECT_ONE_WEBHOOK_KEY" `
  --form "audio=@C:\ruta\audio.mp3" `
  --form "request_id=audio-prueba-0001"
```

En una terminal POSIX, con esas mismas variables definidas localmente:

```sh
curl --request POST "$PROYECT_ONE_AUDIO_URL" \
  --header "X-Proyect-One-Key: $PROYECT_ONE_WEBHOOK_KEY" \
  --form 'audio=@/ruta/audio.mp3' \
  --form 'request_id=audio-prueba-0001'
```

Se admiten archivos `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav` y `webm`. La instancia de n8n o su proxy puede tener un límite de subida menor al del workflow; si rechaza el archivo antes de entrar al flujo, revisá ese límite o usá un archivo más pequeño.

La respuesta correcta incluye `ok`, `request_id`, `record_id`, `duplicate`, `transcription`, `title`, `notified` y `message`. Si el ID ya estaba guardado, `duplicate` es `true` y se devuelve el registro encontrado sin volver a transcribir. Un fallo de Slack puede dejar `notified = false` aunque el audio ya esté guardado.

El flujo devuelve `400` para una solicitud inválida, `413` si excede el tamaño, `415` para un formato no admitido, `422` si la transcripción supera el tamaño que guarda este flujo, `502` si no se pudo confirmar una operación externa y `503` si falta la configuración. Una autenticación rechazada se resuelve en el propio Webhook, antes de procesar el archivo. Revisá el mensaje de la respuesta antes de reintentar. El [seguimiento operativo](operacion.md) explica cómo recuperar una ejecución sin repetir trabajo ya hecho.

Cuando termines la prueba, publicá el workflow de audio y usá su Production URL. El procesamiento espera a que termine la transcripción y el guardado: un proxy o cliente con un timeout menor puede cortar la espera aunque la ejecución continúe.

## 7. Revisá la retención de datos

El audio permanece como binario gestionado por n8n durante la ejecución; no se escribe una ruta `/tmp` armada con el nombre enviado por el cliente. Los workflows deshabilitan el guardado habitual de datos de ejecución. Revisá también la configuración de almacenamiento y limpieza de tu instancia: el workflow no configura la retención global de n8n ni la de los proveedores.

## Antes de darlo por conectado

- Confirmá un video terminado con su ID y URL en el registro correcto.
- Confirmá una transcripción guardada con su `SolicitudID` y una respuesta del webhook.
- Revisá los avisos de éxito y de error en los canales configurados.
- Probá un reintento del mismo audio y una reanudación del mismo video.
- Verificá las opciones de retención y el texto de privacidad según el uso real.

Las comprobaciones locales están separadas de estas pruebas con cuentas reales. El [registro de validación](validacion.md) indica qué se pudo ejecutar y qué queda pendiente.
