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