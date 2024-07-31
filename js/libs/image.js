"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getSamplerNodes, getNodeMap } from "./parser.js";
import * as util from "./util.min.js";

let isInitialized = false;
const CLASS_NAMES = ["LoadImage39", "Command39"];
const NODE_NAME = "shinich39.pkg39.image";
const MASK_COLOR = {r: 0, g: 0, b: 0, rgb: "rgb(0,0,0)", };
const DEFAULT_NODE_COLORS = LGraphCanvas.node_colors;
const DEFAULT_MARGIN_X = 30;
const DEFAULT_MARGIN_Y = 60;

// add notification element
const AUDIO_ELEMENT = document.createElement("audio");
AUDIO_ELEMENT.src = `/shinich39/pkg39/sound?path=${encodeURIComponent("./mp3/sound.mp3")}`;
AUDIO_ELEMENT.volume = 1;
document.body.appendChild(AUDIO_ELEMENT);

function isParentNode(node) {
  return CLASS_NAMES[0] === node.comfyClass;
}

function isCommandNode(node) {
  return CLASS_NAMES[1] === node.comfyClass;
}

function getImageURL(filePath) {
  return `/shinich39/pkg39/image?path=${encodeURIComponent(filePath)}&rand=${Date.now()}`;
}

function renderCanvas() {
  app.canvas.draw(true, true);
}

function showError(err) {
  console.error(err);
  
  let msg;
  if (typeof err === "string") {
    msg = err;
  } else if (err.stack && err.message) {
    msg = err.toString(); 
  } else if (err.response) {
    let msg = err.response.error.message;
    if (err.response.error.details)
    msg += ": " + err.response.error.details;
    for (const [nodeID, nodeError] of Object.entries(err.response.node_errors)) {
    msg += "\n" + nodeError.class_type + ":"
      for (const errorReason of nodeError.errors) {
        msg += "\n    - " + errorReason.message + ": " + errorReason.details
      }
    }
  }
  if (msg) {
    app.ui.dialog.show(msg);
  }
}

function hideError() {
  app.ui.dialog.close();
}

function isErrored() {
  if (app.ui?.dialog?.element) {
    return app.ui.dialog.element.style.display !== "none" && 
      app.ui.dialog.element.style.display !== "";
  } else {
    return false;
  }
}

function isAutoQueueMode() {
  return document.querySelector("input[name='AutoQueueMode']:checked")?.value === "instant";
}

function startQueue() {
  app.queuePrompt(0, app.ui.batchCount);
}

function setAutoQueue() {
  if (!isAutoQueueMode()) {
    document.querySelector("input[name='AutoQueueMode']")?.click();
  }
}

function unsetAutoQueue() {
  if (isAutoQueueMode()) {
    for (const elem of Array.prototype.slice.call(document.querySelectorAll("input[name='AutoQueueMode']"))) {
      if (elem.value === "") {
        elem.click();
        break;
      }
    }
  }
}

function getQueueSize() {
  return app.ui.lastQueueSize ?? 0;
}

function initParentNode() {
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
    };

    this.pkg39.init = (function() {
      const self = this;
      if (this.widgets) {
        this.pkg39.DIR_PATH = this.widgets.find(e => e.name === "dir_path");
        this.pkg39.INDEX = this.widgets.find(e => e.name === "index");
        this.pkg39.MODE = this.widgets.find(e => e.name === "mode");
        this.pkg39.FILENAME = this.widgets.find(e => e.name === "filename");

        if (!this.pkg39.MASK) {
          const container = document.createElement("div");
          Object.assign(container.style, {
            position: "relative",
            display: "flex",
            justifyContent: "center", 
            alignItems: "center",
            color: "var(--descrip-text)",
            fontFamily: "Verdana, Arial, Helvetica, sans-serif",
            fontSize: "0.8rem",
            letterSpacing: 0,
          });
          const originalCanvas = document.createElement("canvas");
          const originalCtx = originalCanvas.getContext("2d", {willReadFrequently: true});
          Object.assign(originalCanvas.style, {
            position: "absolute",
            maxWidth: "100%",
            maxHeight: "100%",
          });
          const maskCanvas = document.createElement("canvas");
          const maskCtx = maskCanvas.getContext("2d", {willReadFrequently: true});
          Object.assign(maskCanvas.style, {
            position: "absolute",
            mixBlendMode: "initial",
            opacity: 0.7,
            maxWidth: "100%",
            maxHeight: "100%",
          });

          container.appendChild(originalCanvas);
          container.appendChild(maskCanvas);
          
          this.pkg39.MASK = this.addDOMWidget("maskeditor", "", container, {
            serialize: false,
            getMinHeight: function() {
              return self.size[0];
            },
          });

          let w = this.pkg39.MASK;
          w.serializeValue = () => undefined;
          w.originalCanvas = originalCanvas;
          w.originalCtx = originalCtx;
          w.maskCanvas = maskCanvas;
          w.maskCtx = maskCtx;
          w.zoomRatio = 1.0;
          w.panX = 0;
          w.panY = 0;
          w.brushSize = 10;
          w.drawingMode = false;
          w.lastx = -1;
          w.lasty = -1;
          w.lasttime = 0;

          setMaskWidgetEvents(w);

          const originalImg = new Image();
          w.originalImg = originalImg;
          w.originalImgLoaded = false;
          
          const maskImg = new Image();
          w.maskImg = maskImg;
          w.maskImgLoaded = false;

          originalImg.onload = function() {
            w.originalImgLoaded = true;
            w.originalCanvas.width = originalImg.width;
            w.originalCanvas.height = originalImg.height;
            w.originalCtx.drawImage(originalImg, 0, 0, originalImg.width, originalImg.height);
            imagesLoaded();
          }

          maskImg.onload = function() {
            w.maskImgLoaded = true;
            w.maskCanvas.width = maskImg.width;
            w.maskCanvas.height = maskImg.height;
            w.maskCtx.drawImage(maskImg, 0, 0, maskImg.width, maskImg.height);
            imagesLoaded();
          }

          function imagesLoaded() {
            if (w.originalImgLoaded && w.maskImgLoaded) {
              // paste mask data into alpha channel
              const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      
              // invert mask
              for (let i = 0; i < maskData.data.length; i += 4) {
                if(maskData.data[i+3] == 255) {
                  maskData.data[i+3] = 0;
                } else {
                  maskData.data[i+3] = 255;
                }
      
                maskData.data[i] = MASK_COLOR.r;
                maskData.data[i+1] = MASK_COLOR.g;
                maskData.data[i+2] = MASK_COLOR.b;
              }
      
              maskCtx.globalCompositeOperation = 'source-over';
              maskCtx.putImageData(maskData, 0, 0);
              w.initializeCanvasPanZoom();
            }
          }

          // focus to node
          container.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById("graph-canvas").focus();
          });

          // prevent context menu for removing mask
          originalCanvas.addEventListener("contextmenu", function(e) {
            e.preventDefault();
          });

          maskCanvas.addEventListener("contextmenu", function(e) {
            e.preventDefault();
          });

          // add mask control widget
          const rmw = this.addWidget("button", "Remove mask", null, () => {}, {
            serialize: false,
          });

          rmw.computeSize = () => [0, 26];
          rmw.serializeValue = () => undefined;
          rmw.callback = function() {
            w.removeMaskEvent();
          }

          // canvas resize event
          const onResize = this.onResize;
          this.onResize = function (size) {
            w.initializeCanvasPanZoom();
            onResize?.apply(this, arguments);
          };
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

    this.pkg39.getIndex = (function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
    
        let i = this.pkg39.INDEX.value;
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
        return -1;
      }
    }).bind(this);

    this.pkg39.clearMask = (function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      const w = this.pkg39.MASK;
      w.element.style.width = this.size[0] - 32;
      w.element.style.height = this.size[0] - 32;
      w.originalImgLoaded = false;
      w.maskImgLoaded = false;
      w.originalPath = null;
      w.maskPath = null;
      w.originalCtx.clearRect(0,0,w.originalCanvas.width,w.originalCanvas.height);
      w.maskCtx.clearRect(0,0,w.maskCanvas.width,w.maskCanvas.height);
      w.originalImg.src = null;
      w.maskImg.src = null;
    }).bind(this);

    this.pkg39.setImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }

      this.pkg39.clearMask();

      let i = this.pkg39.getIndex();
      this.pkg39.selectedIndex = i;
      this.pkg39.selectedImage = this.pkg39.loadedImages[i];
      if (!this.pkg39.selectedImage) {
        this.pkg39.INDEX.value = -1;
        this.pkg39.FILENAME.value = "NO IMAGE";
        throw new Error(`No image in ${this.pkg39.DIR_PATH.value}`);
      }

      const { imagePath, maskPath, imageName } = this.pkg39.selectedImage;

      this.pkg39.MASK.originalPath = imagePath;
      this.pkg39.MASK.maskPath = maskPath;
      this.pkg39.MASK.originalImg.src = getImageURL(imagePath);
      this.pkg39.MASK.maskImg.src = getImageURL(maskPath || imagePath);
      this.pkg39.FILENAME.value = imageName;
      this.pkg39.INDEX.value = i;

      try {
        const m = await this.pkg39.getMetadata();
        try {
          this.pkg39.removeWorkflow();
        } catch(err) {
          console.error(err);
        }

        try {
          this.pkg39.loadWorkflow(m);
        } catch(err) {
          console.error(err);
        }
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.loadWorkflow = (function({ workflow, prompt, width, height }) {
      if (!workflow) {
        return;
      }

      const convertNodeMaps = function(nms) {
        let newNodeMaps = [];
        for (const nm of nms) {
          let newNodeMap = [];
          for (const nl of nm) {
            let newNodes = [];
            for (const n of nl) {
              let node = app.graph._nodes.find(e => getOriginalId(e) === n.id);
              if (node) {
                newNodes.push(node);
              }
            }
            newNodeMap.push(newNodes);
          }
          newNodeMaps.push(newNodeMap);
        }
        return newNodeMaps;
      }

      const self = this;
      const samplerNodes = getSamplerNodes({ workflow, prompt });
      let nodeMaps = samplerNodes.map(e => getNodeMap({ workflow, prompt, sampler: e }));
      nodeMaps.sort((a, b) => b.length - a.length); // put the long map in front of array
      const graph = new LGraph(workflow);
      const canvas = new LGraphCanvas(null, graph, { skip_events: true, skip_render: true });

      // set properties
      // disable specific nodes
      for (const n of graph._nodes) {
        // parentId, originalId,
        n.properties.pkg39 = [this.id, n.id];
        if (DEFAULT_NODE_COLORS) {
          n.color = DEFAULT_NODE_COLORS.yellow.color;
          n.bgcolor = DEFAULT_NODE_COLORS.yellow.bgcolor;
          n.groupcolor = DEFAULT_NODE_COLORS.yellow.groupcolor;
        }

        // disable pin
        // lock added Symbol()?
        if (n.flags) {
          n.flags.pinned = false;
        }

        // remove "Load image node" in virtual canvas
        // remove "Command node" in virtual canvas
        if (n.comfyClass === "39LoadImage" || n.type === "39LoadImage") {
          graph.remove(n);
        } else if (n.comfyClass === "39Command" || n.type === "39Command") {
          graph.remove(n);
        }
      }

      graph.arrange(DEFAULT_MARGIN_X);
      // graph.arrange(DEFAULT_MARGIN_Y, LiteGraph.VERTICAL_LAYOUT);
      canvas.selectNodes();
      canvas.copyToClipboard();

      // set mouse point for paste point
      ;(() => {
        // const oldPoint = JSON.parse(JSON.stringify(app.canvas?.graph_mouse || [0, 0]));

        // set position X
        try {
          app.canvas.graph_mouse[0] = this.pos[0] + this.size[0] + DEFAULT_MARGIN_X;
        } catch(err) {
          console.error(err);
        }

        // set position Y
        try {
          app.canvas.graph_mouse[1] = this.pos[1];
        } catch(err) {
          console.error(err);
        }

        // paste to original canvas
        app.canvas.pasteFromClipboard();
        app.canvas.deselectAllNodes();
      })();

      // convert to original nodeMap from image nodeMap
      nodeMaps = convertNodeMaps(nodeMaps);

      // set default nodeMap
      let isVirtualMode = true;
      let nodeMapIndex = 0;
      let nodeMap = nodeMaps[0]; // [[[node, node]]]

      const toVirtualCanvas = function(n) {
        isVirtualMode = true;
        nodeMapIndex = Math.floor(Math.min(0, Math.max(n ?? 0, nodeMaps.length - 1)));
        nodeMap = nodeMaps[nodeMapIndex];
      }

      const toOriginalCanvas = function() {
        isVirtualMode = false;
        nodeMapIndex = 0;
        nodeMap = [app.graph._nodes.filter(e => !isVirtualNode(e))];
      }

      const returnNodeObject = function(node) {
        if (!node) {
          return;
        }

        let connectedInputs = 0;
        let connectedOutputs = 0;
        if (node && node.inputs) {
          for (const input of node.inputs) {
            if (input.link) {
              connectedInputs++;
            }
          }
        }

        if (node && node.outputs) {
          for (const output of node.outputs) {
            if (output.links && output.links.length > 0) {
              connectedOutputs++;
            }
          }
        }

        return {
          isPkg39: true,
          isEnd: connectedOutputs < 1, 
          isStart: connectedInputs < 1, 
          node: node,
          getValue: function(name) {
            if (!name) {
              return;
            }
            const widget = node.widgets?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            return widget ? widget.value : null;
          },
          setValue: function(name, value) {
            if (!name) {
              return;
            }
            const widget = node.widgets?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (widget) {
              widget.value = value;
            }
            return true;
          },
          replace: function(targetNode) {
            if (!targetNode) {
              return false;
            }
            if (targetNode.isPkg39) {
              if (targetNode.node) {
                targetNode = targetNode.node;
              } else {
                return false;
              }
            }
            if (node.type !== targetNode.type) {
              return false;
            }

            if (targetNode.inputs) {
              const inputNode = targetNode;
              for (const input of inputNode.inputs) {
                let outputNode;
                let outputSlot;
                if (input.link) {
                  const link = app.graph.links.find(e => e && e.id === input.link);
                  outputNode = app.graph._nodes.find(e => e.id === link.origin_id);
                  outputSlot = link.origin_slot;

                  const inputSlot = inputNode.findInputSlot(input.name);
                  inputNode.disconnectInput(inputSlot);

                  const nodeSlot = node.findInputSlot(input.name);
                  if (nodeSlot > -1) {
                    outputNode.connect(outputSlot, node, nodeSlot);
                  }
                }
              }
            }

            if (targetNode.outputs) {
              const outputNode = targetNode;
              for (const output of outputNode.outputs) {
                if (output.links) {
                  // fix error links size updated during process
                  const links = JSON.parse(JSON.stringify(output.links));
                  for (const linkId of links) {
                    const link = app.graph.links.find(e => e && e.id === linkId);
                    const inputNode = app.graph._nodes.find(e => e.id === link.target_id);
                    const inputSlot = link.target_slot;
  
                    inputNode.disconnectInput(inputSlot);
  
                    const nodeSlot = node.findOutputSlot(output.name);
                    if (nodeSlot > -1) {
                      node.connect(nodeSlot, inputNode, inputSlot);
                    }
                  }
                }
              }
            }

            app.graph.setDirtyCanvas(false, true);

            return true;
          },
          getInput: function(name) {
            if (!name) {
              return;
            }
            const inputNode = node;
            const input = inputNode.inputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (!input || !input.link) {
              return;
            }

            const link = app.graph.links.filter(e => e && e.id === input.link);
            if (!link) {
              return;
            }

            const outputNode = app.graph._nodes.find(e => e.id === link.origin_id);
            if (!outputNode) {
              return;
            }

            return returnNodeObject(outputNode);
          },
          connectInput: function(name, outputNode) {
            if (!name || !outputNode) {
              return false;
            }
            if (outputNode.isPkg39) {
              if (outputNode.node) {
                outputNode = outputNode.node;
              } else {
                return false;
              }
            }
            const inputNode = node;
            const input = inputNode.inputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (input) {
              const inputSlot = inputNode.findInputSlot(input.name);
              const inputType = input.type.toUpperCase();
              const output = outputNode.outputs?.find(e => e.name === name || e.type.toUpperCase() === inputType);
              if (output) {
                const outputSlot = outputNode.findOutputSlot(output.name);
                if (input.link) {
                  inputNode.disconnectInput(inputSlot);
                }
                outputNode.connect(outputSlot, inputNode, inputSlot);
                app.graph.setDirtyCanvas(false, true);
              }
            }
            return true;
          },
          getOutputs: function(name) {
            if (!name) {
              return [];
            }
            const outputNode = node;
            const output = outputNode.outputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (!output || !output.links) {
              return [];
            }

            const links = app.graph.links.filter(e => e && output.links.indexOf(e.id) > -1);
            if (!links || links.length < 1) {
              return [];
            }

            const outputNodeIds = links.map(e => e.target_id);
            const outputNodes = app.graph._nodes.filter(e => outputNodeIds.indexOf(e.id) > -1);
            if (!outputNodes) {
              return [];
            }

            return outputNodes.map(e => returnNodeObject(e));
          },
          connectOutput: function(name, inputNode) {
            if (!name || !inputNode) {
              return false;
            }
            if (inputNode.isPkg39) {
              if (inputNode.node) {
                inputNode = inputNode.node;
              } else {
                return false;
              }
            }
            const outputNode = node;
            const output = outputNode.outputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (output) {
              const outputSlot = outputNode.findOutputSlot(output.name);
              const outputType = output.type.toUpperCase();
              const input = inputNode.inputs?.find(e => e.name === name || e.type.toUpperCase() === outputType);
              if (input) {
                const inputSlot = inputNode.findInputSlot(input.name);
                if (input.link) {
                  inputNode.disconnectInput(inputSlot);
                }
                outputNode.connect(outputSlot, inputNode, inputSlot);
                app.graph.setDirtyCanvas(false, true);
              }
            }
            return true;
          },
          connectOutputs: function(name, inputNodes) {
            if (!name || !inputNodes) {
              return false;
            }
            if (Array.isArray(inputNodes)) {
              for (const n of inputNodes) {
                this.connectOutput(name, n);
              }
            }
            return true;
          },
          hires: function(w, h) {
            if (!w) {
              return false;
            }
            // "KSamplerAdvanced"
            if (["KSampler"].indexOf(node.comfyClass || node.type) === -1) {
              return false;
            }

            if (!h) {
              h = Math.floor(height * w);
              w = Math.floor(width * w);
            }

            const outputNodes = this.getOutputs("LATENT");
            const inputNodes = [];
            const widgetValues = [];
            if (node.inputs) {
              for (const input of node.inputs) {
                const link = app.graph.links.find(e => e && e.id === input.link);
                if (link && link.type) {
                  const n = app.graph._nodes.find(e => e.id === link.origin_id);
                  inputNodes.push({
                    name: input.name || input.type,
                    node: returnNodeObject(n),
                    _node: n,
                  });
                }
              }
            }

            if (node.widgets) {
              for (const widget of node.widgets) {
                widgetValues.push({
                  name: widget.name,
                  value: widget.value,
                });
              }
            }

            const upscaler = createNode("LatentUpscale");
            upscaler.node.pos = [node.pos[0], node.pos[1] + node.size[1] + DEFAULT_MARGIN_Y];
            const sampler = createNode("KSampler");
            sampler.node.pos = [upscaler.node.pos[0], upscaler.node.pos[1] + upscaler.node.size[1] + DEFAULT_MARGIN_Y];

            this.connectOutput("LATENT", upscaler);

            for (const e of inputNodes) {
              sampler.connectInput(e.name, e.node);
            }

            for (const outputNode of outputNodes) {
              sampler.connectOutput("LATENT", outputNode);
            }

            for (const {name, value} of widgetValues) {
              sampler.setValue(name, value);
            }

            upscaler.connectOutput("LATENT", sampler);
            upscaler.setValue("width", w);
            upscaler.setValue("height", h);

            return [upscaler, sampler];
          },
          remove: function() {
            app.graph.remove(node);
          },
          disable: function() {
            this.bypass(true);
          },
          enable: function() {
            this.bypass(false);
          },
          bypass: function(b = true) {
            node.mode = b ? 4 : 0;
          },
        }
      }

      // type or title
      const findNodesByName = function(str, dir = 1) {
        let nodes = [];
        let nodeIds = [];

        function isValid(n) {
          return (n.title && n.title === str) ||
            (n.comfyClass && n.comfyClass.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase()) ||
            (n.type && n.type.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase());
        }

        function saveNode(arr) {
          const items = arr.filter(isValid);
          for (const n of items) {
            if (n && nodeIds.indexOf(n.id) === -1) {
              nodes.push(n);
              nodeIds.push(n.id);
            }
          }
        }

        // image.workflow
        if (dir > 0) {
          for (let i = 0; i < nodeMap.length; i++) {
            const n = nodeMap[i];
            saveNode(n);
          }
        } else {
          for (let i = nodeMap.length - 1; i >= 0; i--) {
            const n = nodeMap[i];
            saveNode(n);
          }
        }

        // covert to pkg39 node
        nodes = nodes
          .map(e => returnNodeObject(e))
          .filter(e => !!e);

        // sort original nodes in ascending order
        if (!isVirtualMode) {
          nodes.sort((a, b) => a.node.id - b.node.id);
        }

        return nodes;
      }

      const findNodesByNameFromLast = function(str) {
        return findNodesByName(str, -1);
      }

      const findNodeByName = function(str, dir = 1) {
        
        function isValid(e) {
          return (e.title && e.title === str) ||
            (e.comfyClass && e.comfyClass.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase()) ||
            (e.type && e.type.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase());
        }

        // image.workflow
        let node;
        if (dir > 0) {
          for (let i = 0; i < nodeMap.length; i++) {
            for (const n of nodeMap[i]) {
              if (isValid(n)) {
                node = n;
                break;
              }
            }
          }
        } else {
          for (let i = nodeMap.length - 1; i >= 0; i--) {
            for (const n of nodeMap[i]) {
              if (isValid(n)) {
                node = n;
                break;
              }
            }
          }
        }

        return returnNodeObject(node);
      }

      const findNodeByNameFromLast = function(str) {
        return findNodeByName(str, -1);
      }

      const findNodeById = function(id) {
        const n = app.graph._nodes.find(e => e && e.id === id);
        return returnNodeObject(n);
      }

      const bypassNodes = function(nodes = [], b = true) {
        if (!Array.isArray(nodes) && typeof nodes === "object") {
          nodes = [nodes];
        }
        for (const node of nodes) {
          node.bypass(b);
        }
      }

      const removeNodes = function(nodes = []) {
        if (!Array.isArray(nodes) && typeof nodes === "object") {
          nodes = [nodes];
        }
        for (const node of nodes) {
          node.remove();
        }
      }

      // const getLastImageNodes = function() {
      //   let nodes = [];
      //   for (const node of app.graph._nodes) {
      //     const isValidNode = isVirtualMode === isVirtualNode(node);
      //     const isLastNode = !node.outputs || !!node.outputs.find(e => e.links && e.links.length > 0);
      //     const isImageNode = node.inputs && !!node.inputs.find(e => e.type.toUpperCase() === "IMAGE");
      //     if (isValidNode && isLastNode && isImageNode) {
      //       nodes.push(returnNodeObject(node));
      //     }
      //   }
      //   return nodes;
      // }

      // const getFirstLatentNodes = function() {
      //   let nodes = [];
      //   for (const node of app.graph._nodes) {
      //     const isValidNode = isVirtualMode === isVirtualNode(node);
      //     const isFirstNode = !node.inputs || !node.inputs.find(e => e.link);
      //     const isLatentNode = node.outputs && !!node.outputs.find(e => e.type.toUpperCase() === "LATENT");
      //     if (isValidNode && isFirstNode && isLatentNode) {
      //       nodes.push(returnNodeObject(node));
      //     }
      //   }
      //   return nodes;
      // }

      // const getFirstImageNodes = function() {
      //   let nodes = [];
      //   for (const node of app.graph._nodes) {
      //     const isValidNode = isVirtualMode === isVirtualNode(node);
      //     const isFirstNode = !node.inputs || !node.inputs.find(e => e.link);
      //     const isLatentNode = node.outputs && !!node.outputs.find(e => e.type.toUpperCase() === "IMAGE");
      //     if (isValidNode && isFirstNode && isLatentNode) {
      //       nodes.push(returnNodeObject(node));
      //     }
      //   }
      //   return nodes;
      // }

      const ignoreErrorMessage = function() {
        if (!self.pkg39.ignoreErrorMessage) {
          self.pkg39.ignoreErrorMessage = setInterval(() => {
            if (isErrored()) {
              hideError();
              startQueue();
            }
          }, 512);
        }

        let pageX = 0, pageY = 0;
        const stopHandler = function(e) {
          if (!pageX || !pageY) {
            pageX = e.pageX;
            pageY = e.pageY;
          } else {
            if (Math.abs(pageX - e.pageX) + Math.abs(pageY - e.pageY) > 100) {
              document.removeEventListener("mousemove", stopHandler);
              if (self.pkg39.ignoreErrorMessage) {
                clearInterval(self.pkg39.ignoreErrorMessage);
                self.pkg39.ignoreErrorMessage = null;
              }
            }
          }
        }
        
        document.addEventListener("mousemove", stopHandler);      
      }

      const createNode = function(name, options) {
        options = { select: true, shiftY: 0, before: false, ...(options || {}) };
        const node = LiteGraph.createNode(name);
        if (!node) {
          throw new Error(`${name} node can not create.`);
        }
        node.properties.pkg39 = [self.id, -1];
        if (DEFAULT_NODE_COLORS) {
          node.color = DEFAULT_NODE_COLORS.yellow.color;
          node.bgcolor = DEFAULT_NODE_COLORS.yellow.bgcolor;
          node.groupcolor = DEFAULT_NODE_COLORS.yellow.groupcolor;
        }
        app.graph.add(node);


        if (options.select) {
          app.canvas.selectNode(node, false);
        }

        return returnNodeObject(node);
      }

      const nextQueue = function() {
        self.pkg39.updateIndex();
        self.pkg39.setImage()
          .then(() => { renderCanvas() });
      }

      ;(() => {
        if (!isInitialized) {
          // console.error(new Error("pkg39 has not been initialized."));
          return;
        }
        try {
          const MAIN = returnNodeObject(self);

          const increaseErrors = () => { self.pkg39.countErrors += 1; }
          const resetErrors = () => { self.pkg39.countErrors = 0; }
          const countQueues = self.pkg39.countQueues;
          const countLoops = self.pkg39.countLoops;
          const countErrors = self.pkg39.countErrors;
          const isAutoQueue = isAutoQueueMode();
          const queueSize = getQueueSize();

          const original = toOriginalCanvas;
          const virtual = toVirtualCanvas;
          const find = findNodesByName;
          const findLast = findNodesByNameFromLast;
          const findOne = findNodeByName;
          const findOneLast = findNodeByNameFromLast;
          const findOneById = findNodeById;
          const enable = (name) => { bypassNodes(Array.isArray(name) ? name : findNodesByName(name), false)};
          const disable = (name) => { bypassNodes(Array.isArray(name) ? name : findNodesByName(name), true) };
          const remove = (name) => { removeNodes(Array.isArray(name) ? name : findNodesByName(name)) };
          // const bypassLastImages = () => { bypassNodes(getLastImageNodes()) };
          // const bypassFirstImages = () => { bypassNodes(getFirstImageNodes()) };
          // const bypassFirstLatents = () => { bypassNodes(getFirstLatentNodes()) };
          const create = createNode;
          const ignore = ignoreErrorMessage;
          const sound = playSound;
          const start = () => { startQueue(); }
          const loop = () => { setAutoQueue(); }
          const stop = () => { unsetAutoQueue(); }
          const next = () => { nextQueue(); }
          let error = (err) => { console.error(err); };
          let __command__ = getCommandValue();
          __command__ = `
            try {
              ${__command__}
            } catch(err) {
              setTimeout(() => {
                error(err);
              }, 512);
            }`;
          eval(__command__.trim());
        } catch(err) {
          console.error(err);
          unsetAutoQueue();
        }
      })();
    }).bind(this);

    this.pkg39.removeWorkflow = (function() {
      try {
        const nodes = [];
        for (const n of app.graph._nodes) {
          const parentId = getParentId(n);
          if (parentId && parentId === this.id) {
            nodes.push(n);
          } 
        }
        if (nodes.length > 0) {
          app.canvas.selectNodes(nodes);
          app.canvas.deleteSelectedNodes();
        }
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.loadImages = (async function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }
  
        // get images in directory
        let d = this.pkg39.DIR_PATH.value;
        if (d && d.trim() !== "") {
          this.pkg39.loadedImages = await loadImages(d);

          // convert to camelcase
          this.pkg39.loadedImages = this.pkg39.loadedImages.map(e => {
            return {
              imagePath: e["image_path"],
              imageName: e["image_name"],
              maskPath: e["mask_path"],
              maskName: e["mask_name"],
            }
          });
        } else {
          this.pkg39.loadedImages = [];
        }
      } catch(err) {
        console.error(err);
        this.pkg39.loadedImages = [];
      }
    }).bind(this);

    this.pkg39.getMetadata = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }

      let i = this.pkg39.selectedImage;
      if (i) {
        let p = i.imagePath;
        let m = await loadMetadata(p);
        return m;
      } else {
        return null;
      }
    }).bind(this);

    this.pkg39.updateDirPath = (async function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }

        this.pkg39.resetCounter();
        await this.pkg39.loadImages();
        await this.pkg39.setImage();
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.updateIndex = (function() {
      try {
        if (!this.pkg39.isInitialized) {
          throw new Error("pkg39 has not been initialized.");
        }

        let i = this.pkg39.INDEX.value;
        let m = this.pkg39.MODE.value;
        let images = this.pkg39.loadedImages;
        if (images && images.length > 0) {
          if (m === "increment") {
            i += 1;
          } else if (m === "decrement") {
            i -= 1;
          } else if (m === "randomize") {
            i = Math.floor(util.random(0, images.length));
          }
        } else {
          i = -1;
        }
    
        if (this.pkg39.INDEX.value !== i) {
          this.pkg39.INDEX.value = i;
        }

        // increase counts
        this.pkg39.countQueues += 1;
        let n = this.pkg39.getIndex();
        if (m === "increment" && n <= i) {
          this.pkg39.countLoops += 1;
        } else if (m === "decrement" && n >= i) {
          this.pkg39.countLoops += 1;
        }
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
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

		const onRemoved = this.onRemoved;
		this.onRemoved = function () {
      const id = this.id;

      for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
        const n = app.graph._nodes[i];
        if (getParentId(n) === id) {
          app.graph.remove(n);
        }
      }

			onRemoved?.apply(this, arguments);
		};

    // create widgets
    this.pkg39.init();

    const dpWidget = this.pkg39.DIR_PATH;
    const idxWidget = this.pkg39.INDEX;
    const fnWidget = this.pkg39.FILENAME;
    const indexWidget = this.pkg39.INDEX;
    const modeWidget = this.pkg39.MODE;
    const maskWidget = this.pkg39.MASK;

    dpWidget.options.getMaxHeight = () => 64;
    dpWidget.prevValue = dpWidget.value;
    dpWidget.callback = function(currValue) {
      if (this.prevValue !== currValue) {
        this.prevValue = currValue;
        idxWidget.value = 0;
        self.pkg39.updateDirPath()
          .then(() => renderCanvas())
      }
    }

    idxWidget.callback = function(v) {
      self.pkg39.resetCounter();
      self.pkg39.setImage();
    }

    // initialize after create
    this.pkg39.updateDirPath();

    // fix node size
    setTimeout(() => { renderCanvas() }, 256);
  } catch(err) {
    console.error(err);
  }
}

function initCommandNode() {
  const self = this;

  // set default value
  const w = this.widgets?.[0];

  let text = ``;
  let nodeIndex = 1;
  for (const node of app.graph._nodes) {
    const isCommNode = isCommandNode(node);
    const isValidNode = isVirtualNode(node);
    const nodeId = node.id;
    const nodeType = node.type;
    const nodeTitle = node.title;

    if (!isCommNode && !isValidNode) {
      text += `var n${nodeIndex++} = findOneById(${nodeId}); // ${nodeTitle}\n`;
    }
  }
  text += `\n// You can use javascript code here!`;
  text += `\n// The code is executed after rendered new image workflow.`;
  text += `\n// Image workflow has been set default range.`;
  text += `\n// If image workflow has multiple flows, you may not be able to find nodes.`;
  text += `\n// Only the first created command node will run.`;
  text += `\n\n// ## Global variables`;
  text += `\n// MAIN => Node: Load image node.`;
  text += `\n// countQueues => Number: Number of queues.`;
  text += `\n// countLoops => Number: Number of loops.`;
  text += `\n// error: A callback function when an error occurred in command node.`;
  text += `\n//         Default function is set to next().`;
  text += `\n\n// ## Global methods`;
  text += `\n// original(): Set to search area as original workflow.`;
  text += `\n// virtual(index): Set to search area as image workflow.`;
  text += `\n// find("TYPE"|"TITLE") => NodeArray`;
  text += `\n// findLast("TYPE"|"TITLE") => NodeArray`;
  text += `\n// findOne("TYPE"|"TITLE") => Node`;
  text += `\n// findOneLast("TYPE"|"TITLE") => Node`;
  text += `\n// findOneById(id) => Node: Only search for original workflow.`;
  text += `\n// remove("TYPE"|"TITLE"|NodeArray)`;
  text += `\n// enable("TYPE"|"TITLE"|NodeArray)`;
  text += `\n// disable("TYPE"|"TITLE"|NodeArray)`;
  text += `\n// ignore(): Ignore error message before move mouse.`;
  text += `\n// sound(): Play the sound once.`;
  text += `\n// start(): Start queue.`;
  text += `\n// loop(): Enable auto queue mode.`;
  text += `\n// stop(): Disable auto queue mode.`;
  text += `\n// next(): Load next image.`;
  text += `\n\n// ## Node variables`;
  text += `\n// node.isPkg39 => Boolean`;
  text += `\n// node.isEnd => Boolean: The node has been placed ending point.`;
  text += `\n// node.isStart => Boolean: The node has been placed starting point.`;
  text += `\n// node.node => ComfyNode`;
  text += `\n\n// ## Node methods`;
  text += `\n// node.getValue("WIDGET_NAME") => Any`;
  text += `\n// node.setValue("WIDGET_NAME", "VALUE")`;
  text += `\n// node.replace(Node): Change all connections with the other node.`;
  text += `\n// node.getInput("INPUT_NAME") => Node`;
  text += `\n// node.connectInput("INPUT_NAME", Node): Connect to output of target node.`;
  text += `\n// node.getOutputs("OUTPUT_NAME") => NodeArray`;
  text += `\n// node.connectOutput("OUTPUT_NAME", Node): Connect to input of target node.`;
  text += `\n// node.connectOutputs("OUTPUT_NAME", NodeArray): Connect to input of target nodes.`;
  text += `\n// node.remove()`;
  text += `\n// node.enable()`;
  text += `\n// node.disable()`;
  text += `\n// node.hires(w, h) => [UpscalerNode, SamplerNode]: This method must be executed from ksampler node.`;
  text += `\n// node.hires(scale) => [UpscalerNode, SamplerNode]`;
  w.value = text;
}

function isSoundPlayed() {
  return !AUDIO_ELEMENT.paused;
}

function playSound() {
  AUDIO_ELEMENT.loop = false;
  AUDIO_ELEMENT.play();
}

function loopSound() {
  let pageX = 0, pageY = 0;
  const stopHandler = function(e) {
    if (!pageX || !pageY) {
      pageX = e.pageX;
      pageY = e.pageY;
    } else {
      if (Math.abs(pageX - e.pageX) + Math.abs(pageY - e.pageY) > 100) {
        document.removeEventListener("mousemove", stopHandler);
        AUDIO_ELEMENT.pause();
      }
    }
  }

  document.addEventListener("mousemove", stopHandler);

  AUDIO_ELEMENT.loop = true;
  AUDIO_ELEMENT.play();
}

function getParentId(node) {
  return node?.properties?.pkg39?.[0];
}

function getOriginalId(node) {
  return node?.properties?.pkg39?.[1];
}

function isVirtualNode(node) {
  return Array.isArray(node?.properties?.pkg39);
}

function getNodeByOriginalId(originalId) {
  return app.graph._nodes?.find(e => getOriginalId(e) === originalId);
}

function getCommandValue() {
  for (const node of app.graph._nodes) {
    if (node.comfyClass === CLASS_NAMES[1]) {
      const v = node.widgets?.[0].value;
      if (v && v !== "") {
        return v;
      }
    }
  }
  return "";
}

async function promptQueuedHandler() {
  for (const node of app.graph._nodes) {
    if (node.comfyClass === CLASS_NAMES[0]) {
      node.pkg39.updateIndex();
      node.pkg39.setImage()
        .then(() => { renderCanvas() });
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

async function getBlobFromURL(url) {
  const response = fetch(url);
  const blob = await response.blob();
  return blob;
}

function getPathFromURL(url) {
  let filename = url.searchParams.get("filename");
  if (filename && filename !== "") {
    filename = "/" + filename;
  }
  let subdir = url.searchParams.get("subfolder");
  if (subdir && subdir !== "") {
    subdir = "/" + subdir;
  }
  let dir = url.searchParams.get("type");
  if (dir && dir !== "") {
    dir = "/" + dir;
  }
  return `ComfyUI${dir}${subdir}${filename}`;
}

async function loadMetadata(filePath) {
  const response = await api.fetchApi(`/shinich39/pkg39/load_metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ path: filePath }),
  });

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  const data = await response.json();

  let workflow, prompt;
  try {
    workflow = JSON.parse(data.info.workflow);
  } catch(err) {
    console.error(err);
  }

  try {
    prompt = JSON.parse(data.info.prompt);
  } catch(err) {
    console.error(err);
  }

  return {
    width: data.width,
    height: data.height,
    format: data.format,
    workflow: workflow,
    prompt: prompt,
  };
}

function setMaskWidgetEvents(widget) {
  widget.initializeCanvasPanZoom = initializeCanvasPanZoom;
  widget.invalidatePanZoom = invalidatePanZoom;
  widget.showBrush = showBrush;
  widget.hideBrush = hideBrush;
  widget.handleWheelEvent = handleWheelEvent;
  widget.pointerMoveEvent = pointerMoveEvent;
  widget.pointerDownEvent = pointerDownEvent;
  widget.drawMoveEvent = drawMoveEvent;
  widget.pointerUpEvent = pointerUpEvent;
  widget.saveMaskEvent = saveMaskEvent;
  widget.removeMaskEvent = removeMaskEvent;

  widget.maskCanvas.addEventListener('wheel', (event) => widget.handleWheelEvent(widget, event));
  widget.maskCanvas.addEventListener('pointerleave', (event) => widget.hideBrush(widget, event));
  widget.maskCanvas.addEventListener('pointerdown', (event) => widget.pointerDownEvent(widget, event));
  widget.maskCanvas.addEventListener('pointermove', (event) => widget.drawMoveEvent(widget, event));
  
  // Helper function to convert a data URL to a Blob object
  function dataURLToBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    return new Blob([arrayBuffer], { type: contentType });
  }

  function initializeCanvasPanZoom() {
    // set initialize
    let drawWidth = this.originalImg.width;
    let drawHeight = this.originalImg.height;

    let width = this.element.clientWidth;
    let height = this.element.clientHeight;

    if (this.originalImg.width > width) {
      drawWidth = width;
      drawHeight = (drawWidth / this.originalImg.width) * this.originalImg.height;
    }

    if (drawHeight > height) {
      drawHeight = height;
      drawWidth = (drawHeight / this.originalImg.height) * this.originalImg.width;
    }

    this.zoomRatio = drawWidth / this.originalImg.width;

    const canvasX = (width - drawWidth) / 2;
    const canvasY = (height - drawHeight) / 2;
    this.panX = canvasX;
    this.panY = canvasY;

    this.invalidatePanZoom();
  }

  function invalidatePanZoom() {
    let rawWidth = this.originalImg.width * this.zoomRatio;
    let rawHeight = this.originalImg.height * this.zoomRatio;

    if(this.panX + rawWidth < 10) {
      this.panX = 10 - rawWidth;
    }

    if(this.panY + rawHeight < 10) {
      this.panY = 10 - rawHeight;
    }

    let width = `${rawWidth}px`;
    let height = `${rawHeight}px`;

    let left = `${this.panX}px`;
    let top = `${this.panY}px`;

    this.maskCanvas.style.width = width;
    this.maskCanvas.style.height = height;
    this.maskCanvas.style.left = left;
    this.maskCanvas.style.top = top;

    this.originalCanvas.style.width = width;
    this.originalCanvas.style.height = height;
    this.originalCanvas.style.left = left;
    this.originalCanvas.style.top = top;
  }

  function showBrush() {
    if (!this.brush) {
      this.brush = document.createElement("div");
      // this.brush.className = "load-image-in-seq-mask-editor-brush";
      document.body.appendChild(this.brush);
    }
    // canvas scale
    const scale = app.canvas.ds.scale;

    this.brush.style.backgroundColor = "rgba(0,0,0,0.2)";
    this.brush.style.boxShadow = "0 0 0 1px white";
    this.brush.style.borderRadius = "50%";
    this.brush.style.MozBorderRadius = "50%";
    this.brush.style.WebkitBorderRadius = "50%";
    this.brush.style.position = "absolute";
    this.brush.style.zIndex = 8889;
    this.brush.style.pointerEvents = "none";
    this.brush.style.width = this.brushSize * 2 * this.zoomRatio * scale + "px";
    this.brush.style.height = this.brushSize * 2 * this.zoomRatio * scale + "px";
    this.brush.style.left = (this.cursorX - this.brushSize * this.zoomRatio * scale) + "px";
    this.brush.style.top = (this.cursorY - this.brushSize * this.zoomRatio * scale) + "px";
  }

  function hideBrush() {
    if (this.brush) {
      this.brush.parentNode.removeChild(this.brush);
      this.brush = null;
    }
  }

  function handleWheelEvent(self, event) {
    event.preventDefault();

    // canvas scale
    const scale = app.canvas.ds.scale;

    // adjust brush size
    if(event.deltaY < 0)
      self.brushSize = Math.min(self.brushSize+(10 / scale), 1000 / scale);
    else
      self.brushSize = Math.max(self.brushSize-(10 / scale), 1);

    self.showBrush();
  }

  function pointerMoveEvent(self, event) {
    self.cursorX = event.pageX;
    self.cursorY = event.pageY;
    self.showBrush();
  }

  function drawMoveEvent(self, event) {
    if(event.ctrlKey || event.shiftKey) {
      return;
    }

    event.preventDefault();

    this.cursorX = event.pageX;
    this.cursorY = event.pageY;

    self.showBrush();

    let left_button_down = window.TouchEvent && event instanceof TouchEvent || event.buttons == 1;
    let right_button_down = [2, 5, 32].includes(event.buttons);

    if (!event.altKey && left_button_down) {
      var diff = performance.now() - self.lasttime;

      const maskRect = self.maskCanvas.getBoundingClientRect();

      var x = event.offsetX;
      var y = event.offsetY

      if(event.offsetX == null) {
        x = event.targetTouches[0].clientX - maskRect.left;
      }

      if(event.offsetY == null) {
        y = event.targetTouches[0].clientY - maskRect.top;
      }

      x /= self.zoomRatio;
      y /= self.zoomRatio;

      var brushSize = this.brushSize;
      if(event instanceof PointerEvent && event.pointerType == 'pen') {
        brushSize *= event.pressure;
        this.last_pressure = event.pressure;
      }
      else if(window.TouchEvent && event instanceof TouchEvent && diff < 20){
        // The firing interval of PointerEvents in Pen is unreliable, so it is supplemented by TouchEvents.
        brushSize *= this.last_pressure;
      }
      else {
        brushSize = this.brushSize;
      }

      if(diff > 20 && !this.drawingMode)
        requestAnimationFrame(() => {
          self.maskCtx.beginPath();
          self.maskCtx.fillStyle = MASK_COLOR.rgb;
          self.maskCtx.globalCompositeOperation = "source-over";
          self.maskCtx.arc(x, y, brushSize, 0, Math.PI * 2, false);
          self.maskCtx.fill();
          self.lastx = x;
          self.lasty = y;
        });
      else
        requestAnimationFrame(() => {
          self.maskCtx.beginPath();
          self.maskCtx.fillStyle = MASK_COLOR.rgb;
          self.maskCtx.globalCompositeOperation = "source-over";

          var dx = x - self.lastx;
          var dy = y - self.lasty;

          var distance = Math.sqrt(dx * dx + dy * dy);
          var directionX = dx / distance;
          var directionY = dy / distance;

          for (var i = 0; i < distance; i+=5) {
            var px = self.lastx + (directionX * i);
            var py = self.lasty + (directionY * i);
            self.maskCtx.arc(px, py, brushSize, 0, Math.PI * 2, false);
            self.maskCtx.fill();
          }
          self.lastx = x;
          self.lasty = y;
        });

      self.lasttime = performance.now();
    }
    else if((event.altKey && left_button_down) || right_button_down) {
      const maskRect = self.maskCanvas.getBoundingClientRect();
      const x = (event.offsetX || event.targetTouches[0].clientX - maskRect.left) / self.zoomRatio;
      const y = (event.offsetY || event.targetTouches[0].clientY - maskRect.top) / self.zoomRatio;

      var brushSize = this.brushSize;
      if(event instanceof PointerEvent && event.pointerType == 'pen') {
        brushSize *= event.pressure;
        this.last_pressure = event.pressure;
      }
      else if(window.TouchEvent && event instanceof TouchEvent && diff < 20){
        brushSize *= this.last_pressure;
      }
      else {
        brushSize = this.brushSize;
      }

      if(diff > 20 && !drawingMode) // cannot tracking drawingMode for touch event
        requestAnimationFrame(() => {
          self.maskCtx.beginPath();
          self.maskCtx.globalCompositeOperation = "destination-out";
          self.maskCtx.arc(x, y, brushSize, 0, Math.PI * 2, false);
          self.maskCtx.fill();
          self.lastx = x;
          self.lasty = y;
        });
      else
        requestAnimationFrame(() => {
          self.maskCtx.beginPath();
          self.maskCtx.globalCompositeOperation = "destination-out";
          
          var dx = x - self.lastx;
          var dy = y - self.lasty;

          var distance = Math.sqrt(dx * dx + dy * dy);
          var directionX = dx / distance;
          var directionY = dy / distance;

          for (var i = 0; i < distance; i+=5) {
            var px = self.lastx + (directionX * i);
            var py = self.lasty + (directionY * i);
            self.maskCtx.arc(px, py, brushSize, 0, Math.PI * 2, false);
            self.maskCtx.fill();
          }
          self.lastx = x;
          self.lasty = y;
        });

        self.lasttime = performance.now();
    }
  }

  function pointerDownEvent(self, event) {
    if (!self.originalImgLoaded || !self.maskImgLoaded) {
      return;
    }

    if(event.ctrlKey) {
      if (event.buttons == 1) {
        self.mousedown_x = event.clientX;
        self.mousedown_y = event.clientY;

        self.mousedown_panX = self.panX;
        self.mousedown_panY = self.panY;
      }
      return;
    }

    var brushSize = self.brushSize;
    if(event instanceof PointerEvent && event.pointerType == 'pen') {
      brushSize *= event.pressure;
      self.last_pressure = event.pressure;
    }

    if ([0, 2, 5].includes(event.button)) {
      self.drawingMode = true;

      event.preventDefault();

      if(event.shiftKey) {
        self.zoom_lasty = event.clientY;
        self.last_zoomRatio = self.zoomRatio;
        return;
      }

      const maskRect = self.maskCanvas.getBoundingClientRect();
      const x = (event.offsetX || event.targetTouches[0].clientX - maskRect.left) / self.zoomRatio;
      const y = (event.offsetY || event.targetTouches[0].clientY - maskRect.top) / self.zoomRatio;

      self.maskCtx.beginPath();
      if (!event.altKey && event.button == 0) {
        self.maskCtx.fillStyle = MASK_COLOR.rgb;
        self.maskCtx.globalCompositeOperation = "source-over";
      } else {
        self.maskCtx.globalCompositeOperation = "destination-out";
      }
      self.maskCtx.arc(x, y, brushSize, 0, Math.PI * 2, false);
      self.maskCtx.fill();
      self.lastx = x;
      self.lasty = y;
      self.lasttime = performance.now();
    }
  }

  async function saveMaskEvent() {
    const backupCanvas = document.createElement('canvas');
    const backupCtx = backupCanvas.getContext('2d', {willReadFrequently:true});
    backupCanvas.width = this.originalImg.width;
    backupCanvas.height = this.originalImg.height;

    backupCtx.clearRect(0,0, backupCanvas.width, backupCanvas.height);
    backupCtx.drawImage(this.maskCanvas,
      0, 0, this.maskCanvas.width, this.maskCanvas.height,
      0, 0, backupCanvas.width, backupCanvas.height);

    // paste mask data into alpha channel
    const backupData = backupCtx.getImageData(0, 0, backupCanvas.width, backupCanvas.height);

    // refine mask image
    for (let i = 0; i < backupData.data.length; i += 4) {
      if(backupData.data[i+3] == 255)
        backupData.data[i+3] = 0;
      else
        backupData.data[i+3] = 255;

      backupData.data[i] = 0;
      backupData.data[i+1] = 0;
      backupData.data[i+2] = 0;
    }

    backupCtx.globalCompositeOperation = 'source-over';
    backupCtx.putImageData(backupData, 0, 0);

    const formData = new FormData();
    const dataURL = backupCanvas.toDataURL();
    const blob = dataURLToBlob(dataURL);
    formData.append('image', blob);
    formData.append('path', this.originalPath);

    const response = await api.fetchApi('/shinich39/pkg39/save_mask_image', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    this.maskPath = data.mask_path;

    // reload mask
    // this.maskImgLoaded = false;
    // this.maskCtx.clearRect(0,0,this.maskCanvas.width,this.maskCanvas.height);
    // this.maskImg.src = getImageURL(this.maskPath);
  }

  async function removeMaskEvent() {
    await api.fetchApi('/shinich39/pkg39/remove_mask_image', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: this.originalPath,
      }),
    });

    // reload mask
    this.maskImgLoaded = false;
    this.maskCtx.clearRect(0,0,this.maskCanvas.width,this.maskCanvas.height);
    this.maskImg.src = getImageURL(this.originalPath);
  }
}

function pointerUpEvent(e) {
  e.preventDefault();

  // reset all canvas
  for (const node of app.graph._nodes) {
    if (node.comfyClass === CLASS_NAMES[0]) {
      const w = node.widgets?.find(e => e.name === "maskeditor");
      if (w) {
        // call save event
        if (w.drawingMode) {
          w.saveMaskEvent();
        }

        w.mousedown_x = null;
        w.mousedown_y = null;
        w.drawingMode = false;
      }
    }
  }
}

// global event
document.addEventListener('pointerup', (event) => pointerUpEvent(event));

// after start new queue
api.addEventListener("promptQueued", promptQueuedHandler);

app.registerExtension({
	name: NODE_NAME,
  setup() {
    setTimeout(() => {
      isInitialized = true;
    }, 512);
  },
  nodeCreated(node) {
    if (isParentNode(node)) {
      initParentNode.apply(node);
    } else if (isCommandNode(node)) {
      initCommandNode.apply(node);
    }
  }
});