"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getSamplerNodes, getNodeMap } from "./parser.js";
import * as util from "./util.min.js";
import {
  isLoadImageNode, 
  isCommandNode,
  isPkg39Node, 
  getLoaderId,
  getPreviousId,
  getRandomSeed,
  hideError,
  isErrorOccurred,
  isAutoQueueMode,
  getQueueSize,
  startGeneration,
  cancelGeneration,
  setAutoQueue,
  unsetAutoQueue,
  renderCanvas,
  isSoundPlayed,
  playSound,
  loopSound,
  selectNode,
  parseExecuteResponse,
} from "./pkg39-utils.js";

const MASK_COLOR = {r: 0, g: 0, b: 0, rgb: "rgb(0,0,0)", };
const DEFAULT_NODE_COLORS = LGraphCanvas.node_colors;
const DEFAULT_MARGIN_X = 30;
const DEFAULT_MARGIN_Y = 60;

const DEFAULT_SAMPLER_NODE_NAME = "KSampler";
const DEFAULT_SAVE_NODE_NAME = "SaveImage";
const DEFAULT_ENCODE_NODE_NAME = "VAEEncode";
const DEFAULT_DECODE_NODE_NAME = "VAEDecode";
const DEFAULT_UPSCALER_NODE_NAME = "LatentUpscale";

function getImageURL(filePath) {
  return `/shinich39/pkg39/image?path=${encodeURIComponent(filePath)}&rand=${Date.now()}`;
}

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
            pointerEvents: "none",
            zIndex: 999,
          });
          const originalCanvas = document.createElement("canvas");
          const originalCtx = originalCanvas.getContext("2d", {willReadFrequently: true});
          Object.assign(originalCanvas.style, {
            position: "absolute",
            maxWidth: "100%",
            maxHeight: "100%",
            pointerEvents: "auto",
          });
          const maskCanvas = document.createElement("canvas");
          const maskCtx = maskCanvas.getContext("2d", {willReadFrequently: true});
          Object.assign(maskCanvas.style, {
            position: "absolute",
            mixBlendMode: "initial",
            opacity: 0.7,
            maxWidth: "100%",
            maxHeight: "100%",
            pointerEvents: "auto",
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
          w.brushSize = 100;
          w.drawingMode = false;
          w.movingMode = false;
          w.lastx = -1;
          w.lasty = -1;
          w.lasttime = 0;

          setMaskWidgetEvents.apply(this, [w]);

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

    this.pkg39.loadImageByFilePath = (async function(filePath) {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }

      filePath = filePath.replace(/[\\\/]+/g, "/");
      let dirPath = filePath.replace(/\/[^\/]+$/, "/");
      let basename = filePath.replace(dirPath, "");
      let filename = basename.replace(/.[^.]+$/, "");

      this.pkg39.resetCounter();
      await this.pkg39.updateDirPath(dirPath);
      await this.pkg39.loadImages();

      let idx = this.pkg39.loadedImages.findIndex(e => {
        return e.imageName === filename;
      });

      if (idx === -1) {
        idx = 0;
      }

      this.pkg39.updateIndex(idx);
      this.pkg39.clearImage();
      this.pkg39.selectImage();
      this.pkg39.renderImage();
      await this.pkg39.renderWorkflow();
      renderCanvas();
      selectNode(this);
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
      w.originalCtx.clearRect(0,0,w.originalCanvas.width,w.originalCanvas.height);
      w.maskCtx.clearRect(0,0,w.maskCanvas.width,w.maskCanvas.height);
      w.originalImg.src = null;
      w.maskImg.src = null;
    }).bind(this);

    this.pkg39.clearImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      this.pkg39.clearMask();
      this.pkg39.removeWorkflow();
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
      this.pkg39.FILENAME.prevValue = this.pkg39.selectedImage.imageName;
      this.pkg39.FILENAME.value = this.pkg39.selectedImage.imageName;
    }).bind(this);

    this.pkg39.renderImage = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      if (!this.pkg39.selectedImage) {
        return;
      }
      try {
        const { imagePath, maskPath, imageName, } = this.pkg39.selectedImage;
        this.pkg39.MASK.originalImg.src = getImageURL(imagePath);
        this.pkg39.MASK.maskImg.src = getImageURL(maskPath || imagePath);
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    // render image workflow
    this.pkg39.renderWorkflow = (async function() {
      if (!this.pkg39.isInitialized) {
        throw new Error("pkg39 has not been initialized.");
      }
      if (!this.pkg39.selectedImage) {
        return;
      }
      try {
        this.pkg39.loadWorkflow();
      } catch(err) {
        console.error(err);
      }
    }).bind(this);

    this.pkg39.loadWorkflow = (function() {
      const self = this;

      let { selectedImage, selectedIndex } = this.pkg39 ?? {};
      if (!selectedImage || !selectedImage.workflow) {
        return;
      }

      const convertNodeMaps = function(nms) {
        let newNodeMaps = [];
        for (const nm of nms) {
          let newNodeMap = [];
          for (const nl of nm) {
            let newNodes = [];
            for (const n of nl) {
              let node = app.graph._nodes.find(e => getPreviousId(e) === n.id);
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

      // remove "Load image node" in virtual canvas
      // remove "Command node" in virtual canvas
      function convertWorkflow(w) {
        w = JSON.parse(JSON.stringify(w));
        let prevConnectedTargets = [];
        let nodeIds = [];
        for (let i = w.nodes.length - 1; i >= 0; i--) {
          const n = w.nodes[i];
          const id = n.id;
          // remove nodes
          if (n.type === "LoadImage39") {
            w.nodes.splice(i, 1);
            nodeIds.push(id);
          } else if (n.type === "Command39") {
            // command does not have input and outputs
            w.nodes.splice(i, 1);
          }
        }

        let linkIds = [];
        for (let i = w.links.length - 1; i >= 0; i--) {
          const l = w.links[i];
          const type = l[5];
          const id = l[0];
          const originId = l[1];
          const targetId = l[3];
          // remove links
          if (nodeIds.indexOf(originId) > -1) {
            w.links.splice(i, 1);
            linkIds.push(id);
            prevConnectedTargets.push({
              type: type,
              id: targetId,
            }); 
          }
        }

        for (const node of w.nodes) {
          // remove input link
          if (node.inputs) {
            for (const input of node.inputs) {
              if (!input.link) {
                continue;
              }
              if (linkIds.indexOf(input.link) > -1) {
                input.link = null
              }
            }
          }

          // remove output links
          // if (node.outputs) {
          //   for (const output of node.outputs) {
          //     if (output.links) {
          //       for (let i = output.links.length - 1; i >= 0; i--) {
          //         const linkId = output.links[i];
          //         if (linkIds.indexOf(linkId) > -1) {
          //           output.links.splice(i, 1);
          //         }
          //       }
          //     }
          //   }
          // }
        }

        return [w, prevConnectedTargets];
      }

      let width = selectedImage.width;
      let height = selectedImage.height
      let prompt = selectedImage.prompt;
      let [workflow, prevConnectedTargets] = convertWorkflow(selectedImage.workflow);
      let samplerNodes = getSamplerNodes({ workflow, prompt });
      let nodeMaps = samplerNodes.map(sampler => getNodeMap({ workflow, sampler }));
      nodeMaps.sort((a, b) => b.length - a.length); // put the map in long order

      // create virtual canvas
      let graph = new LGraph(workflow);
      let canvas = new LGraphCanvas(null, graph, { skip_events: true, skip_render: true });

      // set properties
      for (const n of graph._nodes) {
        n.properties.pkg39 = {
          loaderId: this.id,
          previousId: n.id,
          isEnabled: n.mode === 0,
        }
        if (DEFAULT_NODE_COLORS) {
          n.color = DEFAULT_NODE_COLORS.yellow.color;
          n.bgcolor = DEFAULT_NODE_COLORS.yellow.bgcolor;
          n.groupcolor = DEFAULT_NODE_COLORS.yellow.groupcolor;
        }

        // disable pin
        // lock => Symbol()?
        if (n.flags) {
          n.flags.pinned = false;
        }
      }

      graph.arrange(DEFAULT_MARGIN_X);
      // graph.arrange(DEFAULT_MARGIN_Y, LiteGraph.VERTICAL_LAYOUT);
      canvas.selectNodes();
      canvas.copyToClipboard();

      // set mouse point for paste point
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

      // convert to original nodeMap from image nodeMap
      // nodeMaps[ nodeMap[ nodeList[ node{}, node{} ] ] ]
      nodeMaps = convertNodeMaps(nodeMaps);
      let nodeMapIndex;
      let nodeMap; 

      const changeNodeMap = function(n) {
        nodeMapIndex = Math.floor(Math.min(0, Math.max(n ?? 0, nodeMaps.length - 1)));
        nodeMap = nodeMaps[nodeMapIndex];

        // enable nodes in flow
        for (const oNode of app.graph._nodes) {
          if (!isPkg39Node(oNode)) {
            continue;
          }
          let isEnabled = false;
          if (oNode.properties.pkg39.isEnabled) {
            for (const nodeList of nodeMap) {
              for (const vNode of nodeList) {
                if (oNode.id === vNode.id) {
                  isEnabled = true;
                  break;
                }
              }
              if (isEnabled) {
                break;
              }
            }
          }
          // bypass node that out of flow
          oNode.mode = isEnabled ? 0 : 4; 
        }
      }

      const returnNodeObject = function(node) {
        if (!node) {
          return;
        }

        let totalInputs = 0;
        let totalOutputs = 0; 
        let connectedInputs = 0;
        let connectedOutputs = 0;
        if (node && node.inputs) {
          for (const input of node.inputs) {
            totalInputs++;
            if (input.link) {
              connectedInputs++;
            }
          }
        }

        if (node && node.outputs) {
          for (const output of node.outputs) {
            totalOutputs++;
            if (output.links && output.links.length > 0) {
              connectedOutputs++;
            }
          }
        }

        return {
          isPkg39: true,
          isEnd: connectedOutputs < 1, 
          isStart: connectedInputs < 1,
          hasInput: totalInputs > 0,
          hasOutput: totalOutputs > 0,
          hasConnectedInput: connectedInputs > 0,
          hasConnectedOutput: connectedOutputs > 0,
          id: node.id,
          title: node.title,
          node: node,
          type: node.comfyClass || node.type,
          getValues: function() {
            let result = {};
            if (node.widgets) {
              for (const widget of node.widgets) {
                result[widget.name] = widget.value;
              }
            }
            return result;
          },
          setValues: function(values) {
            values = values ?? {};
            if (node.widgets) {
              for (const [key, value] of Object.entries(values)) {
                const widget = node.widgets.find(e => e.name === key);
                if (widget) {
                  widget.value = value;
                }
              }
            }
            return true;
          },
          getValue: function(name) {
            if (!name) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            const widget = node.widgets?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            return widget?.value ?? null;
          },
          setValue: function(name, value) {
            if (!name) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            const widget = node.widgets?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (widget) {
              widget.value = value;
            }
            return true;
          },
          replace: function(targetNode, isInheritValues = false) {
            if (!targetNode) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            if (targetNode.isPkg39) {
              targetNode = targetNode.node;
            }
            if (node.type !== targetNode.type) {
              console.error(new Error(`Target node type is not ${node.type}`));
              return false;
            }

            // inherit connected inputs
            if (node.inputs) {
              for (const input of node.inputs) {
                let outputNode;
                let outputSlot;
                if (input.link) {
                  const link = app.graph.links.find(e => e && e.id === input.link);
                  outputNode = app.graph._nodes.find(e => e.id === link.origin_id);
                  outputSlot = link.origin_slot;

                  const inputSlot = node.findInputSlot(input.name);
                  node.disconnectInput(inputSlot);

                  const nodeSlot = targetNode.findInputSlot(input.name);
                  if (nodeSlot > -1) {
                    outputNode.connect(outputSlot, targetNode, nodeSlot);
                  }
                }
              }
            }

            // inherit connected outputs
            if (node.outputs && app.graph.links) {
              for (const output of node.outputs) {
                if (output.links) {
                  // fix error link size updated during disconnect
                  const links = JSON.parse(JSON.stringify(output.links));
                  for (const linkId of links) {
                    const link = app.graph.links.find(e => e && e.id === linkId);
                    const inputNode = app.graph._nodes.find(e => e.id === link.target_id);
                    const inputSlot = link.target_slot;
  
                    inputNode.disconnectInput(inputSlot);
  
                    const nodeSlot = targetNode.findOutputSlot(output.name);
                    if (nodeSlot > -1) {
                      targetNode.connect(nodeSlot, inputNode, inputSlot);
                    }
                  }
                }
              }
            }

            // inherit widget values
            if (isInheritValues) {
              if (node.widgets && targetNode.widgets) {
                for (const widget of node.widgets) {
                  const w = targetNode.widgets.find(e => e.name === widget.name);
                  if (w) {
                    w.value = widget.value
                  }
                }
              }
            }

            app.graph.setDirtyCanvas(false, true);

            return true;
          },
          getInputNode: function(name) {
            if (!name) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            const inputNode = node;
            const input = inputNode.inputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (!input || !input.link) {
              return;
            }

            const link = app.graph.links?.find(e => e && e.id === input.link);
            if (!link) {
              return;
            }

            const outputNode = app.graph._nodes.find(e => e.id === link.origin_id);
            if (!outputNode) {
              return;
            }

            return returnNodeObject(outputNode);
          },
          getOutputNode: function(name) {
            if (!name) {
              console.error(new Error(`Argument not found.`));
              return [];
            }
            const outputNode = node;
            const output = outputNode.outputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (!output || !output.links) {
              return [];
            }

            const links = app.graph.links?.filter(e => e && output.links.indexOf(e.id) > -1);
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
          connectInput: function(name, outputNode) {
            if (!name || !outputNode) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            if (outputNode.isPkg39) {
              outputNode = outputNode.node;
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
          connectOutput: function(name, inputNodes) {
            if (!name || !inputNodes) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            if (!Array.isArray(inputNodes)) {
              inputNodes = [inputNodes];
            }
            const outputNode = node;
            const output = outputNode.outputs?.find(e => e.name === name || e.type.toUpperCase() === name.toUpperCase());
            if (output) {
              const outputSlot = outputNode.findOutputSlot(output.name);
              const outputType = output.type.toUpperCase();
              for (let inputNode of inputNodes) {
                if (inputNode.isPkg39) {
                  inputNode = inputNode.node;
                }
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
            }
            return true;
          },
          remove: function() {
            app.graph.remove(node);
          },
          disable: function() {
            node.mode = 4;
          },
          enable: function() {
            node.mode = 0;
          },
          putOnRight: function(targetNode) {
            if (!targetNode) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            if (targetNode.isPkg39) {
              targetNode = targetNode.node;
            }
            node.pos[0] = targetNode.pos[0] + targetNode.size[0] + DEFAULT_MARGIN_X;
            node.pos[1] = targetNode.pos[1];
          },
          putOnBottom: function(targetNode) {
            if (!targetNode) {
              console.error(new Error(`Argument not found.`));
              return false;
            }
            if (targetNode.isPkg39) {
              targetNode = targetNode.node;
            }
            node.pos[0] = targetNode.pos[0];
            node.pos[1] = targetNode.pos[1] + targetNode.size[1] + DEFAULT_MARGIN_Y;
          },
          moveToRight: function() {
            let isChanged = true;
            while(isChanged) {
              isChanged = false;
              for (const n of app.graph._nodes) {
                if (node.id === n.id) {
                  continue;
                }
                const top = n.pos[1];
                const bottom = n.pos[1] + n.size[1];
                const left = n.pos[0];
                const right = n.pos[0] + n.size[0];
                const isCollisionX = left <= node.pos[0] + node.size[0] && 
                  right >= node.pos[0];
                const isCollisionY = top <= node.pos[1] + node.size[1] && 
                  bottom >= node.pos[1];

                if (isCollisionX && isCollisionY) {
                  node.pos[0] = right + DEFAULT_MARGIN_X;
                  isChanged = true;
                }
              }
            }
          },
          moveToBottom: function() {
            let isChanged = true;
            while(isChanged) {
              isChanged = false;
              for (const n of app.graph._nodes) {
                if (node.id === n.id) {
                  continue;
                }
                const top = n.pos[1];
                const bottom = n.pos[1] + n.size[1];
                const left = n.pos[0];
                const right = n.pos[0] + n.size[0];
                const isCollisionX = left <= node.pos[0] + node.size[0] && 
                  right >= node.pos[0];
                const isCollisionY = top <= node.pos[1] + node.size[1] && 
                  bottom >= node.pos[1];

                if (isCollisionX && isCollisionY) {
                  node.pos[1] = bottom + DEFAULT_MARGIN_Y;
                  isChanged = true;
                }
              }
            }
          },
          hires: function(w, h) {
            return createHiresNodes.apply(this, [w, h]);
          },
          encode: function() {
            return createEncodeNode.apply(this);
          },
          decode: function() {
            return createDecodeNode.apply(this);
          },
          save: function() {
            return createSaveNode.apply(this);
          },
        }
      }

      // type or title
      const findNodesByName = function(str, options) {
        if (typeof options !== "object") {
          options = {};
        }

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

        if (!options.global) {
          if (!options.reverse) {
            // default
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
        } else {
          if (!options.reverse) {
            for (let i = 0; i < nodeMaps.length; i++) {
              for (let j = 0; j < nodeMaps[i].length; j++) {
                const n = nodeMaps[i][j];
                saveNode(n);
              }
            }
          } else {
            for (let i = 0; i < nodeMaps.length; i++) {
              for (let j = nodeMaps[i].length - 1; j >= 0; j--) {
                const n = nodeMaps[i][j];
                saveNode(n);
              }
            }
          }
        }

        // covert to pkg39 node
        nodes = nodes
          .map(e => returnNodeObject(e))
          .filter(e => !!e);

        // sort original nodes in ascending order
        nodes.sort((a, b) => a.node.id - b.node.id);

        return nodes;
      }

      const findNodeByName = function(str, options) {
        if (typeof options !== "object") {
          options = {
            reverse: false,
            global: false,
          }
        }
        
        function isValid(e) {
          return (e.title && e.title === str) ||
            (e.comfyClass && e.comfyClass.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase()) ||
            (e.type && e.type.replace(/\s/g, "").toUpperCase() === str.replace(/\s/g, "").toUpperCase());
        }

        let node;
        if (!options.reverse) {
          for (let i = 0; i < nodeMap.length; i++) {
            for (const n of nodeMap[i]) {
              if (isValid(n)) {
                node = n;
                break;
              }
            }
            if (node) {
              break;
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
            if (node) {
              break;
            }
          }
        }

        return returnNodeObject(node);
      }

      const findNodeById = function(id) {
        const n = app.graph._nodes.find(e => e && e.id === id);
        return returnNodeObject(n);
      }

      const isExistsInNodeMap = function(node) {
        for (const nodeMap of nodeMaps) {
          for (const nodeList of nodeMap) {
            for (const n of nodeList) {
              if (n.id === node.id) {
                return true;
              }
            }
          }
        }
        return false;
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

      const removeAllNodes = function() {
        for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
          const n = app.graph._nodes[i];
          if (getLoaderId(n) === self.id) {
            app.graph.remove(n);
          }
        }
      }

      const removeOutNodes = function() {
        for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
          const n = app.graph._nodes[i];
          if (getLoaderId(n) === self.id && !isExistsInNodeMap(n)) {
            app.graph.remove(n);
          }
        }
      }

      const bypassAllNodes = function(b = true) {
        for (const n of app.graph._nodes) {
          if (getLoaderId(n) === self.id) {
            n.mode = b ? 4 : 0;
          }
        }
      }

      const bypassOutNodes = function(b = true) {
        for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
          const n = app.graph._nodes[i];
          if (getLoaderId(n) === self.id && !isExistsInNodeMap(n)) {
            n.mode = b ? 4 : 0;
          }
        }
      }

      const createNode = function(name, values, options) {
        values = values ?? {};
        options = { select: true, shiftY: 0, before: false, ...(options || {}) };
        const node = LiteGraph.createNode(name);
        if (!node) {
          throw new Error(`${name} node can not create.`);
        }

        node.properties.pkg39 = {
          loaderId: self.id,
          previousId: -1,
          isEnabled: true,
        }

        if (DEFAULT_NODE_COLORS) {
          node.color = DEFAULT_NODE_COLORS.yellow.color;
          node.bgcolor = DEFAULT_NODE_COLORS.yellow.bgcolor;
          node.groupcolor = DEFAULT_NODE_COLORS.yellow.groupcolor;
        }

        if (node.widgets) {
          for (const [key, value] of Object.entries(values)) {
            const widget = node.widgets.find(e => e.name === key);
            if (widget) {
              widget.value = value;
            }
          }
        }

        app.graph.add(node);

        if (options.select) {
          app.canvas.selectNode(node, false);
        }

        const _node = returnNodeObject(node);
        _node.putOnRight(self);
        _node.moveToBottom();
        return _node;
      }

      const createHiresNodes = function(w, h) {
        if (!w) {
          return false;
        }
        if (!this.hasOutput) {
          return false;
        }
        if (!this.node.outputs.find(e => e.type === "LATENT")) {
          return false;
        }
        if (!h) {
          h = Math.floor(height * w);
          w = Math.floor(width * w);
        }

        const isSampler = ["KSampler", "KSamplerAdvanced"].indexOf(this.type) > -1; 
        const node = this.node;
        const outputNodes = this.getOutputNode("LATENT");
        const inputNodes = [];
        if (node.inputs) {
          for (const input of node.inputs) {
            const link = app.graph.links?.find(e => e && e.id === input.link);
            if (link && link.type) {
              const n = app.graph._nodes.find(e => e.id === link.origin_id);
              inputNodes.push({
                name: input.name || input.type,
                type: input.type,
                node: returnNodeObject(n),
              });
            }
          }
        }

        const widgetValues = [];
        if (node.widgets) {
          for (const widget of node.widgets) {
            widgetValues.push({
              name: widget.name,
              value: widget.value,
            });
          }
        }

        const upscaler = createNode(DEFAULT_UPSCALER_NODE_NAME, {
          width: w,
          height: h,
        });
        upscaler.putOnBottom(this);
        upscaler.moveToBottom();
        
        let sampler;
        if (isSampler) {
          sampler = createNode(this.type, this.getValues());
        } else {
          sampler = createNode(DEFAULT_SAMPLER_NODE_NAME);
        }
        sampler.putOnBottom(this);
        sampler.moveToBottom();

        this.connectOutput("LATENT", upscaler);

        // connect sampler inputs
        for (const e of inputNodes) {
          if (e.type !== "LATENT") {
            sampler.connectInput(e.name, e.node);
          }
        }

        // connect upscaler -> sampler
        upscaler.connectOutput("LATENT", sampler);

        // connect sampler -> outputNodes
        sampler.connectOutput("LATENT", outputNodes);
        
        return [upscaler, sampler];
      }

      const createEncodeNode = function() {
        if (!this.hasOutput) {
          return false;
        }
        if (!this.node.outputs.find(e => e.type === "IMAGE")) {
          return false;
        }

        const node = createNode(DEFAULT_ENCODE_NODE_NAME);
        node.putOnRight(this);
        node.moveToBottom();

        this.connectOutput("IMAGE", node);

        return node;
      }

      const createDecodeNode = function() {
        if (!this.hasOutput) {
          return false;
        }
        if (!this.node.outputs.find(e => e.type === "LATENT")) {
          return false;
        }

        const node = createNode(DEFAULT_DECODE_NODE_NAME);
        node.putOnRight(this);
        node.moveToBottom();

        this.connectOutput("LATENT", node);

        return node;
      }

      const createSaveNode = function() {
        if (!this.hasOutput) {
          return false;
        }
        if (!this.node.outputs.find(e => e.type === "IMAGE")) {
          return false;
        }

        const node = createNode(DEFAULT_SAVE_NODE_NAME);
        node.putOnRight(this);
        node.moveToBottom();

        this.connectOutput("IMAGE", node);

        return node;
      }

      const loadNextImage = async function() {
        self.pkg39.updateIndex();
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        await self.pkg39.renderWorkflow();
        renderCanvas();
      }

      const prevConnectedLinks = prevConnectedTargets.map(t => {
        const node = returnNodeObject(app.graph._nodes.find(e => getPreviousId(e) === t.id));
        return {
          node,
          type: t.type,
        }
      }).filter(e => !!e.node);

      ;(() => {
        try {
          // variables
          const MAIN = returnNodeObject(self);
          const DIR_PATH = selectedImage.dirPath;
          const INDEX = selectedIndex;
          const IMAGE_PATH = selectedImage.imagePath;
          const IMAGE_NAME = selectedImage.imageName;
          const MASK_PATH = selectedImage.maskPath;
          const MASK_NAME = selectedImage.maskName;

          const STATE = self.pkg39.state;
          const SEED = getRandomSeed();

          const DATE = new Date();
          const YEAR = DATE.getFullYear();
          const MONTH = DATE.getMonth() + 1;
          const DAY = DATE.getDay();
          const HOURS = DATE.getHours();
          const MINUTES = DATE.getMinutes();
          const SECONDS = DATE.getSeconds();

          // const IS_INHERITED = prevConnectedLinks.length > 0;
          const countImages = self.pkg39.loadedImages.length;
          const countQueues = self.pkg39.countQueues;
          const countLoops = self.pkg39.countLoops;
          const countErrors = self.pkg39.countErrors;

          // set nodeMap to nodeMaps[0]
          changeNodeMap(0);

          // re-connect load image node
          for (const { node, type } of prevConnectedLinks) {
            MAIN.connectOutput(type, node);
          }

          // methods
          const flow = (n) => { changeNodeMap(n); };
          const find = (name) => findNodesByName(name);
          const findLast = (name) => findNodesByName(name, { reverse: true });
          const findOne = (name) => findNodeByName(name);
          const findOneLast = (name) => findNodeByName(name, { reverse: true });
          const findOneById = (id) => findNodeById(id);
          const enable = (name) => bypassNodes(Array.isArray(name) ? name : findNodesByName(name), false);
          const enableOut = () => bypassOutNodes(false);
          const enableAll = () => bypassAllNodes(false);
          const disable = (name) => bypassNodes(Array.isArray(name) ? name : findNodesByName(name), true);
          const disableOut = () => bypassOutNodes(true);
          const disableAll = () => bypassAllNodes(true);
          const remove = (name) => removeNodes(Array.isArray(name) ? name : findNodesByName(name));
          const removeOut = () => removeOutNodes();
          const removeAll = () => removeAllNodes();
          const create = (name, values, options) => createNode(name, values, options);
          const sound = () => playSound();
          const start = () => { startGeneration(); }
          const cancel = () => { cancelGeneration(); }
          const next = () => { loadNextImage(); }
          const loop = () => { setAutoQueue(); startGeneration(); }
          const stop = () => { unsetAutoQueue(); } // cancelGeneration();
          const loadDir = async (dirPath) => {
            if (typeof(dirPath) === "string") {
              self.pkg39.resetCounter();
              await self.pkg39.updateDirPath(dirPath);
              await self.pkg39.loadImages();
              self.pkg39.updateIndex(0);
              self.pkg39.clearImage();
              self.pkg39.selectImage();
              self.pkg39.renderImage();
              await self.pkg39.renderWorkflow();
              renderCanvas();
              selectNode(self);
            } else {
              throw new Error("loadDir argument must be String.");
            }
          }
          const loadFile = async (filePath) => {
            if (typeof(filePath) === "string") {
              self.pkg39.resetCounter();
              await self.pkg39.loadImageByFilePath(filePath);
            } else if (Array.isArray(filePath)) {
              self.pkg39.resetCounter();
              await self.pkg39.loadImageByFilePath(filePath[0]);
            } else {
              throw new Error("loadFile argument must be String.");
            }
          }

          // callbacks
          let onEnd = null;
          let onError = (err) => { console.error(err); };

          // execute
          let __command__ = getCommandValue();
          __command__ = `
try {
  ${__command__}
} catch(err) {
  onError(err);
}`;
          eval(__command__.trim());

          // set callback
          self.pkg39.onExecuted = onEnd;
        } catch(err) {
          console.error(err);
        }
      })();

      renderCanvas();
    }).bind(this);

    this.pkg39.removeWorkflow = (function() {
      try {
        const nodes = [];
        for (const n of app.graph._nodes) {
          const loaderId = getLoaderId(n);
          if (loaderId && loaderId === this.id) {
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
                imagePath: image["image_path"],
                imageName: image["image_name"],
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

		const onRemoved = this.onRemoved;
		this.onRemoved = function () {
      const id = this.id;

      for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
        const n = app.graph._nodes[i];
        if (getLoaderId(n) === id) {
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
        await self.pkg39.renderWorkflow();
        renderCanvas();
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
    idxWidget.callback = async function(v) {
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
        await self.pkg39.renderWorkflow();
        renderCanvas();
        selectNode(self);
      }, 256);
    }
  } catch(err) {
    console.error(err);
  }
}

function getCommandValue() {
  for (const node of app.graph._nodes) {
    if (isCommandNode(node)) {
      const v = node.widgets?.[0].value;
      if (v && v !== "") {
        return v;
      }
    }
  }
  return "";
}

async function promptQueuedHandler() {
  let isChanged = false;
  let isAutoQueue = isAutoQueueMode();
  let isErrored = isErrorOccurred();

  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      const countImages = node.pkg39.loadedImages.length;
      const prevIndex = node.pkg39.getIndex();
      node.pkg39.updateIndex();
      const currIndex = node.pkg39.getIndex();
      if (prevIndex !== currIndex && countImages > 0) {
        isChanged = true;
        node.pkg39.clearImage();
        node.pkg39.selectImage();
        node.pkg39.renderImage();
        await node.pkg39.renderWorkflow();
        renderCanvas();
      }
    }
  }

  // ignore ComfyUI error messages
  if (isAutoQueue && isErrored && isChanged) {
    hideError();
    setTimeout(() => {
      if (getQueueSize() < 1) {
        startGeneration();
      }
    }, 1024);
  }
}

async function executedHandler({ detail }) {
  if (!detail?.output?.images) {
    return;
  }

  const images = detail.output.images.map(e => {
    return parseExecuteResponse(e).filePath;
  });

  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node) && typeof node.pkg39.onExecuted === "function") {
      await node.pkg39.onExecuted(images);
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

function setMaskWidgetEvents(widget) {
  const node = this;
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
    const canvasScale = app.canvas.ds.scale;

    this.brush.style.backgroundColor = "rgba(0,0,0,0.2)";
    this.brush.style.boxShadow = "0 0 0 1px white";
    this.brush.style.borderRadius = "50%";
    this.brush.style.MozBorderRadius = "50%";
    this.brush.style.WebkitBorderRadius = "50%";
    this.brush.style.position = "absolute";
    this.brush.style.zIndex = 8889;
    this.brush.style.pointerEvents = "none";
    this.brush.style.width = this.brushSize * 2 * this.zoomRatio * canvasScale + "px";
    this.brush.style.height = this.brushSize * 2 * this.zoomRatio * canvasScale + "px";
    this.brush.style.left = (this.cursorX - this.brushSize * this.zoomRatio * canvasScale) + "px";
    this.brush.style.top = (this.cursorY - this.brushSize * this.zoomRatio * canvasScale) + "px";
  }

  function hideBrush() {
    if (this.brush) {
      this.brush.parentNode.removeChild(this.brush);
      this.brush = null;
    }
  }

  function handleWheelEvent(self, event) {
    event.preventDefault();

    const imageScale = this.originalCanvas.offsetWidth / this.originalCanvas.width;

    // adjust brush size
    if(event.deltaY < 0)
      self.brushSize = Math.min(self.brushSize+(2 / imageScale), 100 / imageScale);
    else
      self.brushSize = Math.max(self.brushSize-(2 / imageScale), 1);

    self.showBrush();

    document.getElementById("graph-canvas").focus();
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

    // click wheel
    if (self.movingMode) {
      if (
        typeof event.movementX === "number" && 
        typeof event.movementY === "number"
      ) {
        app.canvas.ds.mouseDrag(
          event.movementX,
          event.movementY,
        );
  
        app.canvas.draw(true, true);
        return;
      }
    }

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

    if (event.ctrlKey) {
      if (event.buttons == 1) {
        self.mousedown_x = event.clientX;
        self.mousedown_y = event.clientY;

        self.mousedown_panX = self.panX;
        self.mousedown_panY = self.panY;
      }
      return;
    }

    selectNode(node);

    if (event.buttons == 4) {
      self.movingMode = true;
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
    formData.append('path', node.pkg39.selectedImage.imagePath);

    const response = await api.fetchApi('/shinich39/pkg39/save_mask_image', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    // set to loaded image
    if (node?.pkg39?.selectedImage) {
      node.pkg39.selectedImage.maskName = data.mask_name;
      node.pkg39.selectedImage.maskPath = data.mask_path;
    }
  }

  async function removeMaskEvent() {
    await api.fetchApi('/shinich39/pkg39/remove_mask_image', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: node.pkg39.selectedImage.imagePath,
      }),
    });

    // set to loaded image
    if (node?.pkg39?.selectedImage) {
      node.pkg39.selectedImage.maskName = null;
      node.pkg39.selectedImage.maskPath = null;
    }

    // reload mask
    this.maskImgLoaded = false;
    this.maskCtx.clearRect(0,0,this.maskCanvas.width,this.maskCanvas.height);
    this.maskImg.src = getImageURL(node.pkg39.selectedImage.imagePath);
  }
}

async function keyDownEvent(e) {
  const { key, ctrlKey, metaKey, shiftKey } = e;
  if (key === "ArrowLeft") {
    e.preventDefault();
    e.stopPropagation();
    this.pkg39.resetCounter();
    this.pkg39.updateIndex(this.pkg39.INDEX.value - 1);
    this.pkg39.clearImage();
    this.pkg39.selectImage();
    this.pkg39.renderImage();
    await this.pkg39.renderWorkflow();
    renderCanvas();
    selectNode(this);
  } else if (key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    this.pkg39.resetCounter();
    this.pkg39.updateIndex(this.pkg39.INDEX.value + 1);
    this.pkg39.clearImage();
    this.pkg39.selectImage();
    this.pkg39.renderImage();
    await this.pkg39.renderWorkflow();
    renderCanvas();
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
    await this.pkg39.renderWorkflow();
    renderCanvas();
    selectNode(this);
  } else if (key === "-" || key === "=") {
    e.preventDefault();
    e.stopPropagation();
    let n = key === "-" ? 1 : -1;
    const prevScale = app.canvas.ds.scale;
    const nextScale = Math.max(0.5, Math.min(10, Math.round((prevScale - n) * 10) / 10));
    const cx = app.canvas.ds.element.width / 2;
    const cy = app.canvas.ds.element.height / 2;
    app.canvas.ds.changeScale(nextScale, [cx, cy]);
    app.canvas.graph.change();
    selectNode(this);

    // fix brush size
    if (this.pkg39?.MASK) {
      this.pkg39.MASK.showBrush();
    }
  } else if (key === " ") {
    if (this.pkg39?.MASK) {
      this.pkg39.MASK.movingMode = true;
      window.addEventListener("keyup", spaceBarUpEvent);
    }
  }
}

async function spaceBarUpEvent(e) {
  e.preventDefault();

  // remove event
  window.removeEventListener("keyup", spaceBarUpEvent);

  // reset all moving mode
  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      node.pkg39.MASK.movingMode = false;
    }
  }
}

function pointerUpEvent(e) {
  e.preventDefault();

  // reset all canvas
  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      const w = node.widgets?.find(e => e.name === "maskeditor");
      if (w) {
        // call save event
        if (w.drawingMode) {
          w.saveMaskEvent();
        }

        // select node
        if (w.movingMode) {
          selectNode(node);
          document.getElementById("graph-canvas").focus();
        }

        w.mousedown_x = null;
        w.mousedown_y = null;
        w.drawingMode = false;
        w.movingMode = false;
      }
    }
  }
}

// global event
document.addEventListener('pointerup', (event) => pointerUpEvent(event));

// after start a new queue
api.addEventListener("promptQueued", promptQueuedHandler);

// after image generated
api.addEventListener("executed", executedHandler);

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
        await node.pkg39.renderWorkflow();
        renderCanvas();

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
          await node.pkg39.renderWorkflow();
          renderCanvas();

          node.pkg39.DIR_PATH.isCallbackEnabled = true;
          node.pkg39.INDEX.isCallbackEnabled = true;
        })();
      }
    }
  },
});