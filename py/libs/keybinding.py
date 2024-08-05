class Keybinding():
  def __init__(self):
    pass

  @classmethod
  def INPUT_TYPES(cls):
    return {
      "required": {
        "(": ("BOOLEAN", {"default": True}),
        "{": ("BOOLEAN", {"default": False}),
        "[": ("BOOLEAN", {"default": False}),
        "<": ("BOOLEAN", {"default": False}),
      },
    }
  
  CATEGORY = "pkg39"
  RETURN_TYPES = ()
  RETURN_NAMES = ()