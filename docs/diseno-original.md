# Del diseño a los flujos

El archivo [`agente ia videos.json`](../agente%20ia%20videos.json) conserva la primera descripción del proyecto. Sirve para leer la idea y compararla con la implementación. Su estructura (`workflow_name`, `flows`, `node_type` y `configuration`) es descriptiva; ese archivo no se importa directamente en n8n.

## Qué se busca resolver

El proyecto plantea dos tareas independientes:

1. Leer contenido pendiente en Airtable, pedir un video a HeyGen, registrar su resultado y avisar por Slack.
2. Recibir audio mediante un webhook, transcribirlo, guardar el texto y algunos campos derivados en Airtable y avisar por Slack.

La transcripción no inicia la generación de un video. Tampoco se descarga un video para extraerle el audio. Esas conexiones no forman parte del diseño original y no se agregan como si ya existieran.

## Video: datos y recorrido

La entrada prevista es un registro de Airtable con `Titulo`, `Descripcion`, `PromptVideo`, `FormatoVideo` y `Estado`. La selección inicial se hace sobre registros cuyo `Estado` sea `Pendiente`.

El diseño envía el título y la descripción a HeyGen con una voz y un avatar configurables. Después guarda `HeyGen_VideoID`, cambia `Estado` a `En Proceso`, espera, consulta el resultado y escribe `URL_VideoGenerado`. Cuando hay un video terminado, el estado pasa a `Completado` y se envía un aviso al canal de videos. Las solicitudes a HeyGen también tienen avisos de error.

`PromptVideo` se conserva como parte de los datos. En el diseño, el texto que HeyGen recibe como guion sale de `Descripcion`; no se usa `PromptVideo` para generar un nuevo guion.

## Audio: datos y recorrido

El webhook recibe un archivo de audio y lo entrega a un proveedor de transcripción. La salida prevista incluye estos campos:

- `Titulo`: los primeros 50 caracteres del texto, con puntos suspensivos cuando el texto es más largo.
- `Descripcion`: los primeros 200 caracteres, con el mismo criterio.
- `PromptVideo`: un texto armado a partir del título.
- `FormatoVideo`: `MP4`.
- `TranscripcionOriginal`: el texto completo.
- `FechaCreacion`: la fecha de procesamiento.

El título y la descripción son recortes, no resúmenes redactados por un modelo. El flujo guarda los datos en una tabla de audios y avisa por Slack si termina o encuentra un error.

## Puntos que el diseño dejaba abiertos

- Elegir y configurar el proveedor de transcripción.
- Construir exportaciones nativas de n8n y verificar sus conexiones.
- Ajustar los endpoints, los cuerpos de las solicitudes y la lectura de las respuestas de cada API.
- Conservar el identificador del registro original de Airtable cuando otros nodos devuelven sus propias respuestas.
- Reemplazar la espera fija por una consulta de estado con límite de intentos y tiempo.
- Evitar pedir un video nuevo cuando el registro ya tiene un identificador de HeyGen.
- Definir el manejo del audio binario, la respuesta del webhook y la retención de los datos de ejecución.
- Separar las claves del JSON que se comparte.
- Comprobar una ejecución completa con datos de prueba y, por separado, con cuentas reales.

Los marcadores `YOUR_..._HERE` del archivo original no son credenciales configuradas. Las guías de la implementación deben indicar dónde cargar las credenciales y qué falta verificar en una instancia real.

## Ajustes al llevarlo a n8n

La versión ejecutable mantiene los dos recorridos y agrega controles que la descripción inicial no definía:

- HeyGen usa la API v3. La resolución y la proporción de pantalla se configuran aparte del formato MP4.
- El registro de video se marca `En Proceso` antes de solicitar la creación. Si queda sin ID, requiere revisión manual antes de volver a generar.
- La consulta de estado tiene un límite. Un video con ID guardado puede retomarse en una ejecución posterior.
- El audio se mantiene como binario gestionado por n8n durante la ejecución, en lugar de escribir una ruta construida con el nombre del archivo recibido.
- El webhook requiere autenticación y un `request_id`. El campo `SolicitudID` en Airtable permite reconocer envíos ya guardados, con las limitaciones de concurrencia explicadas en la guía de operación.
- El proveedor inicial de transcripción es Groq con `whisper-large-v3-turbo`.
- Los recortes de título y descripción tienen un máximo de 50 y 200 caracteres, incluidos los puntos suspensivos. El diseño inicial agregaba esos puntos después del recorte y podía superar esos límites.
- Los JSON compartidos contienen referencias de credenciales, no claves. Las claves se vinculan en la instancia de n8n.

La disponibilidad y el resultado de las comprobaciones se detallan en el [registro de validación](validacion.md). La prueba con cuentas reales es una comprobación aparte.

## Ejemplo de lectura

Un registro de prueba podría tener `Titulo = "Tres ideas para organizar el estudio"`, un guion breve en `Descripcion` y `Estado = "Pendiente"`. El flujo de video usaría esos datos para solicitar un video y guardar su identificador y URL.

Por separado, el webhook de audio podría recibir una grabación y guardar su texto en `TranscripcionOriginal`, junto con el título, la descripción y el prompt derivados. Este ejemplo explica los datos; no demuestra por sí mismo una ejecución con servicios reales.

## Página de privacidad

[`index.html`](../index.html) contiene un texto de privacidad pendiente de revisión. Todavía no está confirmado que sus afirmaciones describan una aplicación real en funcionamiento. El documento se conserva con ese estado visible; la implementación técnica no valida automáticamente su contenido.

Podés abrirlo en un navegador o visitar la [página publicada](https://rashidzuain.github.io/privacidad-proyect-one/).
