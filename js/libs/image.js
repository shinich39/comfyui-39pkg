"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getSamplerNodes, getNodeMap } from "./parser.js";
import { initMaskEditor } from "./mask-editor.js";
import * as util from "./util.min.js";
import {
  getImageURL,
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
  parseObjectURL,
} from "./pkg39-utils.js";

const DEFAULT_NODE_COLORS = LGraphCanvas.node_colors;
const DEFAULT_MARGIN_X = 30;
const DEFAULT_MARGIN_Y = 60;

const DEFAULT_SAMPLER_NODE_NAME = "KSampler";
const DEFAULT_SAVE_NODE_NAME = "SaveImage";
const DEFAULT_ENCODE_NODE_NAME = "VAEEncode";
const DEFAULT_DECODE_NODE_NAME = "VAEDecode";
const DEFAULT_UPSCALER_NODE_NAME = "LatentUpscale";


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
        return e.origName === filename;
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

        // convert to pkg39 node
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
          const IMAGE_PATH = selectedImage.origPath;
          const IMAGE_NAME = selectedImage.origName;

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
    return parseObjectURL(e).filePath;
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
  } 
}

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