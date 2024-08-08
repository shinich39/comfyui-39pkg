"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
  isLoadImageNode,
  isCommandNode,
  isPkg39Node, 
  getLoadId,
  getPrevNodeId,
  getRandomSeed,
  renderCanvas,
} from "./pkg39-utils.js";

function initCommandNode() {
  const self = this;

  // set default value
  const w = this.widgets?.[0];

  let text = ``;
  let nodeIndex = 1;
  const nodes = app.graph._nodes
    .filter(e => !!e && !isCommandNode(e) && !isPkg39Node(e))
    .sort((a, b) => a.id - b.id);

  for (const node of nodes) {
    const nodeId = node.id;
    const nodeTitle = node.title;
    text += `var n${nodeIndex++} = find(${nodeId}); // ${nodeTitle}\n`;
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
  text += `\n// sound(): Play the sound once.`;
  text += `\n// start(): Start generation.`;
  text += `\n// cancel(): Cancel current generation.`;
  text += `\n// next(): Load next image.`;
  text += `\n// stop(): Disable auto queue mode.`;
  // text += `\n// loadDir(dirPath) => Promise: Change dir_path value and load images in directory.`;
  // text += `\n// loadFile(filePath) => Promise: Load image by file path.`;
  text += `\n// find(ID|TITLE|TYPE) => Node`;
  text += `\n// findLast(ID|TITLE|TYPE) => Node`;
  text += `\n// get(node) => Object: Get widget values in node.`;
  text += `\n// set(node, values)`;
  text += `\n// load(srcNode, dstNode, name, replaceNodes|null) => Void: Get nodes or values from image workflow.`;

  w.value = text;
  w.isChanged = false;
  w.callback = (currValue) => {
    if (app.configuringGraph) {
      return;
    }
    if (!w.isChanged) {
      if (w.prevValue !== currValue) {
        w.isChanged = true;
        w.element.addEventListener("blur", updateHandler);
      }
    }
  }

  async function updateHandler() {
    w.element.removeEventListener("blur", updateHandler);
    w.isChanged = false;
    w.prevValue = w.value;
    for (const node of app.graph._nodes) {
      if (isLoadImageNode(node)) {
        // node.pkg39.resetCounter();
        // node.pkg39.updateIndex(node.pkg39.getIndex());
        node.pkg39.clearImage();
        node.pkg39.selectImage();
        node.pkg39.renderImage();
        node.pkg39.executeCommand();
        renderCanvas();

        // render only one node
        break;
      }
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
        const w = node.widgets?.[0];
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