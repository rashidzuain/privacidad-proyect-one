# Política de privacidad y flujo de automatización

Este repositorio contiene:

- `index.html` – Una página HTML con la **política de privacidad** de la aplicación. Describe los datos que recopilamos, cómo los utilizamos y cómo protegemos la privacidad de los usuarios. Puedes personalizar el contenido según tu proyecto y alojarlo con GitHub Pages para que sea accesible públicamente.

- `agente ia videos.json` – Un **flujo de trabajo para n8n** (formato JSON). Este workflow automatiza la creación de vídeos utilizando HeyGen y la posterior transcripción de audio. El flujo ejecuta los siguientes pasos:
  1. Genera un vídeo con HeyGen a partir de un texto o script.
  2. Descarga el vídeo y extrae el audio.
  3. Transcribe el audio a texto.
  4. Devuelve la transcripción junto con el enlace al vídeo generado.

Para utilizar el flujo, importa el archivo JSON en n8n, configura tus credenciales de HeyGen y define los parámetros necesarios (por ejemplo, texto del guión, idioma y opciones del avatar). A continuación, ejecuta el workflow para crear un vídeo personalizado y obtener la transcripción del audio automáticamente.

## Cómo contribuir

Si deseas mejorar la política de privacidad o el flujo de automatización, siéntete libre de abrir issues o enviar pull requests. Agradecemos cualquier sugerencia o contribución que ayude a mejorar este proyecto.
