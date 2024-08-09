"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getSamplerNodes, getNodeMap } from "./parser.js";
import {
  getImageURL,
  isLoadImageNode, 
  isCommandNode,
  isPkg39Node, 
  getLoadId,
  getCommandId,
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

console.log(app)

const DEFAULT_NODE_COLORS = LGraphCanvas.node_colors;
const DEFAULT_MARGIN_X = 30;
const DEFAULT_MARGIN_Y = 60;

function initCommandNode() {
  const self = this;

  // set pkg39 methods
  this.pkg39 = {};
  this.pkg39.getNode = (function() {
    try {
      const input = this.inputs.find(e => e.name === "command");
      if (!input || !input.link) {
        return;
      }

      const link = app.graph.links.find(e => e && e.id === input.link);
      if (!link) {
        return;
      }

      const node = app.graph._nodes.find(e => e && e.id === link.origin_id);
      return node;
    } catch(err) {
      console.error(err);
      return;
    }
  }).bind(this);

  this.pkg39.clear = (function() {
    try {
      const nodes = [];
      for (const n of app.graph._nodes) {
        const commId = getCommandId(n);
        if (commId && commId === this.id) {
          nodes.push(n);
        } 
      }
      if (nodes.length > 0) {
        app.canvas.selectNodes(nodes);
        app.canvas.deleteSelectedNodes();
      }
      renderCanvas();
    } catch(err) {
      console.error(err);
    }
  }).bind(this);

  this.pkg39.render = (async function(type) {
    const COMMAND = this.widgets?.find(e => e.name === "text")?.value;
    if (!COMMAND || COMMAND.trim() === "") {
      return;
    }

    const loader = this.pkg39.getNode();
    if (!loader || !loader.pkg39.isInitialized || !loader.pkg39.selectedImage) {
      return;
    }

    let { selectedImage, selectedIndex } = loader.pkg39;
    if (!selectedImage.workflow) {
      return;
    }

    let { width, height, prompt, workflow } = selectedImage;
    let samplerNodes = getSamplerNodes({ workflow, prompt });

    // remove command nodes in workflow
    removeNodesFromWorkflow(workflow);

    // create virtual graph and virtual canvas
    // this methods call node.onConnectionsChange
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
    
    // node.pkg39.selectedGraph = graph;
    // node.pkg39.selectedCanvas = canvas;

    // set properties
    for (const n of graph._nodes) {
      // set pkg39 properties
      n.properties.pkg39 = {
        nodeId: n.id,
        loadId: loader.id,
        commandId: this.id,
        // isEnabled: n.mode === 0,
        // isDisabled: n.mode === 4, // bypass
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

        const MAIN = loader;
        const COMMAND_X = this.pos[0];
        const COMMAND_Y = this.pos[1];
        const COMMAND_W = this.size[0];
        const COMMAND_H = this.size[1];
        const SEED = getRandomSeed();

        const DIR_PATH = selectedImage.dirPath;
        const INDEX = selectedIndex;
        const FILENAME = selectedImage.origName;
        const FILE_PATH = selectedImage.origPath;
        const WIDTH = width;
        const HEIGHT = height;

        const DATE = new Date();
        const YEAR = DATE.getFullYear();
        const MONTH = DATE.getMonth() + 1;
        const DAY = DATE.getDay();
        const HOURS = DATE.getHours();
        const MINUTES = DATE.getMinutes();
        const SECONDS = DATE.getSeconds();

        const SAMPLERS = samplers;
        const SAMPLER = samplers[samplers.length - 1];

        const STATE = loader.pkg39.state;
        const countImages = loader.pkg39.loadedImages.length;
        const countQueues = loader.pkg39.countQueues;
        const countLoops = loader.pkg39.countLoops;
        const countErrors = loader.pkg39.countErrors;
 
        // global methods
        const stop = () => unsetAutoQueue();
        const find = (query) => typeof query === "number" ? getActualNode(query) : getVirtualNode(query);
        const findLast = (query) => typeof query === "number" ? getActualNode(query) : getVirtualNode(query, true);
        const get = (node) => getWidgetValues(node);
        const set = (node, values) => setWidgetValues(node, values);
        const load = (srcNode, dstNode, name, replacements) => connectNodes(srcNode, dstNode, name, {
          x: COMMAND_X + COMMAND_W + DEFAULT_MARGIN_X,
          y: COMMAND_Y,
          replacements,
        });

        // this methods available after "executed"
        const sound = () => playNotification();
        const next = async () => await loadNextImage.apply(loader);
        const loadDir = async (dirPath) => await loadDirByPath.apply(loader, [dirPath]);
        const loadFile = async (filePath) => await loadFileByPath.apply(loader, [filePath]);
        const loadImage = async (node) => await loadFileByNode.apply(loader, [node]);

        // callbacks
        let onError = (err) => { console.error(err); };

        // execute
        eval(`
          try {
            ${COMMAND}
          } catch(err) {
            onError(err);
          }
        `.trim());
      } catch(err) {
        console.error(err);
      }
      
      renderCanvas();
    })();

    function connectNodes(src, dst, name, options) {
      src = getVirtualNode(src, true);
      dst = getActualNode(dst);
      if (!src) {
        throw new Error("Source node not found.");
      }
      if (!dst) {
        throw new Error("Destination node not found.");
      }
      if (src.type !== dst.type) {
        throw new Error(`${src.type} has not been matched with ${dst.type}`);
      }

      let isInput = false;
      let originNode;
      let originSlot;

      if (src.inputs) {
        const input = src.inputs.find(e => e.name === name);
        if (input) {
          isInput = true;

          const link = getInputLink(src, name);
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
          if (dst.inputs) {
            const input = dst.inputs.find(e => e.name === name);

            // widget to input
            if (!input) {
              const widget = dst.widgets?.find(e => e.name === name);
              if (widget) {
                dst.convertWidgetToInput(widget);
              }
            }
          }

          const targetId = dst.id;
          const targetSlot = dst.findInputSlot(name);
          originNode.connect(originSlot, targetId, targetSlot);
        }
      } else {
        let value;
        if (src.widgets) {
          const widget = src.widgets.find(e => e.name === name);
          if (widget) {
            value = widget.value;
          }
        }
        if (dst.widgets) {
          const input = dst.inputs?.find(e => e.name === name);
          const widget = dst.widgets.find(e => e.name === name);
          if (widget) {
            if (input) {
              convertInputToWidget(dst, widget);
            }
            widget.value = value;
          }
        }
      }
    }

    function getVirtualNode(any, reverse) {
      if (typeof any === "object") {
        return any;
      }
      if (!reverse) {
        for (let i = 0; i < nodeMap.length; i++) {
          const nodes = nodeMap[i];
          for (const n of nodes) {
            const node = graph._nodes.find(e => e.id === n.id);
            if (!node) {
              continue;
            }
            if (matchNode(node, any)) {
              return node;
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
            if (matchNode(node, any)) {
              return node;
            }
          }
        }
      }
    }

    function getActualNode(any) {
      if (typeof any === "number") {
        return app.graph._nodes.find(e => isNodeId(e, any));
      } else if (typeof any === "string") {
        return app.graph._nodes.find(e => matchNode(e, any));
      } else if (typeof any === "object") {
        return any;
      }
    }

    function playNotification() {
      if (["executed"].indexOf(type) === -1) {
        console.error(`sound() has been blocked by type: ${type}`);
        return;
      }
      playSound();
    }

    async function loadNextImage() {
      if (["executed"].indexOf(type) === -1) {
        console.error(`next() has been blocked by type: ${type}`);
        return;
      }
      this.pkg39.resetCounter();
      this.pkg39.updateIndex();
      this.pkg39.clearImage();
      this.pkg39.selectImage();
      this.pkg39.renderImage();
      await this.pkg39.executeCommands("changeIndex");
    }

    async function loadDirByPath(dirPath) {
      if (["executed"].indexOf(type) === -1) {
        console.error(`loadDir() has been blocked by type: ${type}`);
        return;
      }
      this.pkg39.resetCounter();
      await this.pkg39.updateDirPath(dirPath);
      await this.pkg39.loadImages();
      this.pkg39.updateIndex(0);
      this.pkg39.clearImage();
      this.pkg39.selectImage();
      this.pkg39.renderImage();
      await this.pkg39.executeCommands("changeDirPath");
      selectNode(this);
    }

    async function loadFileByPath(filePath) {
      if (["executed"].indexOf(type) === -1) {
        console.error(`loadFile() has been blocked by type: ${type}`);
        return;
      }
      if (filePath && this.pkg39.loadedImagePath !== filePath) {
        this.pkg39.loadedImagePath = filePath;
        await this.pkg39.loadImageByPath(filePath);
      }
    }

    async function loadFileByNode(node, index = 0) {
      if (["executed"].indexOf(type) === -1) {
        console.error(`loadImage() has been blocked by type: ${type}`);
        return;
      }
      node = getActualNode(node);
      if (node && Array.isArray(node.images) && node.images[index]) {
        const image = node.images[index];
        const { filePath } = parseObjectURL(image);
        if (filePath) {
          await this.pkg39.loadImageByPath(filePath);
        }
      }
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
      replaceNodes = replaceNodes
        .map(getActualNode)
        .filter(e => !!e);

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

    function removeNodesFromWorkflow(workflow) {
      let removedLinks = [];
      let nodeIds = [];
      for (let i = workflow.nodes.length - 1; i >= 0; i--) {
        const node = workflow.nodes[i];
        // remove nodes

        // if (node.type === "LoadImage39") {
        //   workflow.nodes.splice(i, 1);
        //   nodeIds.push(node.id);
        // } 
        
        if (node.type === "Command39") {
          // command does not have input and outputs
          workflow.nodes.splice(i, 1);
          nodeIds.push(node.id);
        }
      }

      let linkIds = [];
      for (let i = workflow.links.length - 1; i >= 0; i--) {
        if (!workflow.links[i]) {
          continue;
        }
        const l = workflow.links[i];
        const link = {
          id: l[0],
          type: l[5],
          origin_id: l[1],
          origin_slot: l[2],
          target_id: l[3],
          target_slot: l[4],
        }
        // remove links
        if (nodeIds.indexOf(link.target_id) > -1) {
          workflow.links.splice(i, 1);
          linkIds.push(link.id);
          removedLinks.push(link); 
        }
      }

      for (const node of workflow.nodes) {
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
        // pass: command node has not output
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

      return removedLinks;
    }
  }).bind(this);

  // set default value
  const w = this.widgets?.find(e => e.name === "text");

  // set default text
  ;(() => {
    let text = ``;
    const nodes = app.graph._nodes
      .filter(e => e && !isCommandNode(e) && !isPkg39Node(e))
      .sort((a, b) => a.id - b.id);

    for (const node of nodes) {
      const nodeId = node.id;
      const nodeTitle = node.title;
      text += `var n${nodeId} = find(${nodeId}); // ${nodeTitle}\n`;
    }

    text += `\n// You can use javascript code here!`;
    text += `\n\n// ### Variables`;
    text += `\n// MAIN => Node: Load image node.`;
    text += `\n// DIR_PATH => String: Directory path of loaded image.`;
    text += `\n// INDEX => Number: Index of loaded image.`;
    text += `\n// FILE_PATH => String: Path of loaded image.`;
    text += `\n// FILENAME => String: Filename of loaded image.`;
    text += `\n// WIDTH => Number: Width of loaded image.`;
    text += `\n// HEIGHT => Number: Height of loaded image.`;
    text += `\n// SEED => Number: Generated random seed each command node.`;
    text += `\n// STATE => Object: Store values and prevent refresh before image changed by user.`;
    text += `\n// YEAR => Number`;
    text += `\n// MONTH => Number`;
    text += `\n// DAY => Number`;
    text += `\n// HOURS => Number`;
    text += `\n// MINUTES => Number`;
    text += `\n// SECONDS => Number`;
    text += `\n// SAMPLERS => Array: All sampler nodes in flow.`;
    text += `\n// SAMPLER => Node: Last sampler node.`;
    text += `\n// countImages => Number: Number of images.`;
    text += `\n// countQueues => Number: Number of queues.`;
    text += `\n// countLoops => Number: Number of loops.`;
    text += `\n\n// ### Methods`;
    text += `\n// stop(): Disable auto queue mode.`;
    text += `\n// sound(): Play the notification sound.`;
    text += `\n// loadDir(dirPath) => Promise: Change dir_path value and load images in directory.`;
    text += `\n// loadFile(filePath) => Promise: Load image by file path.`;
    text += `\n// loadImage(node) => Promise: Load generated image by Save Image node.`;
    text += `\n// find(ID|TITLE|TYPE) => Node`;
    text += `\n// findLast(ID|TITLE|TYPE) => Node`;
    text += `\n// get(node) => Object: Get widget values in node.`;
    text += `\n// set(node, values)`;
    text += `\n// load(srcNode, dstNode, name, replaceNodes|null) => Void: Get nodes or values from image workflow.`;
    w.prevValue = text;
    w.value = text;
  })();
  
  this.onConnectionsChange = async function(type, _, connected, link_info) {
    if (!link_info || link_info.target_slot !== 0) {
      return;
    }
    const originNode = app.graph._nodes.find(e => e.id === link_info.origin_id);
    const originSlot = link_info.origin_slot;
    const targetNode = this;
    const targetSlot = link_info.target_slot;
    if (!connected) {
      this.pkg39.clear();
    } else {
      if (originNode.type !== "LoadImage39") {
        app.graph.removeLink(link_info.id);
      } else {
        this.pkg39.clear();
        await this.pkg39.render("changeConnection");
      }
    }
  }

  w.isChanged = false;
  w.callback = (v) => {
    if (app.configuringGraph) {
      return;
    }
    if (!w.isChanged) {
      w.isChanged = true;
      w.element.addEventListener("blur", updateHandler.bind(self, arguments));
    }
  }

  async function updateHandler() {
    w.element.removeEventListener("blur", updateHandler);
    if (w.prevValue !== w.value) {
      w.prevValue = w.value;
      w.isChanged = false;
      this.pkg39.clear();
      await this.pkg39.render("changeCommand");
    }
  }

  // fix widget size
  setTimeout(() => {
    this.setSize(this.size);
    this.setDirtyCanvas(true, true);
  }, 1);
}

app.registerExtension({
	name: "shinich39.pkg39.command",
  async afterConfigureGraph(missingNodeTypes) {
    for (const node of app.graph._nodes) {
      if (isCommandNode(node)) {
        // bug fix first run after refreshing
        const w = node.widgets?.find(e => e.name === "text");
        if (w) {
          w.prevValue = w.value;
        }
      }
    }
	},
  nodeCreated(node) {
    if (isCommandNode(node)) {
      initCommandNode.apply(node);
    }
  }
});