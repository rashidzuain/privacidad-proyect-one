# Primera prueba y seguimiento

Empezá con una tabla de prueba, un guion breve y un audio corto. Así podés revisar el recorrido completo antes de procesar más contenido. La generación de video y la transcripción usan las cuotas de las cuentas que conectes.

## Antes de ejecutar

- Confirmá que los identificadores de la base, las tablas y los canales correspondan al entorno de prueba.
- Revisá que el avatar y la voz estén disponibles para tu cuenta de HeyGen.
- Cargá las claves en las credenciales de n8n. Los JSON que se comparten no necesitan contenerlas.
- Dejá un solo registro pendiente para la primera prueba de video.
- Para probar audio, usá la URL de prueba que muestra el nodo Webhook mientras está escuchando. La URL de producción se usa cuando el workflow está publicado.

## Qué mirar en una prueba de video

La prueba está completa cuando podés relacionar un mismo registro de Airtable con su identificador de HeyGen, su URL final y el aviso de Slack. Guardá esos identificadores para revisar el recorrido, sin publicar claves ni datos que no quieras compartir.

Si el registro ya tiene `HeyGen_VideoID`, la recuperación debe consultar ese video. No hace falta pedir uno nuevo para volver a consultar su resultado. Una URL de HeyGen puede vencer: el identificador permite consultar el estado otra vez y obtener un enlace actualizado.

Si HeyGen aceptó el video pero falló el guardado de su ID, el aviso de error incluye el identificador recibido. Guardalo en `HeyGen_VideoID` antes de reanudar; no vuelvas a pedir la creación del mismo video para resolver ese guardado.

No ejecutes dos copias del flujo sobre la misma tabla al mismo tiempo. Leer un registro y después actualizarlo no equivale a reservarlo de forma atómica; esa carrera puede producir solicitudes duplicadas.

Las lecturas y actualizaciones tienen hasta tres intentos, separados por 1,5 segundos. Las solicitudes que crean videos, transcriben audio, crean el registro de audio o envían mensajes de Slack no se reintentan automáticamente: una respuesta perdida puede haber llegado después de que el servicio aceptó la operación.

El flujo espera un segundo antes de empezar cada registro para reducir las ráfagas de llamadas a Airtable. Eso no elimina el límite de la base ni el consumo de otras integraciones. Si Airtable devuelve `429`, detené el lote, esperá al menos 31 segundos y revisá la cuota de la cuenta antes de ejecutar otra vez. Los reintentos breves no resuelven ese bloqueo ni una cuota mensual agotada. Conservá los estados y los IDs guardados al retomar.

## Qué mirar en una prueba de audio

Verificá que el texto guardado coincida con el audio enviado y que la respuesta del webhook corresponda al registro creado. El título y la descripción se obtienen recortando el texto: no se redacta un resumen ni se corrigen las palabras del proveedor.

Antes de volver a mandar un archivo porque la conexión se cortó, revisá si ya se creó su registro en Airtable. Un error que ve el cliente no siempre significa que el servicio no haya procesado la solicitud.

## Si algo falla

| Dónde se ve el problema | Qué revisar primero |
| --- | --- |
| Autenticación o permisos | La credencial elegida en el nodo, sus permisos y el acceso a la base o canal que configuraste. |
| Airtable no encuentra una tabla o un campo | Los IDs de base y tabla, los nombres exactos de los campos y sus tipos. |
| HeyGen rechaza la creación | El avatar, la voz, el guion y las opciones de resolución y formato. |
| La creación de video queda en un resultado incierto | Revisá el panel de HeyGen y el registro de Airtable antes de volver a crear. Una respuesta perdida puede haber ocurrido después de que el servicio aceptó el trabajo. |
| El video sigue procesándose | Consultá el mismo identificador. No cambies el registro a `Pendiente` para forzar otro video. |
| Se guardó el resultado pero falló Slack | Revisá la credencial y el canal. Conservá el resultado ya generado; repetir la generación no arregla un aviso. |
| El webhook no recibe el audio | La URL elegida, el método POST, la autenticación y el nombre del campo del archivo que indica la guía de configuración. |

## Audio y datos de ejecución

La forma en que n8n conserva los archivos binarios y las ejecuciones depende de la instancia. Antes de usar audios reales, revisá en esa instancia el almacenamiento binario, el guardado de ejecuciones y su limpieza automática. Eliminar una ejecución y eliminar un registro en Airtable son operaciones distintas.

La página de privacidad del repositorio sigue pendiente de revisión. Antes de usarla para describir un servicio real, hay que confirmar qué datos se guardan, dónde se guardan y cómo se atienden las consultas sobre ellos.

## Qué cuenta como evidencia

- Una prueba local comprueba solamente las partes que esa prueba ejecuta.
- Importar un JSON en n8n comprueba que la instancia acepta el workflow; no demuestra que las cuentas y los permisos externos estén listos.
- Una simulación permite probar respuestas y fallos sin consumir los servicios reales.
- Para afirmar que la integración está funcionando con las cuentas de uso, hace falta ejecutar cada recorrido con esas cuentas y revisar sus resultados.

Cuando compartas un resultado, indicá cuál de estas comprobaciones hiciste. Un ejemplo inventado para explicar los campos no reemplaza una ejecución registrada.
