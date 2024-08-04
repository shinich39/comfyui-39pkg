"use strict";

import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { api } from "../../../scripts/api.js";

let isSelectionEnabled = typeof window.getSelection !== "undefined";

const BRACKETS = {
  "(": ["(",")"],
  "{": ["{","}"],
  "[": ["[","]"],
};

function getSelectionRange(el) {
  return [
    el.selectionStart,
    el.selectionEnd,
  ];
}

let histories = [];

app.registerExtension({
	name: "shinich39.pkg39.textarea",
	init() {
    if (isSelectionEnabled) {
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
            const { key, ctrlKey } = e;
            if (key === "(" || key === "{" || key === "[") {
              e.preventDefault();
              let brackets = BRACKETS[key];
              let oldRange = getSelectionRange(e.target);
              let oldText = e.target.value;
              let oldPart = oldText.substring(oldRange[0], oldRange[1]);
              let newPart = `${brackets[0]}${oldPart}${brackets[1]}`;
              let newText = oldText.substring(0, oldRange[0]) + 
                newPart +
                oldText.substring(oldRange[1]);

              let newRange = [oldRange[0] + 1, oldRange[1] + 1];

              e.target.value = newText;
              e.target.focus();
              e.target.setSelectionRange(newRange[0], newRange[1]);
              histories.push({
                element: e.target,
                oldText: oldText,
                newText: newText,
                brackets: brackets,
                oldRange: oldRange,
                newRange: newRange,
              });
            } else if (key === "z" && ctrlKey) {
              if (histories.length > 0) {
                e.preventDefault();
                const { oldText, oldRange } = histories.pop();
                e.target.value = oldText;
                e.target.focus();
                e.target.setSelectionRange(oldRange[0], oldRange[1]);
              }
            } else if (key !== "Control" && key !== "Alt" && key !== "Shift" && key !== "Meta") {
              histories = [];
            }
          });

          // clear histories
          element.addEventListener("blur", (e) => { histories = []; });
        }

        return r;
      };
    }
	},
});