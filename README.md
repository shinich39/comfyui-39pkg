# comfyui-pkg39

Automation for generating image from image.  

## Features

- Create automation img2img flow with Any Custom nodes.  
- Quick inpainting.  

## Nodes  
Add node > pkg39  
Search "39"  

- Random: Shuffle connected inputs each queue.  
- Bind key: Add keybindings to textarea.  
- Load image: Load image with workflow.
- Command: Control loaded workflow using javascript.   

## Usage

### Added menu to Save Image node  
- Send to pkg39  

Selected image copied to "/ComfyUI/pkg39_images" directory.  

- Send to Load image  

Load selected image at the "Load image" node.  

### Load image node  
Enter dir_path and index to load image.  
When image loaded, import nodes from embedded workflow then place at right side of "Load image" node.  
Controls\(while selecting a Load image node\):  
- F5 or Ctrl + r: Reload images.  
- Left, Right: Change index.  
- -, =: Change canvas zoom.  
- Mouse left click: Add mask.  
- Mouse right click: Remove mask.  
- Ctrl + left click: Change brush color to selected pixel.  
- Shift + Mouse left click: Drawing.  
- Shift + Mouse right click: Remove drawing.  
- Mouse wheel scroll: Change brush size.  
- Shift + Mouse wheel scroll: Change brush size.  
- Mouse move while wheel click: Move canvas.  
- Mouse move while press space bar: Move canvas.  

### Command node  
Only one command node will be active.  
Command execute when starting each queue, change index, change command or load image.  
Copy and paste to commnad node and use it after customize.  

- Hi-Res fix images in directory  

Set mode to "increment" on Load image node.  
Set auto queue mode to "instant"  

```js
var SCALE_BY = 2;
var STEPS = 30;
var CFG = 8;
var SAMPLER_NAME = "euler";
var SCHEDULER = "simple";
var DENOISE = 0.5;

remove("EmptyLatentImage");
remove("PreviewImage");
remove("SaveImage");
removeOut();

var vaeEncode = create("VAEEncode");
var saveImage = create("SaveImage");
var vaeDecode = findOneLast("VAEDecode");
var sampler = findOne("KSampler");
var ckpt = findOne("Load Checkpoint");

vaeEncode.connectInput("pixels", MAIN);
vaeEncode.connectInput("vae", ckpt);

saveImage.connectInput("images", vaeDecode);
saveImage.setValue("filename_prefix", IMAGE_NAME);

// new sampler inherit values and connections from sampler
var [newUpscaler, newSampler] = sampler.hires(SCALE_BY);
newUpscaler.connectInput("samples", vaeEncode);
newSampler.setValue("seed", SEED); // random seed
newSampler.setValue("steps", STEPS);
newSampler.setValue("cfg", CFG);
newSampler.setValue("sampler_name", SAMPLER_NAME);
newSampler.setValue("scheduler", SCHEDULER);
newSampler.setValue("denoise", DENOISE);
sampler.remove();
```

- Single image loop inpaiting  

Set mode to "fixed" on Load image node.  

```js
var STEPS = 30;
var CFG = 8;
var SAMPLER_NAME = "euler";
var SCHEDULER = "normal";
var DENOISE = 0.7;

remove("EmptyLatentImage");
remove("PreviewImage");
remove("SaveImage");
remove("LatentUpscale");
remove("VAEEncode");
remove("SetLatentNoiseMask");
remove("InvertMask");
remove("ImageCompositeMasked");
removeOut();

var vaeEncode = create("VAEEncode");
var setLatentNoiseMask = create("SetLatentNoiseMask");
var invertMask = create("InvertMask");
var imageComposite = create("ImageCompositeMasked");
var saveImage = create("SaveImage");
var ckpt = findOne("Load Checkpoint");
var vaeDecode = findOneLast("VAEDecode");
var sampler = findOneLast("KSampler");

vaeEncode.connectInput("pixels", MAIN);
vaeEncode.connectInput("vae", ckpt);

setLatentNoiseMask.connectInput("mask", MAIN);
setLatentNoiseMask.connectInput("samples", vaeEncode);

sampler.connectInput("model", ckpt);
sampler.connectInput("latent", setLatentNoiseMask);
sampler.setValue("seed", SEED); // random seed
sampler.setValue("steps", STEPS);
sampler.setValue("cfg", CFG);
// sampler.setValue("sampler_name", SAMPLER_NAME);
sampler.setValue("scheduler", SCHEDULER);
sampler.setValue("denoise", DENOISE);

invertMask.connectInput("mask", MAIN);

imageComposite.connectInput("mask", invertMask);
imageComposite.connectInput("source", MAIN);
imageComposite.connectInput("destination", vaeDecode);

saveImage.connectInput("images", imageComposite);
saveImage.setValue("filename_prefix", IMAGE_NAME.split("_")[0]);

// load inpainted image
onEnd = async (images) => await loadFile(images[0]);
```

- Stop after run 5 (In auto queue mode)  
```js
if (countQueues >= 5) { stop(); }
```

- Play sound at the start generation
```js
sound();
```

- Play sound at the end of generation
```js
onEnd = () => { sound(); }
```


More methods are written in the commnad node.  


## References

- [was-node-suite-comfyui](https://github.com/WASasquatch/was-node-suite-comfyui)
- [comfyui-prompt-reader-node](https://github.com/receyuki/comfyui-prompt-reader-node)
- [notification sound](https://pixabay.com/sound-effects/duck-quack-112941/)
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- And default ComfyUI nodes...