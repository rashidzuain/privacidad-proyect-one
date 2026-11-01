# Preparar Airtable

Usá una base con dos tablas: una para videos y otra para audios. Podés llamarlas `Videos` y `Audios`; el workflow se conecta usando sus identificadores. Los nombres de los campos de abajo sí deben coincidir, incluidas las mayúsculas.

Los CSV [`videos.csv`](../examples/videos.csv) y [`audios.csv`](../examples/audios.csv) sirven como punto de partida para los encabezados. El de videos incluye una fila hipotética para probar el recorrido; no es el resultado de una ejecución real. Después de importar, revisá los tipos de campo de las tablas de abajo: el CSV no configura por sí solo la selección de estados, las fechas ni los campos URL.

## Tabla de videos

| Campo | Tipo en Airtable | Para qué se usa |
| --- | --- | --- |
| `Titulo` | Texto de una línea; puede ser el campo principal | Título del video y del aviso. |
| `Descripcion` | Texto largo | Guion que se envía a HeyGen. |
| `PromptVideo` | Texto largo | Conserva el prompt del diseño original; no reemplaza el guion de `Descripcion`. |
| `FormatoVideo` | Texto de una línea | Formato de archivo; usá `MP4` para la primera prueba. |
| `Estado` | Selección única | Creá las opciones `Pendiente`, `En Proceso`, `Completado` y `Error`. |
| `HeyGen_VideoID` | Texto de una línea | Identificador del trabajo de HeyGen. Permite volver a consultar el mismo video. |
| `URL_VideoGenerado` | URL | Enlace que devuelve HeyGen cuando termina el video. |

Para la primera prueba, cargá un solo registro con un título, un guion breve, `FormatoVideo = MP4` y `Estado = Pendiente`. Dejá vacíos el identificador de HeyGen y la URL final: los completa el flujo.

`MP4` no es una resolución. La resolución y la proporción de pantalla se configuran aparte en n8n.

## Tabla de audios

| Campo | Tipo en Airtable | Para qué se usa |
| --- | --- | --- |
| `Titulo` | Texto de una línea; puede ser el campo principal | Inicio del texto transcrito. |
| `Descripcion` | Texto largo | Un recorte más largo de esa transcripción. |
| `PromptVideo` | Texto largo | Prompt armado a partir del título. |
| `FormatoVideo` | Texto de una línea | Conserva `MP4` como en el diseño inicial. |
| `TranscripcionOriginal` | Texto largo | Texto completo devuelto por el proveedor. |
| `FechaCreacion` | Fecha, con hora habilitada | Momento de procesamiento en formato ISO. |
| `SolicitudID` | Texto de una línea | Identificador que enviás con el audio para reconocer solicitudes ya guardadas. |

`SolicitudID` es un agregado de la implementación. Al repetir una solicitud ya guardada con el mismo `request_id`, el flujo puede reconocerla antes de volver a transcribir. Usá un ID nuevo para otro audio; conservá el mismo cuando reintentás el envío del mismo archivo.

Esta comprobación evita duplicados en reintentos secuenciales. Airtable no aplica una restricción de unicidad sobre este campo: dos solicitudes simultáneas todavía pueden competir. No envíes el mismo audio en paralelo.

## Acceso de n8n

Creá un Personal Access Token con `data.records:read` y `data.records:write`, y dale acceso a la base usada por el proyecto. Las tablas se preparan desde Airtable; el workflow no crea ni cambia el esquema.

En n8n, guardá el token dentro de la credencial `Proyect One - Airtable`, de tipo **Header Auth**:

- Nombre del encabezado: `Authorization`.
- Valor: `Bearer ` seguido de tu token.

Después elegí esa credencial en todos los nodos HTTP que llaman a Airtable. No alcanza con que exista una credencial con ese nombre: los nodos importados necesitan quedar vinculados a la credencial de tu instancia.

Los identificadores de base y tabla se copian en el nodo `Configuracion` de cada flujo. La guía de [puesta en marcha](puesta-en-marcha.md) explica el resto de las conexiones.

Si aparece un error de permisos, revisá tanto los scopes del token como el acceso a esa base. El token tampoco puede dar permisos que tu cuenta no tiene. La [guía oficial de PATs de Airtable](https://support.airtable.com/articles/9934989703-creating-personal-access-tokens) explica esa relación.
