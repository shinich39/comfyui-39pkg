"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
  isLoadImageNode, 
  parseObjectURL,
} from "./pkg39-utils.js";

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

function parseURL(url) {
  return {
    type: url.searchParams.get("type"),
    subfolder: url.searchParams.get("subfolder"),
    filename: url.searchParams.get("filename"),
  }
}

function isLoadImageNodeExists() {
  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      return true;
    }
  }
  return false;
}

function getLoadImageNode() {
  for (const node of app.graph._nodes) {
    if (isLoadImageNode(node)) {
      return node;
    }
  }
  return;
}

async function saveImage(filePath) {
  const response = await api.fetchApi(`/shinich39/pkg39/save_image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ path: filePath }),
  });

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  return true;
}

async function sendToPkg39() {
  if (this.imgs) {
    // If this node has images then we add an open in new tab item
    let img;
    if (this.imageIndex != null) {
      // An image is selected so select that
      img = this.imgs[this.imageIndex];
    } else if (this.overIndex != null) {
      // No image is selected but one is hovered
      img = this.imgs[this.overIndex];
    }
    if (img) {
      const url = new URL(img.src);
      const filePath = getPathFromURL(url);
      await saveImage(filePath);
    }
  }
}

async function sendToLoadImageNode() {
  if (this.imgs) {
    // If this node has images then we add an open in new tab item
    let img;
    if (this.imageIndex != null) {
      // An image is selected so select that
      img = this.imgs[this.imageIndex];
    } else if (this.overIndex != null) {
      // No image is selected but one is hovered
      img = this.imgs[this.overIndex];
    }
    if (img) {
      const url = new URL(img.src);
      const obj = parseURL(url);
      const filePath = parseObjectURL(obj).filePath;
      const node = getLoadImageNode();
      await node.pkg39.loadImageByPath(filePath);
    }
  }
}

app.registerExtension({
	name: "shinich39.pkg39.menu",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {

    // add "Send to pkg39" to preview image menu
		const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
		nodeType.prototype.getExtraMenuOptions = function (_, options) {
			const r = origGetExtraMenuOptions ? origGetExtraMenuOptions.apply(this, arguments) : undefined;
			let optionIndex = options.findIndex((o) => o?.content === "Save Image");
      if (optionIndex > -1) {
        let newOptions = [
          {
            content: "Send to pkg39",
            callback: () => {
              sendToPkg39.apply(this);
            },
          }, {
            content: "Send to Load image",
            disabled: !isLoadImageNodeExists(),
            callback: () => {
              sendToLoadImageNode.apply(this);
            },
          }
        ];
        
        options.splice(
          optionIndex + 1,
          0,
          ...newOptions
        );
      }
      return r;
		};

	},
});