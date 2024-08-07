- Inpaint batch 4

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
remove("RepeatImageBatch");
remove("RepeatLatentBatch");
removeOut();

var vaeEncode = create("VAEEncode");
var setLatentNoiseMask = create("SetLatentNoiseMask");
var latentBatch = create("RepeatLatentBatch");
var invertMask = create("InvertMask");
var imageBatch = create("RepeatImageBatch");
var imageComposite = create("ImageCompositeMasked");
var saveImage = create("SaveImage");
var ckpt = findOne("Load Checkpoint");
var vaeDecode = findOneLast("VAEDecode");
var sampler = findOneLast("KSampler");

vaeEncode.connectInput("pixels", MAIN);
vaeEncode.connectInput("vae", ckpt);

setLatentNoiseMask.connectInput("mask", MAIN);
setLatentNoiseMask.connectInput("samples", vaeEncode);

latentBatch.connectInput("samples", setLatentNoiseMask);
latentBatch.setValue("amount", 4);

sampler.connectInput("model", ckpt);
sampler.connectInput("latent", latentBatch);
sampler.setValue("seed", SEED); // random seed
sampler.setValue("steps", STEPS);
sampler.setValue("cfg", CFG);
// sampler.setValue("sampler_name", SAMPLER_NAME);
sampler.setValue("scheduler", SCHEDULER);
sampler.setValue("denoise", DENOISE);

invertMask.connectInput("mask", MAIN);

imageBatch.connectInput("image", MAIN);
imageBatch.setValue("amount", 4);

imageComposite.connectInput("mask", invertMask);
imageComposite.connectInput("source", imageBatch);
imageComposite.connectInput("destination", vaeDecode);

saveImage.connectInput("images", imageComposite);
saveImage.setValue("filename_prefix", IMAGE_NAME.split("_")[0]);
```