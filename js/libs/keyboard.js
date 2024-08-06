"use strict";

import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { api } from "../../../scripts/api.js";

let isSelectionEnabled = typeof window.getSelection !== "undefined";
let selectedElement = null;
let histories = [];

const BRACKETS = {
  "(": ["(",")"],
  "{": ["{","}"],
  "[": ["[","]"],
  "<": ["<",">"],
};

const SHORT_CUTS = {
  "Tab": "  ",
}

function getSelectionRange(el) {
  return [
    el.selectionStart,
    el.selectionEnd,
  ];
}

function isSelected(el) {
  return selectedElement && selectedElement.isSameNode(el);
}

function getPrevValue() {
  if (histories.length > 0) {
    return histories[histories.length - 1].newText;
  }
}

function getPrevRange() {
  if (histories.length > 0) {
    return histories[histories.length - 1].newRange;
  }
}

function getHistory(el) {
  if (!selectedElement || !el.isSameNode(selectedElement)) {
    return;
  }
  if (getPrevValue() === el.value) {
    return histories.pop();
  }
}

function getKey({ key, ctrlKey, metaKey, shiftKey }) {
  let str = "";
  if (ctrlKey || metaKey) {
    str += "Ctrl+";
  }
  if (shiftKey) {
    str += "Shift+";
  }
  str += key;
  return str;
}

function isBracket(e) {
  const key = getKey(e);
  return Object.keys(BRACKETS).indexOf(key) > -1;
}

function isShortCut(e) {
  const key = getKey(e);
  return Object.keys(SHORT_CUTS).indexOf(key) > -1;
}

function isEnabled({ key }) {
  for (const node of app.graph._nodes) {
    if (node.comfyClass === "BindKey39") {
      if (!node.widgets) {
        continue;
      }
      const widget = node.widgets.find(e => e.name === key);
      if (widget) {
        return widget.value;
      }
    }
  }
  return false;
}

app.registerExtension({
	name: "shinich39.pkg39.keyboard",
	init() {
    if (!isSelectionEnabled) {
      return;
    }

    // textarea
    const STRING = ComfyWidgets.STRING;
    ComfyWidgets.STRING = function (node, inputName, inputData) {
      const r = STRING.apply(this, arguments);

      if (inputData[1]?.multiline) {
        const widget = r.widget;
        if (!widget) {
          return r;
        }

        const element = widget.element;
        if (!element) {
          return r;
        }

        element.addEventListener("keydown", function(e) {
          const { key, ctrlKey, metaKey } = e;
          if (isBracket(e) && isEnabled(e)) {
            e.preventDefault();
            let brackets = BRACKETS[key];
            let oldRange = getSelectionRange(e.target);
            let oldText = e.target.value;
            let oldPart = oldText.substring(oldRange[0], oldRange[1]);
            let newPart = `${brackets[0]}${oldPart}${brackets[1]}`;
            let newText = oldText.substring(0, oldRange[0]) + 
                          newPart +
                          oldText.substring(oldRange[1]);

            let newRange = [
              oldRange[0] + brackets[0].length,
              oldRange[1] + brackets[0].length
            ];

            e.target.value = newText;
            e.target.focus();
            e.target.setSelectionRange(newRange[0], newRange[1]);

            if (!isSelected(e.target)) {
              selectedElement = e.target;
              histories = [];
            }

            const prevText = getPrevValue();
            if (prevText && prevText !== oldText) {
              histories.push({
                oldText: prevText,
                newText: oldText,
                oldRange: getPrevRange(),
                newRange: oldRange,
              });
            }

            histories.push({
              oldText: oldText,
              newText: newText,
              oldRange: oldRange,
              newRange: newRange,
            });
          } else if (isShortCut(e) && isEnabled(e)) {
            e.preventDefault();
            let part = SHORT_CUTS[key];
            let oldRange = getSelectionRange(e.target);
            let oldText = e.target.value;
            let newText = oldText.substring(0, oldRange[0]) + 
                          part +
                          oldText.substring(oldRange[1]);

            let newRange = [
              oldRange[0] + part.length,
              oldRange[0] + part.length
            ];

            e.target.value = newText;
            e.target.focus();
            e.target.setSelectionRange(newRange[0], newRange[1]);

            if (!isSelected(e.target)) {
              selectedElement = e.target;
              histories = [];
            }

            histories.push({
              oldText: oldText,
              newText: newText,
              oldRange: oldRange,
              newRange: newRange,
            });
          } else if (key === "z" && (ctrlKey || metaKey)) {
            const history = getHistory(e.target);
            if (history) {
              e.preventDefault();
              const { oldText, oldRange } = history;
              e.target.value = oldText;
              e.target.focus();
              e.target.setSelectionRange(oldRange[0], oldRange[1]);
            }
          }
        });
      }

      return r;
    };

	},
});