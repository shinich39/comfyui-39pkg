"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { initMaskEditor } from "./mask-editor.js";
import * as util from "./util.min.js";
import {
  getImageURL,
  isLoadImageNode, 
  renderCanvas,
  selectNode,
} from "./pkg39-utils.js";

function initLoadImageNode() {
  try {
    const self = this;

    // parent node static methods
    this.pkg39 = {
      isInitialized: false,
      countQueues: 0,
      countLoops: 0,
      countErrors: 0,
      loadedImages: [],
      selectedImage: null,
      selectedIndex: -1,
      loadedImagePath: null,
      state: {},
    };

    // this.onSelected = (e) => this.setDirtyCanvas(true, true);
    this.onKeyDown = (e) => keyDownEvent.apply(this, [e]);

    this.pkg39.init = (function() {
      const self = this;
      if (this.widgets) {
        this.pkg39.DIR_PATH = this.widgets.find(e => e.name === "dir_path");
        this.pkg39.INDEX = this.widgets.find(e => e.name === "index");
        this.pkg39.MODE = this.widgets.find(e => e.name === "mode");
        this.pkg39.FILENAME = this.widgets.find(e => e.name === "filename");

        if (!this.pkg39.MASK) {
          this.pkg39.MASK = initMaskEditor.apply(this);

          // add mask control widget
          const clearWidget = this.addWidget("button", "Clear", null, () => {}, {
            serialize: false,
          });

          clearWidget.computeSize = () => [0, 26];
          clearWidget.serializeValue = () => undefined;
          clearWidget.callback = function() {
            self.pkg39.MASK.clearEvent();
          }
        }

        if (!this.pkg39.DIR_PATH) {
          throw new Error("dir_path widget not found.");
        }
        if (!this.pkg39.INDEX) {
          throw new Error("index widget not found.");
        }
        if (!this.pkg39.MODE) {
          throw new Error("index widget not found.");
        }
        if (!this.pkg39.FILENAME) {
          throw new Error("filename widget not found.");
        }
        if (!this.pkg39.MASK) {
          throw new Error("maskeditor widget not found.");
        }

        this.pkg39.isInitialized = true;
      } else {
        throw new Error("widgets not found.");
      }
    }).bind(this);

    this.pkg39.getIndex = (function(idx) {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
        let i = typeof idx === "number" ? idx : this.pkg39.INDEX.value;
        const min = 0;
        const max = this.pkg39.loadedImages?.length || 0;
        if (i < min) {
          i = max + i;
        } else if (max && i >= max) {
          i = i % max;
        }
        return i;
      } catch(err) {
        console.error(err);
        return 0;
      }
    }).bind(this);

    this.pkg39.loadImageByPath = (async function(filePath) {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      if (!filePath || filePath.trim() == "") {
        return;
      }

      filePath = filePath.replace(/[\\\/]+/g, "/");
      let dirPath = filePath.replace(/\/[^\/]+$/, "/");
      let basename = filePath.replace(dirPath, "");
      let filename = basename.replace(/.[^.]+$/, "");

      if (this.pkg39.DIR_PATH.value === dirPath && this.pkg39.FILENAME.value === filename) {
        throw new Error(`Image already loaded: ${dirPath}/${filename}`);
      }

      this.pkg39.resetCounter();
      await this.pkg39.updateDirPath(dirPath);
      await this.pkg39.loadImages();

      let idx = this.pkg39.loadedImages.findIndex(e => {
        return e.origName === filename;
      });

      if (idx === -1) {
        idx = 0;
      }

      this.pkg39.updateIndex(idx);
      this.pkg39.clearImage();
      this.pkg39.selectImage();
      this.pkg39.renderImage();
      await this.pkg39.executeCommands("changeIndex");
      selectNode(this);
    }).bind(this);

    this.pkg39.clearImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      const w = this.pkg39.MASK;
      w.element.style.width = this.size[0] - 32;
      w.element.style.height = this.size[0] - 32;
      w.origImgLoaded = false;
      w.drawImgLoaded = false;
      w.maskImgLoaded = false;
      w.origCtx.clearRect(0,0,w.origCanvas.width,w.origCanvas.height);
      w.drawCtx.clearRect(0,0,w.drawCanvas.width,w.drawCanvas.height);
      w.maskCtx.clearRect(0,0,w.maskCanvas.width,w.maskCanvas.height);
      w.origImg.src = "";
      w.drawImg.src = "";
      w.maskImg.src = "";
    }).bind(this);

    this.pkg39.selectImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      let i = this.pkg39.getIndex();
      this.pkg39.selectedIndex = i;
      this.pkg39.selectedImage = this.pkg39.loadedImages[i];
      if (!this.pkg39.selectedImage) {
        this.pkg39.FILENAME.prevValue = "NO IMAGE";
        this.pkg39.FILENAME.value = "NO IMAGE";
        throw new Error(`No image in ${this.pkg39.DIR_PATH.value}`);
      }
      this.pkg39.FILENAME.prevValue = this.pkg39.selectedImage.origName;
      this.pkg39.FILENAME.value = this.pkg39.selectedImage.origName;
    }).bind(this);

    this.pkg39.renderImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      if (!this.pkg39.selectedImage) {
        return;
      }
      try {
        const { origPath, drawPath, maskPath, } = this.pkg39.selectedImage;
        this.pkg39.MASK.origImg.src = getImageURL(origPath);
        this.pkg39.MASK.drawImg.src = drawPath ? getImageURL(drawPath) : "";
        this.pkg39.MASK.maskImg.src = maskPath ? getImageURL(maskPath) : "";
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.executeCommands = (async function(type) {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      if (!this.pkg39.selectedImage) {
        return;
      }
      let { selectedImage, selectedIndex } = this.pkg39;
      if (!selectedImage || !selectedImage.workflow) {
        return;
      }
      const nodes = this.pkg39.getCommandNodes();
      for (const node of nodes) {
        if (node.pkg39?.render) {
          node.pkg39.clear();
          await node.pkg39.render(type);
        }
      }
      renderCanvas();
    }).bind(this);

    this.pkg39.loadImages = (async function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }

        // clear loaded images
        this.pkg39.loadedImages = [];
  
        // get images in directory
        let d = this.pkg39.DIR_PATH.value;
        if (d && d.trim() !== "") {
          const images = await loadImages(d);
          for (const image of images) {
            try {
              const workflow = JSON.parse(image.info.workflow);
              const prompt = JSON.parse(image.info.prompt);
              this.pkg39.loadedImages.push({
                origPath: image["original_path"],
                origName: image["original_name"],
                drawPath: image["draw_path"],
                drawName: image["draw_name"],
                maskPath: image["mask_path"],
                maskName: image["mask_name"],
                width: image.width,
                height: image.height,
                format: image.format,
                workflow,
                prompt,
              });
            } catch(err) {
              console.error(err);
            }
          }
        }
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.updateDirPath = (function(str) {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
        this.pkg39.DIR_PATH.isCallbackEnabled = false; // prevent callback
        this.pkg39.DIR_PATH.prevValue = str;
        this.pkg39.DIR_PATH.value = str;
        this.pkg39.DIR_PATH.isCallbackEnabled = true;
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.updateIndex = (function(idx) {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
        this.pkg39.INDEX.isCallbackEnabled = false; // prevent callback

        let isFixed = typeof idx === "number";
        let images = this.pkg39.loadedImages;
        let m = this.pkg39.MODE.value;

        if (!isFixed) {
          idx = this.pkg39.getIndex();
          if (m === "increment") {
            idx += 1;
          } else if (m === "decrement") {
            idx -= 1;
          } else if (m === "randomize") {
            idx = Math.floor(util.random(0, images.length));
          }
        }

        let clampedIdx = this.pkg39.getIndex(idx);

        this.pkg39.INDEX.value = Math.round(clampedIdx);

        // increase counts
        if (!isFixed) {
          this.pkg39.countQueues += 1;
          if (m === "increment" && clampedIdx < idx) {
            this.pkg39.countLoops += 1;
          } else if (m === "decrement" && clampedIdx > idx) {
            this.pkg39.countLoops += 1;
          }
        }

        this.pkg39.INDEX.isCallbackEnabled = true;
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.resetCounter = (function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }

        // reset
        this.pkg39.countQueues = 0;
        this.pkg39.countLoops = 0;
        this.pkg39.countErrors = 0;
        this.pkg39.state = {};
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.getCommandNodes = (function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
        if (!app.graph.links) {
          return [];
        }

        const output = this.outputs.find(e => e.name === "COMMAND");
        const outputLinks = output.links;
        const links = app.graph.links.filter(e => e && outputLinks.indexOf(e.id) > -1);
        const nodes = app.graph._nodes.filter(e => e && !!links.find(l => l.target_id === e.id));
        return nodes;
      } catch(err) {
        console.error(err);
        return [];
      }
    }).bind(this);

    // create widgets
    this.pkg39.init();

    const dpWidget = this.pkg39.DIR_PATH;
    const idxWidget = this.pkg39.INDEX;
    const fnWidget = this.pkg39.FILENAME;
    const modeWidget = this.pkg39.MODE;
    const maskWidget = this.pkg39.MASK;

    dpWidget.isCallbackEnabled = false;
    dpWidget.options.getMinHeight = () => 64;
    dpWidget.options.getMaxHeight = () => 64;
    dpWidget.callback = async function(currValue) {
      if (!this.isCallbackEnabled) {
        return;
      }
      if (this.prevValue !== currValue) {
        this.prevValue = currValue;
        self.pkg39.resetCounter();
        await self.pkg39.loadImages();
        self.pkg39.updateIndex(0);
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        await self.pkg39.executeCommands("changeDirPath");
        selectNode(self);
      }
    }

    fnWidget.callback = function(currValue) {
      if (this.prevValue !== currValue) {
        this.value = this.prevValue;
        alert("You can not change filename.");
      }
    }

    idxWidget.isCallbackEnabled = false;
    idxWidget.timer = null;
    idxWidget.callback = function(v) {
      if (!this.isCallbackEnabled) {
        return;
      }
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(async () => {
        self.pkg39.resetCounter();
        self.pkg39.updateIndex(self.pkg39.getIndex());
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        await self.pkg39.executeCommands("changeIndex");
        selectNode(self);
      }, 256);
    }
  } catch(err) {
    console.error(err);
  }
}

async function generatedHandler({ detail }) {
  // detail => String: NodeId
  if (detail) {
    return;
  }

  // detail => null: End of generation
  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      const countImages = node.pkg39.loadedImages.length;
      const prevIndex = node.pkg39.getIndex();
      node.pkg39.updateIndex();
      const currIndex = node.pkg39.getIndex();
      if (prevIndex !== currIndex && countImages > 0) {
        node.pkg39.clearImage();
        node.pkg39.selectImage();
        node.pkg39.renderImage();
      }
      await node.pkg39.executeCommands("executed");
    }
  }
}

async function loadImages(dirPath) {
  const response = await api.fetchApi(`/shinich39/pkg39/load_images`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ path: dirPath }),
  });

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  const data = await response.json();

  return data;
}

async function keyDownEvent(e) {
  const { key, ctrlKey, metaKey, shiftKey } = e;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    this.pkg39.resetCounter();
    if (key === "ArrowLeft") {
      this.pkg39.updateIndex(this.pkg39.INDEX.value - 1);
    } else {
      this.pkg39.updateIndex(this.pkg39.INDEX.value + 1);
    }
    this.pkg39.clearImage();
    this.pkg39.selectImage();
    this.pkg39.renderImage();
    await this.pkg39.executeCommands("changeIndex");
    selectNode(this);
  } else if ((key === "r" && (ctrlKey || metaKey)) || key === "F5") {
    e.preventDefault();
    e.stopPropagation();
    this.pkg39.resetCounter();
    await this.pkg39.loadImages();
    this.pkg39.updateIndex(this.pkg39.getIndex());
    this.pkg39.clearImage();
    this.pkg39.selectImage();
    this.pkg39.renderImage();
    await this.pkg39.executeCommands("refresh");
    selectNode(this);
  } 
}

// api.addEventListener("promptQueued", () => {});
// api.addEventListener("executed", () => {});
api.addEventListener("executing", generatedHandler);

app.registerExtension({
	name: "shinich39.pkg39.image",
  setup() {
    // ...
  },
  async afterConfigureGraph(missingNodeTypes) {
    for (const node of app.graph._nodes) {
      if (isLoadImageNode(node)) {
        node.pkg39.resetCounter();
        await node.pkg39.loadImages();
        // node.pkg39.updateIndex(node.pkg39.getIndex());
        node.pkg39.clearImage();
        node.pkg39.selectImage();
        node.pkg39.renderImage();
        await node.pkg39.executeCommands("initialize");

        node.pkg39.DIR_PATH.isCallbackEnabled = true;
        node.pkg39.INDEX.isCallbackEnabled = true;

        // bug fix first run after refreshing
        node.pkg39.DIR_PATH.prevValue = node.pkg39.DIR_PATH.value; 
        node.pkg39.FILENAME.prevValue = node.pkg39.FILENAME.value;
      }
    }
	},
  nodeCreated(node) {
    if (isLoadImageNode(node)) {
      initLoadImageNode.apply(node);

      // workflow initialized
      if (!app.configuringGraph) {
        ;(async () => {
          node.pkg39.resetCounter();
          await node.pkg39.loadImages();
          // node.pkg39.updateIndex(node.pkg39.getIndex());
          node.pkg39.clearImage();
          node.pkg39.selectImage();
          node.pkg39.renderImage();
          // await node.pkg39.executeCommands("initialize");

          node.pkg39.DIR_PATH.isCallbackEnabled = true;
          node.pkg39.INDEX.isCallbackEnabled = true;
        })();
      }
    }
  },
});