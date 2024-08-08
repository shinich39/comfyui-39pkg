# comfyui-pkg39

Automation for generating image from image.  

## Features

- Create automation img2img flow with embedded workflow.  
- Quick inpainting.  

## Nodes  
Add node > pkg39 or Search "39"  

- Random: Shuffle connected inputs each queue.  
- Bind key: Add keybindings to textarea.  
- Load image: Load image in sequentially.
- Command: Control loaded image using javascript.   

## Usage

### Added menu to Save Image node and Preview Image node  
- Send to pkg39  

Selected image copied to "/ComfyUI/pkg39_images" directory.  

- Send to Load image  

Load selected image at the "Load image" node.  

### Load image node  
Enter dir_path and index to load image.  
Controls \(while selecting the Load image node\):  
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
The node can load the embedded workflow in loaded image by javascript.  
Copy and paste to textarea on commnad node and use it after customize.  

- Find node
```js
var srcNode1 = find("TITLE|TYPE"); // in virtual workflow
var srcNode2 = findLast("TITLE|TYPE"); // in virtual workflow
var dstNode = find(1); // in real workflow
```

- Load nodes  
```js
var srcSampler = SAMPLER;
var dstSampler = find(2); // KSampler node in real workflow
var replaceNodes = [1]; // Load Checkpoint node id in real workflow
load(srcSampler, dstSampler, "positive", replaceNodes);
load(srcSampler, dstSampler, "negative", replaceNodes);
load(srcSampler, dstSampler, "latent_image");
```

- Load widget values  
```js
var srcSampler = SAMPLER;
var dstSampler = find(2);
var widgetValues = get(srcSampler);
set(srcSampler, widgetValues);
set(dstSampler, { seed: SEED }); // random seed
```

- Stop after run 5 (In auto queue mode)  
```js
if (countQueues >= 5) { stop(); }
```

- Play sound at the end of generation
```js
sound();
```

- More methods are written in the commnad node.  

## References

- [was-node-suite-comfyui](https://github.com/WASasquatch/was-node-suite-comfyui)
- [comfyui-prompt-reader-node](https://github.com/receyuki/comfyui-prompt-reader-node)
- [notification sound](https://pixabay.com/sound-effects/duck-quack-112941/)
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- And default ComfyUI nodes...