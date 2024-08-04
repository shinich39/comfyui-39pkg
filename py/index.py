import os

from server import PromptServer
from aiohttp import web

from io import BytesIO
from urllib.parse import unquote

from PIL import Image

from .libs.random import Random
from .libs.image import LoadImage
from .libs.command import Command

@PromptServer.instance.routes.get("/shinich39/pkg39/image")
async def get_image(request):
  if "path" in request.rel_url.query:
    file_path = unquote(request.rel_url.query["path"])
    if os.path.isfile(file_path):
      filename = os.path.basename(file_path)
      with Image.open(file_path) as img:
        image_format = 'webp'
        quality = 90
        buffer = BytesIO()
        img.save(buffer, format=image_format, quality=quality)
        buffer.seek(0)

        return web.Response(body=buffer.read(), content_type=f'image/{image_format}',
          headers={"Content-Disposition": f"filename=\"{filename}\""})

  return web.Response(status=404)

@PromptServer.instance.routes.get("/shinich39/pkg39/sound")
async def get_sound(request):
  if "path" in request.rel_url.query:
    file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", unquote(request.rel_url.query["path"])))
    if os.path.isfile(file_path):
      filename = os.path.basename(file_path)
      with open(file_path, "rb") as fh:
        buffer = BytesIO(fh.read())
        return web.Response(body=buffer.read(), content_type='audio/mp3',
          headers={"Content-Disposition": f"filename=\"{filename}\""})

  return web.Response(status=404)

NODE_CLASS_MAPPINGS = {
  "Random39": Random,
  "LoadImage39": LoadImage,
  "Command39": Command,
}

NODE_DISPLAY_NAME_MAPPINGS = {
  "Random39": "Random",
  "LoadImage39": "Load image",
  "Command39": "Command",
}
