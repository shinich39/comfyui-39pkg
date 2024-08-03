const LOAD_IMAGE_NODE_TYPE = "LoadImage39";
const COMMAND_NODE_TYPE = "Command39";
const MIN_SEED = 0;
const MAX_SEED = parseInt("0xffffffffffffffff", 16);
const STEPS_OF_SEED = 10;

// add notification element
let AUDIO_ELEMENT;
if (!document.getElementById("pkg39-sound")) {
  AUDIO_ELEMENT = document.createElement("audio");
  AUDIO_ELEMENT.id = "pkg39-sound";
  AUDIO_ELEMENT.src = `/shinich39/pkg39/sound?path=${encodeURIComponent("./mp3/sound.mp3")}`;
  AUDIO_ELEMENT.volume = 1;
  document.body.appendChild(AUDIO_ELEMENT);
}

function isLoadImageNode(node) {
  return LOAD_IMAGE_NODE_TYPE === node.comfyClass;
}

function isCommandNode(node) {
  return COMMAND_NODE_TYPE === node.comfyClass;
}

function isPkg39Node(node) {
  return typeof node?.properties?.pkg39 === "object";
}

function getLoaderId(node) {
  return node?.properties?.pkg39?.loaderId;
}

function getPreviousId(node) {
  return node?.properties?.pkg39?.previousId;
}

function getRandomSeed() {
  let max = Math.min(1125899906842624, MAX_SEED);
  let min = Math.max(-1125899906842624, MIN_SEED);
  let range = (max - min) / (STEPS_OF_SEED / 10);
  return Math.floor(Math.random() * range) * (STEPS_OF_SEED / 10) + min;
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
    renderCanvas();
  }
}

function hideError() {
  app.ui.dialog.close();
  app.lastNodeErrors = null;
}

function isErrorOccurred() {
  return app.lastNodeErrors && Object.keys(app.lastNodeErrors).length > 0;
  // if (app.ui?.dialog?.element) {
  //   return app.ui.dialog.element.style.display !== "none" && 
  //     app.ui.dialog.element.style.display !== "";
  // } else {
  //   return false;
  // }
}

function isAutoQueueMode() {
  return document.querySelector("input[name='AutoQueueMode']:checked")?.value === "instant";
}

function getQueueSize() {
  return app.ui.lastQueueSize ?? 0;
}

function startQueue() {
  app.queuePrompt(0, app.ui.batchCount);
}

async function cancelQueue() {
  await api.interrupt();
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

function renderCanvas() {
  app.canvas.draw(true, true);
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

export {
  isLoadImageNode,
  isCommandNode,
  getLoaderId,
  getPreviousId,
  isPkg39Node,
  getRandomSeed,
  hideError,
  isErrorOccurred,
  isAutoQueueMode,
  getQueueSize,
  startQueue,
  cancelQueue,
  setAutoQueue,
  unsetAutoQueue,
  renderCanvas,
  isSoundPlayed,
  playSound,
  loopSound,
}