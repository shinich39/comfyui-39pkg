# comfyui-pkg39

This package has created for generate image from generated image and embedded workflow.  
Using this package requires a little understanding of javascript syntax.  

## Feature

- Select random node regardless of type.
- Fast save from "Preview Image" node.
- Load workflow from images in directory.
- Loop images in directory.
- Manipulate loaded workflow from image.
- Repeat same process when generating image and add some details.
- Start batch process with exactly the same process.
- Edit mask on the preview image with mouse control.
- Play notification sound each queue.

## Node list

- Random
- Load image
- Command

## Usage

### Add nodes  
Add node > pkg39 > ...  
Search "39"

### Random node  
Create a new output when connect input.  
Shuffle the connections after starting queue.  

### Send to pkg39  
After generate image, click the "Send to pkg39" button in context menu of "Preview Image" node.  
The image copied to "/ComfyUI/pkg39_images" directory.  

### Load image  
Default dir_path value is absolute path to pkg39_images.  
You can edit mask on preview image.  
Spin the wheel to change brush size after mouse over the preview image.  
When image loaded, import nodes from image metadata then place at right side of Load image node.  
The node applied only one command node that was created first.

### Command  
Commnad has default guide lines.  
You should create command node after create nodes to use.  
Copy and paste to command node and use it.  

- Full code of img2img and Hi-Res fix
```js
disable("Preview Image");
disable("Save Image");
var vaeEncode = create("VAEEncode");
var vaeDecode = findOneLast("VAE decode");
var save = create("SaveImage");
var sampler = findOne("KSampler");
var loadCKPT = findOne("Load Checkpoint");
vaeEncode.connectInput("vae", loadCKPT);
vaeEncode.connectOutput("LATENT", sampler);
vaeEncode.connectInput("pixels", MAIN);
save.connectInput("images", vaeDecode);
var [newUpscaler, newSampler] = sampler.hires(1.5);
newSampler.setValue("scheduler", "simple");
newSampler.setValue("denoise", 0.5);
newSampler.setValue("steps", 40);
```

- Set loaded image to LATENT
```js
// if VAE encode node exists in image workflow
var node = findOneById(1); // Load image
node.connectOutput("IMAGE", findOne("VAE encode"))
```

```js
// No exists VAE encode in image workflow
// create VAE encode in original workflow and connect IMAGE - pixels
var load_image = findOneById(1); // Load image
var vae_encode = findOneById(2); // VAE encode
vae_encode.connectInput("VAE", findOne("Load Checkpoint"));
vae_encode.connectOutput("LATENT", findOne("KSampler"));
```

- Disable all ending point image nodes
```js
// case 1
disable("Preview Image");

// case 2
find("Save Image").forEach(e => {
  if (e.isEnd) { e.disable() }
});
```

- Set specific checkpoint 
```js
var node = findOneById(1); // Load Checkpoint
node.connectOutputs("MODEL", find("KSampler"));
node.connectOutputs("CLIP", find("CLIPTextEncode"));
node.connectOutputs("VAE", find("VAE Decode"));
```

- Prevent stop by error message in auto queue mode
```js
ignore();
```

- Set error callback
```js
error = () => {
  // code here...
}
```

- Stop after run 5 (In auto queue mode)  
```js
if (countQueues > 5) { stop(); }
```

- Stop the loop after 1 try (In auto queue mode)  
```js
if (countLoops >= 1) { stop(); }
```

- Play sound each queue after exceeed 5 queues
```js
if (countQueues > 5) { sound(); }
```

- Load next image
```js
next();
```

## Update

- ...

## References

- [was-node-suite-comfyui](https://github.com/WASasquatch/was-node-suite-comfyui)
- [comfyui-prompt-reader-node](https://github.com/receyuki/comfyui-prompt-reader-node)
- [notification sound](https://pixabay.com/sound-effects/duck-quack-112941/)
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- And default ComfyUI nodes...