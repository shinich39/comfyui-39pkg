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

def get_images_with_metadata(dir_path):
  image_list = []
  if os.path.isdir(dir_path):
    for file in os.listdir(dir_path):  
      # not image
      if not file.endswith(".png"):
        continue

      # mask
      if file.startswith("."):
        continue

      image_name, image_ext = os.path.splitext(file)
      image_path = Path(os.path.join(dir_path, file)).as_posix()
      draw_name = "." + image_name + "_d"
      draw_path = Path(os.path.join(dir_path, draw_name + ".png")).as_posix()
      mask_name = "." + image_name + "_m"
      mask_path = Path(os.path.join(dir_path, mask_name + ".png")).as_posix()

      with Image.open(image_path) as image:
        if isinstance(image, PngImageFile):
          is_draw_exists = os.path.exists(draw_path)
          is_mask_exists = os.path.exists(mask_path)
          width = image.width
          height = image.height
          info = image.info
          format = image.format
          image_list.append({
            "dir_path": dir_path,
            "original_path": image_path,
            "original_name": image_name,
            "draw_path": draw_path if is_draw_exists else None,
            "draw_name": draw_name if is_draw_exists else None,
            "mask_path": mask_path if is_mask_exists else None,
            "mask_name": mask_name if is_mask_exists else None,
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

    return web.Response(status=200)
  except Exception:
    print(traceback.format_exc())
    return web.Response(status=400)

@PromptServer.instance.routes.post("/shinich39/pkg39/edit_image")
async def edit_image(request):
  post = await request.post()
  draw_image = post.get("draw")
  mask_image = post.get("mask")
  original_path = post.get("path")
  dir_path = os.path.dirname(original_path)
  original_name = os.path.basename(original_path)
  image_name, image_ext = os.path.splitext(original_name)

  draw_name = "." + image_name + "_d"
  draw_path = os.path.join(dir_path, draw_name + ".png")
  mask_name = "." + image_name + "_m"
  mask_path = os.path.join(dir_path, mask_name + ".png")
  res_name = "." + image_name + "_r"
  res_path = os.path.join(dir_path, res_name + ".png")

  # save draw image
  draw_pil = Image.open(draw_image.file).convert("RGBA")
  draw_pil.save(draw_path, compress_level=4)
  
  # save mask image
  mask_pil = Image.open(mask_image.file).convert('RGBA')
  mask_pil.save(mask_path, compress_level=4)

  # create result image
  orig_pil = Image.open(original_path).convert("RGBA")

  # merge draw image
  orig_pil.paste(draw_pil, (0,0), draw_pil)

  # merge mask image
  mask_alpha = mask_pil.getchannel('A')
  orig_pil.putalpha(mask_alpha)
  orig_pil.save(res_path, compress_level=4)

  return web.json_response({
    "draw_name": draw_name,
    "draw_path": draw_path,
    "mask_name": mask_name,
    "mask_path": mask_path,
  })
  
@PromptServer.instance.routes.post("/shinich39/pkg39/clear_image")
async def clear_image(request):
  req = await request.json()
  original_path = req["path"]
  dir_path = os.path.dirname(original_path)
  original_name = os.path.basename(original_path)
  image_name, image_ext = os.path.splitext(original_name)

  draw_name = "." + image_name + "_d"
  draw_path = os.path.join(dir_path, draw_name + ".png")
  mask_name = "." + image_name + "_m"
  mask_path = os.path.join(dir_path, mask_name + ".png")
  res_name = "." + image_name + "_r"
  res_path = os.path.join(dir_path, res_name + ".png")

  if os.path.exists(draw_path):
    os.remove(draw_path)

  if os.path.exists(mask_path):
    os.remove(mask_path)

  if os.path.exists(res_path):
    os.remove(res_path)

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
        "dir_path": ("STRING", {"default": os.path.relpath(CACHE_DIR), "multiline": True}),
        "index":  ("INT", {"default": 0, "min": -1, "step": 1}),
        "mode": (["fixed", "increment", "decrement", "randomize",],),
        "filename": ("STRING", {"default": "",}),
      },
    }
  
  CATEGORY = "pkg39"
  FUNCTION = "exec"
  RETURN_TYPES = ("IMAGE", "MASK", "STRING")
  RETURN_NAMES = ("IMAGE", "MASK", "COMMAND")

  def exec(self, dir_path, index, mode, filename, **kwargs):
    orig_name = filename
    orig_path = os.path.join(dir_path, orig_name + ".png")
    res_name = "." + orig_name + "_r"
    res_path = os.path.join(dir_path, res_name + ".png")
    is_res_exists = os.path.exists(res_path)

    file_path = None
    if is_res_exists:
      file_path = res_path
    else:
      file_path = orig_path

    image = Image.open(file_path)
    img = ImageOps.exif_transpose(image)
    image = img.convert("RGB")
    image = np.array(image).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    if 'A' in img.getbands():
      mask = np.array(img.getchannel('A')).astype(np.float32) / 255.0
      mask = 1. - torch.from_numpy(mask)
    else:
      mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")

    return (image, mask.unsqueeze(0), filename, "pkg39")