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
  getLoadId,
  getPrevNodeId,
  getRandomSeed,
  showError,
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

    this.pkg39.loadImageByPath = (async function(filePath) {
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
      this.pkg39.executeCommand();
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
      this.pkg39.clearWorkflow();
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

    this.pkg39.executeCommand = (function() {
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

      let { width, height, prompt, workflow } = selectedImage;
      let samplerNodes = getSamplerNodes({ workflow, prompt });

      // create virtual canvas
      let graph = new LGraph(workflow);
      let canvas = new LGraphCanvas(null, graph, { skip_events: true, skip_render: true });

      // parse workflow
      samplerNodes = samplerNodes.map(sampler => {
        const nodeMap = getNodeMap({ workflow, sampler });

        const samplers = nodeMap.reduce((acc, cur) => {
          for (const {id, type} of cur) {
            if (type === "KSampler" || type === "KSamplerAdvanced") {
              const node = graph._nodes.find(e => e.id === id);
              if (node) {
                acc.push(node);
              }
            }
          }
          return acc;
        }, []);

        return {
          samplers: samplers,
          nodeMap: nodeMap,
        }
      });

      // put the map in long order
      samplerNodes.sort((a, b) => b.map.length - a.map.length);

      const samplerMaps = samplerNodes.map(e => e.samplers);
      const nodeMaps = samplerNodes.map(e => e.nodeMap);

      // select longest flow
      const samplers = samplerMaps[0];
      const nodeMap = nodeMaps[0];
      
      // this.pkg39.selectedGraph = graph;
      // this.pkg39.selectedCanvas = canvas;

      // set properties
      for (const n of graph._nodes) {
        // set pkg39 properties
        n.properties.pkg39 = {
          loadId: this.id,
          nodeId: n.id,
          // isEnabled: n.mode === 0,
        }

        // set color to yellow
        if (DEFAULT_NODE_COLORS) {
          n.color = DEFAULT_NODE_COLORS.yellow.color;
          n.bgcolor = DEFAULT_NODE_COLORS.yellow.bgcolor;
          n.groupcolor = DEFAULT_NODE_COLORS.yellow.groupcolor;
        }

        // disable pin
        if (n.flags) {
          n.flags.pinned = false;
        }

        // lock => Symbol()?
      }

      // align nodes
      // graph.arrange(DEFAULT_MARGIN_X);
      // graph.arrange(DEFAULT_MARGIN_Y, LiteGraph.VERTICAL_LAYOUT);

      ;(() => {
        try {
          // global variables
          const MAIN = self;
          const DIR_PATH = selectedImage.dirPath;
          const INDEX = selectedIndex;
          const FILENAME = selectedImage.origName;
          const FILE_PATH = selectedImage.origPath;
          const WIDTH = width;
          const HEIGHT = height;

          const STATE = self.pkg39.state;

          const DATE = new Date();
          const YEAR = DATE.getFullYear();
          const MONTH = DATE.getMonth() + 1;
          const DAY = DATE.getDay();
          const HOURS = DATE.getHours();
          const MINUTES = DATE.getMinutes();
          const SECONDS = DATE.getSeconds();

          const SAMPLERS = samplers;
          const SAMPLER = samplers[samplers.length - 1];

          const countImages = self.pkg39.loadedImages.length;
          const countQueues = self.pkg39.countQueues;
          const countLoops = self.pkg39.countLoops;
          const countErrors = self.pkg39.countErrors;
   
          // global methods
          const sound = () => playSound();
          const start = () => startGeneration();
          const cancel = () => cancelGeneration();
          const next = () => loadNextImage();
          const stop = () => unsetAutoQueue();
          const loadDir = async (dirPath) => await loadDirByPath(dirPath); 
          const loadFile = async (filePath) => await loadFileByPath(filePath);

          const find = (query) => typeof query === "number" ? getNodeFromRC(query) : getNodeFromVC(query);
          const findLast = (query) => typeof query === "number" ? getNodeFromRC(query) : getNodeFromVC(query, true);
          const get = (node) => getWidgetValues(node);
          const set = (node, values) => setWidgetValues(node, values);

          // callbacks
          let onError = (err) => { console.error(err); };

          const commandNodes = app.graph._nodes.filter(e => isCommandNode(e));
          for (const commandNode of commandNodes) {
            // command variables
            const COMMAND_V = getWidgetValues(commandNode);
            const COMMAND_X = commandNode.pos[0];
            const COMMAND_Y = commandNode.pos[1];
            const COMMAND_W = commandNode.size[0];
            const COMMAND_H = commandNode.size[1];
            const SEED = getRandomSeed();

            // command methods
            const load = (srcNode, dstNode, name, replacements) => connectNodes(srcNode, dstNode, name, {
              x: COMMAND_X + COMMAND_W + DEFAULT_MARGIN_X,
              y: COMMAND_Y,
              replacements,
            });

            eval(`
try {
  ${COMMAND_V.command}
} catch(err) {
  onError(err);
}
            `.trim());

          }
        } catch(err) {
          console.error(err);
        }
        
        renderCanvas();
      })();

      function connectNodes(from, to, name, options) {
        if (typeof from === "string") {
          from = getNodeFromVC(from, true);
        }

        if (typeof to === "number") {
          to = app.graph._nodes.find(e => isNodeId(e, to));
        } else if (typeof to === "string") {
          to = app.graph._nodes.find(e => isNodeType(e, to));
        }

        if (from.type !== to?.type) {
          throw new Error(`${from.type} has not been matched with ${to?.type}`);
        }

        let isInput = false;
        let originNode;
        let originSlot;

        if (from.inputs) {
          const input = from.inputs.find(e => e.name === name);
          if (input) {
            isInput = true;

            const link = getInputLink(from, name);
            const n = link.originNode;
            const nodes = [n, ...getChildNodes(n)];
            const newNodes = createNodes(nodes, options);

            if (newNodes.length > 0) {
              originNode = newNodes[0];
              if (link.originName) {
                originSlot = originNode.findOutputSlot(link.originName);
              } else {
                originSlot = originNode.findOutputSlotByType(link.type);
              }
            }
          }
        }

        if (isInput) {
          if (originNode) {
            // find input
            if (to.inputs) {
              const input = to.inputs.find(e => e.name === name);

              // widget to input
              if (!input) {
                const widget = to.widgets?.find(e => e.name === name);
                if (widget) {
                  to.convertWidgetToInput(widget);
                }
              }
            }

            const targetId = to.id;
            const targetSlot = to.findInputSlot(name);
            originNode.connect(originSlot, targetId, targetSlot);
          }
        } else {
          let value;
          if (from.widgets) {
            const widget = from.widgets.find(e => e.name === name);
            if (widget) {
              value = widget.value;
            }
          }
          if (to.widgets) {
            const input = to.inputs?.find(e => e.name === name);
            const widget = to.widgets.find(e => e.name === name);
            if (widget) {
              if (input) {
                convertInputToWidget(to, widget);
              }
              widget.value = value;
            }
          }
        }
      }

      function loadNextImage() {
        self.pkg39.updateIndex();
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        self.pkg39.executeCommand();
      }

      async function loadDirByPath(dirPath) {
        self.pkg39.resetCounter();
        await self.pkg39.updateDirPath(dirPath);
        await self.pkg39.loadImages();
        self.pkg39.updateIndex(0);
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        self.pkg39.executeCommand();
        selectNode(self);
      }

      async function loadFileByPath(filePath) {
        self.pkg39.resetCounter();
        await self.pkg39.loadImageByPath(filePath);
      }

      function matchNode(node, query) {
        if (typeof query === "number") {
          return isNodeId(node, query);
        } else if (typeof query === "string") {
          return isNodeType(node, query.toLowerCase());
        } else {  
          return false;
        }
      }

      function isNodeId(node, id) {
        return node.id === id;
      }

      function isNodeType(node, name) {
        return (node.title && node.title.toLowerCase() === name) || 
          (node.comfyClass && node.comfyClass.replace(/\s/g, "").toLowerCase() === name) ||
          (node.type && node.type.replace(/\s/g, "").toLowerCase() === name);
      }

      function getNodeFromRC(id) {
        return app.graph._nodes.find(e => isNodeId(e, id));
      }

      function getNodeFromVC(name, reverse) {
        if (!reverse) {
          for (let i = 0; i < nodeMap.length; i++) {
            const nodes = nodeMap[i];
            for (const n of nodes) {
              const node = graph._nodes.find(e => e.id === n.id);
              if (!node) {
                continue;
              }
              if (isNodeType(node, name)) {
                return graph._nodes.find(e => e.id === node.id);
              }
            }
          }
        } else {
          for (let i = nodeMap.length - 1; i >= 0; i--) {
            const nodes = nodeMap[i];
            for (const n of nodes) {
              const node = graph._nodes.find(e => e.id === n.id);
              if (!node) {
                continue;
              }
              if (isNodeType(node, name)) {
                return graph._nodes.find(e => e.id === node.id);
              }
            }
          }
        }
      }

      function getWidgetValues(node) {
        let result = {};
        if (node.widgets) {
          for (const widget of node.widgets) {
            result[widget.name] = widget.value;
          }
        }
        return result;
      }

      function setWidgetValues(node, values) {
        if (node.widgets) {
          for (const [key, value] of Object.entries(values)) {
            const widget = node.widgets.find(e => e.name === key);
            if (widget) {
              widget.value = value;
            }
          }
        }
      }

      function getInputNodes(node) {
        let result = {};
        if (node.inputs) {
          for (const input of node.inputs) {
            const link = getInputLink(node, input.name);
            const n = link.originNode;
            result[input.name] = [n, ...getChildNodes(n)];
          }
        }
        return result;
      }

      function createNodes(nodes, options = {}) {
        let x = options.x ?? 0;
        let y = options.y ?? 0;
        let replaceNodes = options.replacements ?? [];

        if (Array.isArray(replaceNodes)) {
          replaceNodes = replaceNodes;
        } else if (replaceNodes) {
          replaceNodes = [replaceNodes];
        }

        // replacements to nodes
        replaceNodes = replaceNodes.map(e => {
          if (typeof e === "object") {
            return e;
          } else {
            return app.graph._nodes.find(n => matchNode(n, e));
          }
        });

        replaceNodes = replaceNodes.reduce((a, c) => {
          a.push({
            isReplaced: false,
            id: c.id,
            type: c.type,
            node: c,
            inputs: [],
            outputs: [],
          });
          return a;
        }, []);

        let filteredNodes = [];
        for (const node of nodes) {
          const rep = replaceNodes.find(e => !e.isReplaced && e.type === node.type);
          if (!rep) {
            filteredNodes.push(node);
            continue;
          }

          rep.isReplaced = true;

          const { inputs, outputs } = rep;

          if (node.inputs) {
            for (const input of node.inputs) {
              if (!input.link) {
                continue;
              }

              const link = graph.links.find(e => e && e.id === input.link);
              if (!link) {
                continue;
              }

              const originId = link.origin_id;
              const originSlot = link.origin_slot;
              const targetId = rep.id;
              const targetSlot = link.target_slot;

              inputs.push([originId,originSlot,targetId,targetSlot]);
            }
          }

          if (node.outputs) {
            for (const output of node.outputs) {
              if (!output.links) {
                continue;
              }
              for (const linkId of output.links) {
                if (!linkId) {
                  continue;
                }

                const link = graph.links.find(e => e && e.id === linkId);
                if (!link) {
                  continue;
                }

                const originId = rep.id;
                const originSlot = link.origin_slot;
                const targetId = link.target_id;
                const targetSlot = link.target_slot;

                outputs.push([originId,originSlot,targetId,targetSlot]);
              }
            }
          }
        }

        if (filteredNodes.length > 0) {
          canvas.selectNodes(filteredNodes);
          canvas.copyToClipboard();
  
          // set position
          setCanvasPointer(x, y);
    
          // paste to original canvas
          app.canvas.pasteFromClipboard();
          app.canvas.deselectAllNodes();
        }

        let newNodes = [];
        for (const node of filteredNodes) {
          const newNode = app.graph._nodes.find(e => {
            return e?.properties?.pkg39 &&
              e.properties.pkg39.nodeId === node.id && 
              !e.properties.pkg39.isConnected;
          });

          if (newNode) {
            newNodes.push(newNode);

            // set properties
            newNode.properties.pkg39.isConnected = true;
          }
        }

        // re-connect to replacements
        for (const r of replaceNodes) {
          const { node, inputs, outputs } = r;
          
          for (const input of inputs) {
            const originNode = newNodes.find(e => e.properties.pkg39.nodeId === input[0]);
            const originSlot = input[1];
            const targetId = input[2];
            const targetSlot = input[3];
            if (originNode) {
              originNode.connect(originSlot, targetId, targetSlot);
            }
          }

          for (const input of outputs) {
            const originNode = node;
            const originSlot = input[1];
            const targetNode = newNodes.find(e => e.properties.pkg39.nodeId === input[2]);
            const targetSlot = input[3];
            if (targetNode) {
              const targetId = targetNode.id;
              originNode.connect(originSlot, targetId, targetSlot);
            }
          }
        }

        // align to bottom
        for (const node of newNodes) {
          moveToBottom(node);
        }

        return newNodes;
      }

      function convertInputToWidget(node, widget) {
        showWidget(widget);
        const sz = node.size;
        node.removeInput(node.inputs.findIndex((i) => i.widget?.name === widget.name));
      
        for (const widget of node.widgets) {
          widget.last_y -= LiteGraph.NODE_SLOT_HEIGHT;
        }
      
        // Restore original size but grow if needed
        node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])]);

        function showWidget(widget) {
          widget.type = widget.origType;
          widget.computeSize = widget.origComputeSize;
          widget.serializeValue = widget.origSerializeValue;
        
          delete widget.origType;
          delete widget.origComputeSize;
          delete widget.origSerializeValue;
        
          // Hide any linked widgets, e.g. seed+seedControl
          if (widget.linkedWidgets) {
            for (const w of widget.linkedWidgets) {
              showWidget(w);
            }
          }
        }
      }

      function getInputLink(node, inputName) {
        const input = node.inputs?.find(e => e.name.toLowerCase() === inputName.toLowerCase());
        if (!input || !input.link) {
          return;
        }

        const inputSlot = node.findInputSlot(input.name);
        const links = graph.links.filter(e => e);
        const link = links.find(e => e.target_id === node.id && e.target_slot === inputSlot);
        if (!link) {
          return;
        }

        const originNode = graph._nodes.find(e => e.id === link.origin_id);
        if (!originNode) {
          return;
        }

        const originSlot = link.origin_slot;
        const originOutput = originNode?.outputs?.[originSlot];
        const originName = originOutput?.name;

        return {
          type: link.type,
          originNode,
          originSlot,
          originName,
          targetNode: node,
          targetSlot: inputSlot,
          targetName: input.name,
        }
      }

      function putOnRight(anchorNode, targetNode) {
        targetNode.pos[0] = anchorNode.pos[0] + anchorNode.size[0] + DEFAULT_MARGIN_X;
        targetNode.pos[1] = anchorNode.pos[1];
      }

      function putOnBottom(anchorNode, targetNode) {
        targetNode.pos[0] = anchorNode.pos[0];
        targetNode.pos[1] = anchorNode.pos[1] + anchorNode.size[1] + DEFAULT_MARGIN_Y;
      }

      function moveToRight(targetNode) {
        let isChanged = true;
        while(isChanged) {
          isChanged = false;
          for (const node of app.graph._nodes) {
            if (node.id === targetNode.id) {
              continue;
            }
            const top = node.pos[1];
            const bottom = node.pos[1] + node.size[1];
            const left = node.pos[0];
            const right = node.pos[0] + node.size[0];
            const isCollisionX = left <= node.pos[0] + targetNode.size[0] && 
              right >= targetNode.pos[0];
            const isCollisionY = top <= node.pos[1] + targetNode.size[1] && 
              bottom >= targetNode.pos[1];

            if (isCollisionX && isCollisionY) {
              targetNode.pos[0] = right + DEFAULT_MARGIN_X;
              isChanged = true;
            }
          }
        }
      }

      function moveToBottom(targetNode) {
        let isChanged = true;
        while(isChanged) {
          isChanged = false;
          for (const node of app.graph._nodes) {
            if (node.id === targetNode.id) {
              continue;
            }
            const top = node.pos[1];
            const bottom = node.pos[1] + node.size[1];
            const left = node.pos[0];
            const right = node.pos[0] + node.size[0];
            const isCollisionX = left <= targetNode.pos[0] + targetNode.size[0] && 
              right >= targetNode.pos[0];
            const isCollisionY = top <= targetNode.pos[1] + targetNode.size[1] && 
              bottom >= targetNode.pos[1];

            if (isCollisionX && isCollisionY) {
              targetNode.pos[1] = bottom + DEFAULT_MARGIN_Y;
              isChanged = true;
            }
          }
        }
      }

      function getChildNodes(node) {
        let nodeIds = [];
        let queue = [node.id];
        let links = graph.links.filter(e => e);
        while(queue.length > 0) {
          const nodeId = queue.shift();
          for (const l of links) {
            if (l.target_id === nodeId) {
              if (nodeIds.indexOf(l.origin_id) === -1) {
                nodeIds.push(l.origin_id);
              }
              if (queue.indexOf(l.origin_id) === -1) {
                queue.push(l.origin_id);
              }
            }
          }
        }
        
        let nodes = [];
        for (const id of nodeIds) {
          const n = graph._nodes.find(e => e.id === id);
          if (n) {
            nodes.push(n);
          }
        }

        return nodes;
      }

      function setCanvasPointer(x, y) {
        app.canvas.graph_mouse[0] = x;
        app.canvas.graph_mouse[1] = y;
      }
    }).bind(this);

    this.pkg39.clearWorkflow = (function() {
      try {
        const nodes = [];
        for (const n of app.graph._nodes) {
          const loadId = getLoadId(n);
          if (loadId && loadId === this.id) {
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
        if (getLoadId(n) === id) {
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
        self.pkg39.executeCommand();
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
      this.timer = setTimeout(() => {
        self.pkg39.resetCounter();
        self.pkg39.updateIndex(self.pkg39.getIndex());
        self.pkg39.clearImage();
        self.pkg39.selectImage();
        self.pkg39.renderImage();
        self.pkg39.executeCommand();
        selectNode(self);
      }, 256);
    }
  } catch(err) {
    console.error(err);
  }
}

async function executedHandler({ detail }) {
  if (!detail?.output?.images) {
    return;
  }

  // const images = detail.output.images.map(e => {
  //   return parseObjectURL(e).filePath;
  // });

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
        node.pkg39.executeCommand();
      }
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
    this.pkg39.executeCommand();
    selectNode(this);
  } else if (key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    this.pkg39.resetCounter();
    this.pkg39.updateIndex(this.pkg39.INDEX.value + 1);
    this.pkg39.clearImage();
    this.pkg39.selectImage();
    this.pkg39.renderImage();
    this.pkg39.executeCommand();
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
    this.pkg39.executeCommand();
    selectNode(this);
  } 
}

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
        node.pkg39.executeCommand();

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
          node.pkg39.executeCommand();

          node.pkg39.DIR_PATH.isCallbackEnabled = true;
          node.pkg39.INDEX.isCallbackEnabled = true;
        })();
      }
    }
  },
});