"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
  isLoadImageNode,
  isCommandNode,
  isPkg39Node, 
  getLoaderId,
  getPreviousId,
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
    // const nodeType = node.type;
    const nodeTitle = node.title;
    text += `var n${nodeIndex++} = findOneById(${nodeId}); // ${nodeTitle}\n`;
  }

  text += `\n// You can use javascript code here!`;
  text += `\n// The code is executed after rendered new image workflow.`;
  text += `\n// If image workflow has multiple flows, you may not be able to find nodes.`;
  text += `\n// The longest flow has been selected default flow.`;
  text += `\n// Only the first created command node will run.`;
  text += `\n\n// ### Global variables`;
  text += `\n// MAIN => Node: Load image node.`;
  text += `\n// DIR_PATH => String: Directory path of loaded image.`;
  text += `\n// INDEX => Number: Index of loaded image.`;
  text += `\n// IMAGE_PATH => String: Path of loaded image.`;
  text += `\n// IMAGE_NAME => String: Filename of loaded image.`;
  text += `\n// MASK_PATH => String|null: Path of loaded mask.`;
  text += `\n// MASK_NAME => String|null: Filename of loaded mask.`;
  text += `\n// SEED => Number: Generated random seed for current queue.`;
  text += `\n// STATE => Object: Store values and prevent refresh before image changed by user.`;
  text += `\n// YEAR => Number`;
  text += `\n// MONTH => Number`;
  text += `\n// DAY => Number`;
  text += `\n// HOURS => Number`;
  text += `\n// MINUTES => Number`;
  text += `\n// SECONDS => Number`;
  text += `\n// countImages => Number: Number of images.`;
  text += `\n// countQueues => Number: Number of queues.`;
  text += `\n// countLoops => Number: Number of loops.`;
  text += `\n// onEnd(images) => Function: A callback function after image generation.`;
  text += `\n// onError(err) => Function: A callback function when an error occurred in command node.`;
  text += `\n\n// ### Global methods`;
  text += `\n// flow(index): Change to search area as specific flow.`;
  text += `\n// find("TITLE"|"TYPE") => NodeArray: Search for nodes in selected flow.`;
  text += `\n// findLast("TITLE"|"TYPE") => NodeArray: Search for nodes in selected flow.`;
  text += `\n// findOne("TITLE"|"TYPE") => Node: Search for node in selected flow.`;
  text += `\n// findOneLast("TITLE"|"TYPE") => Node: Search for node in selected flow.`;
  text += `\n// findOneById(id) => Node: Search for node in all flows.`;
  text += `\n// create("TYPE", values{}) => Node: Create a new node in virtual workflow.`;
  text += `\n// remove("TITLE"|"TYPE"|NodeArray)`;
  text += `\n// removeAll(): Remove all nodes in virtual workflow.`;
  text += `\n// enable("TITLE"|"TYPE"|NodeArray)`;
  text += `\n// enableAll(): Enable all nodes in virtual workflow.`;
  text += `\n// disable("TITLE"|"TYPE"|NodeArray)`;
  text += `\n// disableAll(): Disable all nodes in virtual workflow.`;
  text += `\n// sound(): Play the sound once.`;
  text += `\n// start(): Start generation.`;
  text += `\n// cancel(): Cancel current generation.`;
  text += `\n// next(): Load next image.`;
  text += `\n// loop(): Enable auto queue mode and start generation.`;
  text += `\n// stop(): Disable auto queue mode and stop current generation.`;
  text += `\n// loadDir(dirPath) => Promise: Change dir_path value and load images in directory.`;
  text += `\n// loadFile(filePath) => Promise: Load image by file path.`;
  text += `\n\n// ### Node variables`;
  text += `\n// node.isPkg39 => Boolean`;
  text += `\n// node.isEnd => Boolean: The node has been placed ending point.`;
  text += `\n// node.isStart => Boolean: The node has been placed starting point.`;
  text += `\n// node.hasInput => Boolean`;
  text += `\n// node.hasOutput => Boolean`;
  text += `\n// node.hasConnectedInput => Boolean`;
  text += `\n// node.hasConnectedOutput => Boolean`;
  text += `\n// node.node => ComfyNode`;
  text += `\n\n// ### Node methods`;
  text += `\n// node.getValues() => Object`;
  text += `\n// node.setValues(values{})`;
  text += `\n// node.getValue("WIDGET_NAME") => Any`;
  text += `\n// node.setValue("WIDGET_NAME", "VALUE")`;
  text += `\n// node.getInputNode("INPUT_NAME") => Node`;
  text += `\n// node.getOutputNode("OUTPUT_NAME") => NodeArray`;
  text += `\n// node.connectInput("INPUT_NAME", Node): Connect to output of target node.`;
  text += `\n// node.connectOutput("OUTPUT_NAME", Node|NodeArray): Connect to input of target node.`;
  text += `\n// node.replace(Node): Inherit all connections and values from target node.`;
  text += `\n// node.enable()`;
  text += `\n// node.disable()`;
  text += `\n// node.remove()`;
  text += `\n// node.putOnRight(Node)`;
  text += `\n// node.putOnBottom(Node)`;
  text += `\n// node.moveToRight()`;
  text += `\n// node.moveToBottom()`;
  text += `\n// node.hires(w, h) => [UpscalerNode, SamplerNode]: This method must be executed from the node has LATENT output.`;
  text += `\n// node.hires(scale) => [UpscalerNode, SamplerNode]: This method must be executed from the node has LATENT output.`;
  text += `\n// node.encode() => Node: This method must be executed from the node has IMAGE output.`;
  text += `\n// node.decode() => Node: This method must be executed from the node has LATENT output.`;
  text += `\n// node.save() => Node: This method must be executed from the node has IMAGE output.`;

  w.value = text;
  w.prevValue = text;
  w.isChanged = false;
  w.callback = (newValue) => {
    if (app.configuringGraph) {
      return;
    }
    if (!w.isChanged) {
      if (w.prevValue !== newValue) {
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
        await node.pkg39.renderWorkflow();
        renderCanvas();
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
  nodeCreated(node) {
    if (isCommandNode(node)) {
      initCommandNode.apply(node);
    }
  }
});