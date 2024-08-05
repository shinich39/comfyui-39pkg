"use strict";

import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";

function isRandomNode(node) {
  return node.comfyClass === "Random39";
}

function shuffle(arr) {
  let i = arr.length;
  while (i > 0) {
    let j = Math.floor(Math.random() * i);
    i--;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function onConnectInput(index, type, link_info, node) {
  try {
    // fix change link
    this._keepInputsOnce = this.inputs[index] && this.inputs[index].link;
    return true;
  } catch(err) {
    return false;
  }
}

function computeSize(out) {
  if (this.constructor.size) {
    return this.constructor.size.concat();
  }

  var rows = Math.max(
    this.inputs ? this.inputs.length : 1,
    this.outputs ? this.outputs.length : 1
  );
  var size = out || new Float32Array([0, 0]);
  rows = Math.max(rows, 1);
  var font_size = LiteGraph.NODE_TEXT_SIZE; //although it should be graphcanvas.inner_text_font size

  var title_width = compute_text_size(this.title);
  var input_width = 0;
  var output_width = 0;

  if (this.inputs) {
    for (var i = 0, l = this.inputs.length; i < l; ++i) {
      var input = this.inputs[i];
      var text = input.label || input.name || "";
      var text_width = compute_text_size(text);
      if (input_width < text_width) {
        input_width = text_width;
      }
    }
  }

  if (this.outputs) {
    for (var i = 0, l = this.outputs.length; i < l; ++i) {
      var output = this.outputs[i];
      var text = output.label || output.name || "";
      var text_width = compute_text_size(text);
      if (output_width < text_width) {
        output_width = text_width;
      }
    }
  }

  size[0] = Math.max(input_width + output_width + 10, title_width);
  size[0] = Math.max(size[0], LiteGraph.NODE_WIDTH * 1);
  if (this.widgets && this.widgets.length) {
    size[0] = Math.max(size[0], LiteGraph.NODE_WIDTH * 1.5);
  }

  size[1] = (this.constructor.slot_start_y || 0) + rows * LiteGraph.NODE_SLOT_HEIGHT;

  var widgets_height = 0;
  if (this.widgets && this.widgets.length) {
    for (var i = 0, l = this.widgets.length; i < l; ++i) {
      if (this.widgets[i].computeSize)
        widgets_height += this.widgets[i].computeSize(size[0])[1] + 4;
      else
        widgets_height += LiteGraph.NODE_WIDGET_HEIGHT + 4;
    }
    widgets_height += 8;
  }

  //compute height using widgets height
  if( this.widgets_up )
    size[1] = Math.max( size[1], widgets_height );
  else if( this.widgets_start_y != null )
    size[1] = Math.max( size[1], widgets_height + this.widgets_start_y );
  else
    size[1] += widgets_height;

  function compute_text_size(text) {
    if (!text) {
      return 0;
    }
    return font_size * text.length * 0.6;
  }

  if (
    this.constructor.min_height &&
    size[1] < this.constructor.min_height
  ) {
    size[1] = this.constructor.min_height;
  }

  size[1] += 6; //margin

  return size;
}

function getSlotType() {
  if (!this.inputs) {
    return null;
  }

  const connectedInput = this.inputs.find(function(input) {
    return input.link;
  });

  if (!connectedInput) {
    return null;
  }

  const linkId = connectedInput.link;
  const link = app.graph.links[linkId];
  const targetNode = app.graph.getNodeById(link.origin_id)
  const targetSlot = targetNode.outputs[link.origin_slot];
  return targetSlot && targetSlot.type ? targetSlot.type : null;
}

function showSlotType() {
  try {
    if (this.outputs && this.outputs.length > 0) {
      this.outputs[0].label = this._type ? this._type : "";
    }
  } catch(err) {
    console.error(err);
  }
}

function setLinkColors() {
  try {
    const color = LGraphCanvas.link_type_colors[this._type];
    for (const link in app.graph.links) {
      if (!link) {
        continue; // removed link
      }
      if (link.origin_id === this.id || link.target_id === this.id) {
        link.color = color;
      }
    }
  } catch(err) {
    // error occurred at first link in workflow
    console.error(err);
  }
}

function getConnectedInputs() {
  return this.inputs ? this.inputs.filter(function(input) {
    return input.link;
  }) : [];
}

function getConnectedOutputs() {
  return this.outputs ? this.outputs.filter(function(outputs) {
    return outputs.links.length > 0;
  }) : [];
}

function shuffleInputs() {
  const connectedInputs = this.getConnectedInputs();
  if (connectedInputs.length < 1) {
    return;
  }

  this._keepOutputs = true;
  this._keepInputs = true;

  let outputs = [];
  let inputs = []
  for (let i = this.inputs.length - 1; i >= 0; i--) {
    const input = this.inputs[i];
    const linkId = input.link;
    const link = app.graph.links[linkId];
    if (!link) {
      continue;
    }

    outputs.push({
      nodeId: link.origin_id,
      slotIndex: link.origin_slot,
    });

    inputs.push({
      nodeId: link.target_id,
      slotIndex: link.target_slot,
    });

    this.disconnectInput(i);
  }

  inputs = shuffle(inputs);

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    const input = inputs[i];
    const outputNode = app.graph.getNodeById(output.nodeId);
    const inputNode = app.graph.getNodeById(input.nodeId);
    outputNode.connect(output.slotIndex, inputNode, input.slotIndex);
  }

  this._keepOutputs = false;
  this._keepInputs = false;
}

function onConnectionsChange(type, index, connected, link_info) {
  if (!this.inputs || !this.outputs) {
    return;
  }

  if (this._keepInputsOnce) {
    this._keepInputs = true;
  }

  if (this._keepOutputsOnce) {
    this._keepOutputs = true;
  }

  // const isInput = type === LiteGraph.INPUT;
  const isLastInputConnected = this.inputs[this.inputs.length - 1].link;
  const slotType = this.getSlotType();

  // set slot type
  this._type = slotType ? slotType : "*";

  if (isLastInputConnected) {
    // create new input
    this.addInput("input" + this.inputs.length, this._type, { label: "" });
  }

  // set inputs
  if (!this._keepInputs) {
    // remove last input
    let isRemoveLastInput = this.inputs.length > 1 && !isLastInputConnected && !this.inputs[this.inputs.length - 2].link;
    while(isRemoveLastInput) {
      this.removeInput(this.inputs.length - 1);
      isRemoveLastInput = this.inputs.length > 1 && !isLastInputConnected && !this.inputs[this.inputs.length - 2].link;
    }

    // set inputs
    for (let i = this.inputs.length - 1; i >= 0; i--) {
      const input = this.inputs[i];
      input.name = "input" + i;
      input.label = "";
      input.type = this._type;
    }
  }

  // set outputs
  if (!this._keepOutputs) {
    while(this.outputs.length !== this.inputs.length - 1) {
      if (this.outputs.length > this.inputs.length - 1) {
        let unlinkedOutputIndex = this.outputs.findIndex(function(output) {
          return !output.links || output.links.length < 1;
        });

        if (unlinkedOutputIndex < 0) {
          unlinkedOutputIndex = this.outputs.length - 1
        }

        this.removeOutput(unlinkedOutputIndex);
      } else {
        this.addOutput("output"+this.outputs.length, this._type || "*", {
          label: this.outputs.length === 0 ? this._type || "*" : ""
        });
      }
    }
  }

  this.setLinkColors();
  this.showSlotType();

  if (this._keepInputsOnce) {
    this._keepInputs = false;
    this._keepInputsOnce = false;
  }

  if (this._keepOutputsOnce) {
    this._keepOutputs = false;
    this._keepOutputsOnce = false;
  }
}

function promptQueued({ detail }) {
  for (const node of app.graph._nodes) {
    if (!isRandomNode(node)) {
      continue;
    }

    node.shuffleInputs();
  }
}

app.registerExtension({
	name: "shinich39.pkg39.random",
	nodeCreated(node, app) {
    if (!isRandomNode(node)) {
      return;
    }

    // set events
    node.onConnectInput = onConnectInput;
    node.computeSize = computeSize;
    node.getSlotType = getSlotType;
    node.showSlotType = showSlotType;
    node.setLinkColors = setLinkColors;
    node.getConnectedInputs = getConnectedInputs;
    node.getConnectedOutputs = getConnectedOutputs;
    node.shuffleInputs = shuffleInputs;
    node.onConnectionsChange = onConnectionsChange;

    // initailize
    node.isVirtualNode = true;
    node._type = "*";
    node._keepOutputs = false;
    node._keepInputs = false;
    node._keepInputsOnce = false;
    node._keepOutputsOnce = false;
    node.removeOutput(0); // remove first output
    node.computeSize();
	}
});

api.addEventListener("promptQueued", promptQueued);