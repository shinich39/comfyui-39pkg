from server import PromptServer
from aiohttp import web

import numpy as np
import torch
import os
import inspect
import json
import time
import shutil
import traceback

from pathlib import Path

from server import PromptServer
from aiohttp import web

from PIL import ImageFile, Image, ImageOps
from PIL.PngImagePlugin import PngInfo, PngImageFile

# fix
ImageFile.LOAD_TRUNCATED_IMAGES = True

__DIRNAME = os.path.dirname(inspect.getfile(PromptServer))
CACHE_DIR = os.path.abspath(os.path.join(__DIRNAME, "pkg39_images"))
MAX_RESOLUTION = 16384
VALID_EXTENSIONS = [".png"]

def chk_dir(p):
  if os.path.exists(p) == False:
    os.makedirs(p, exist_ok=True)

def chk_json(p):
  if os.path.exists(p) == False:
    with open(p, "w") as file:
      json.dump({}, file, indent=2)

def get_now():
  return round(time.time() * 1000)

def get_images(dir_path):
  image_list = []
  if os.path.isdir(dir_path):
    for file in os.listdir(dir_path):
      name, ext = os.path.splitext(file)
      # not png
      if ext.lower() not in VALID_EXTENSIONS:
        continue
      # mask
      if file.startswith("."):
        continue
      # add full path
      image_path = Path(os.path.join(dir_path, file)).as_posix()
      mask_path = Path(os.path.join(dir_path, "." + file)).as_posix()
      image_list.append({
        "image_path": image_path,
        "image_name": name,
        "mask_path": mask_path if os.path.exists(mask_path) else None,
        "mask_name": "." + name,
      })
  return image_list

def get_images_with_metadata(dir_path):
  image_list = []
  if os.path.isdir(dir_path):
    for file in os.listdir(dir_path):      
      # mask
      if file.startswith("."):
        continue

      image_name, image_ext = os.path.splitext(file)
      image_path = Path(os.path.join(dir_path, file)).as_posix()
      mask_name = "." + file
      mask_path = Path(os.path.join(dir_path, mask_name)).as_posix()

      with Image.open(image_path) as image:
        if isinstance(image, PngImageFile):
          width = image.width
          height = image.height
          info = image.info
          format = image.format
          image_list.append({
            "image_path": image_path,
            "image_name": image_name,
            "mask_path": mask_path if os.path.exists(mask_path) else None,
            "mask_name": mask_name,
            "width": width,
            "height": height,
            "info": info,
            "format": format,
          })
  return image_list

@PromptServer.instance.routes.post("/shinich39/pkg39/load_images")
async def load_images(request):
  try:
    req = await request.json()
    file_path = req["path"]
  
    chk_dir(CACHE_DIR)

    image_list = get_images_with_metadata(file_path)
    return web.json_response(image_list)
  except Exception:
    print(traceback.format_exc())
    return web.Response(status=400)

@PromptServer.instance.routes.post("/shinich39/pkg39/save_image")
async def save_image(request):
  try:
    req = await request.json()
    src_path = req["path"]
    src_name, src_ext = os.path.splitext(src_path)
    dst_name = f"{str(get_now())}{src_ext}"
    dst_path = os.path.join(CACHE_DIR, dst_name)

    chk_dir(CACHE_DIR)

    shutil.copyfile(src_path, dst_path)

    image_list = get_images(CACHE_DIR)

    return web.json_response(image_list)
  except Exception:
    print(traceback.format_exc())
    return web.Response(status=400)
  
@PromptServer.instance.routes.post("/shinich39/pkg39/save_mask_image")
async def save_mask_image(request):
  post = await request.post()
  mask_image = post.get("image")
  original_path = post.get("path")
  dir_path = os.path.dirname(original_path)
  original_name = os.path.basename(original_path)
  mask_name = "." + original_name
  mask_path = os.path.join(dir_path, mask_name)

  if os.path.isfile(original_path):
    with Image.open(original_path) as original_pil:
      metadata = PngInfo()
      if hasattr(original_pil,'text'):
        for key in original_pil.text:
          metadata.add_text(key, original_pil.text[key])
      original_pil = original_pil.convert('RGBA')
      mask_pil = Image.open(mask_image.file).convert('RGBA')

      # alpha copy
      new_alpha = mask_pil.getchannel('A')
      original_pil.putalpha(new_alpha)
      original_pil.save(mask_path, compress_level=4, pnginfo=metadata)

    return web.json_response({ "mask_path": mask_path })
  
@PromptServer.instance.routes.post("/shinich39/pkg39/remove_mask_image")
async def remove_mask_image(request):
  req = await request.json()
  original_path = req["path"]
  dir_path = os.path.dirname(original_path)
  original_name = os.path.basename(original_path)
  mask_name = "." + original_name
  mask_path = os.path.join(dir_path, mask_name)

  if os.path.exists(mask_path):
    os.remove(mask_path)

  return web.Response(status=200)

class LoadImage():
  def __init__(self):
    pass

  # prevent starting cached queue
  @classmethod
  def IS_CHANGED(s):
    return None

  @classmethod
  def INPUT_TYPES(cls):
    return {
      "required": {
        "dir_path": ("STRING", {"default": CACHE_DIR, "multiline": True}),
        "index":  ("INT", {"default": 0, "min": -1, "step": 1}),
        "mode": (["fixed", "increment", "decrement", "randomize",],),
        "filename": ("STRING", {"default": "",}),
      },
    }
  
  CATEGORY = "pkg39"
  FUNCTION = "exec"
  RETURN_TYPES = ("IMAGE", "MASK", "STRING",)
  RETURN_NAMES = ("IMAGE", "MASK", "FILENAME",)

  def exec(self, dir_path, index, mode, filename, **kwargs):
    image_list = get_images(dir_path)
    image_path = image_list[index]["image_path"]
    mask_path = image_list[index]["mask_path"]

    image = Image.open(mask_path if mask_path else image_path)
    img = ImageOps.exif_transpose(image)
    image = img.convert("RGB")
    image = np.array(image).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    if 'A' in img.getbands():
      mask = np.array(img.getchannel('A')).astype(np.float32) / 255.0
      mask = 1. - torch.from_numpy(mask)
    else:
      mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")

    return (image, mask.unsqueeze(0), filename,)
  
  
class Command():
  def __init__(self):
    pass

  # prevent starting cached queue
  @classmethod
  def IS_CHANGED(s):
    return None

  @classmethod
  def INPUT_TYPES(cls):
    return {
      "required": {
        "command": ("STRING", {"default": "", "multiline": True}),
      },
    }
  
  CATEGORY = "pkg39"
  RETURN_TYPES = ()
  RETURN_NAMES = ()