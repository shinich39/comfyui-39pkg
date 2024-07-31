// index.js
var BASE64_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var __uniq__ = 0;
function isBoolean(obj) {
  return typeof obj === "boolean";
}
function isNumber(obj) {
  return typeof obj === "number" && !Number.isNaN(obj) && Number.isFinite(obj);
}
function isNumeric(obj) {
  if (isString(obj)) {
    return !Number.isNaN(parseFloat(obj)) && Number.isFinite(parseFloat(obj));
  } else {
    return isNumber(obj);
  }
}
function isString(obj) {
  return typeof obj === "string";
}
function isEmptyString(obj) {
  return isString(obj) && obj.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "") === "";
}
function isObject(obj) {
  return typeof obj === "object" && obj !== null && obj.constructor === Object && Object.getPrototypeOf(obj) === Object.prototype;
}
function isEmptyObject(obj) {
  return isObject(obj) && Object.keys(obj).length === 0;
}
function isNull(obj) {
  return typeof obj === "object" && obj === null;
}
function isArray(obj) {
  if (Array && Array.isArray) {
    return Array.isArray(obj);
  } else {
    return Object.prototype.toString.call(obj) === "[object Array]";
  }
}
function isBooleanArray(obj) {
  if (!isArray(obj)) {
    return false;
  }
  for (const item of obj) {
    if (!isBoolean(item)) {
      return false;
    }
  }
  return true;
}
function isNumberArray(obj) {
  if (!isArray(obj)) {
    return false;
  }
  for (const item of obj) {
    if (!isNumber(item)) {
      return false;
    }
  }
  return true;
}
function isStringArray(obj) {
  if (!isArray(obj)) {
    return false;
  }
  for (const item of obj) {
    if (!isString(item)) {
      return false;
    }
  }
  return true;
}
function isObjectArray(obj) {
  if (!isArray(obj)) {
    return false;
  }
  for (const item of obj) {
    if (!isObject(item)) {
      return false;
    }
  }
  return true;
}
function isEmptyArray(obj) {
  return isArray(obj) && obj.length === 0;
}
function isFunction(obj) {
  return typeof obj === "function";
}
function isEmpty(obj) {
  return obj === void 0 || isNull(obj);
}
function isUndefined(obj) {
  return obj === void 0;
}
function isSameType(objA, objB) {
  return typeof objA === typeof objB && objA.constructor === objB.constructor;
}
function random(min, max) {
  return Math.random() * (max - min) + min;
}
function bezier(points, time) {
  if (points.length === 1) {
    return points[0];
  }
  let newPoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    let x = (1 - time) * points[i].x + time * points[i + 1].x;
    let y = (1 - time) * points[i].y + time * points[i + 1].y;
    newPoints.push({ x, y });
  }
  return bezier(newPoints, time);
}
function splitInt(str) {
  return str.split(/([0-9]+)/);
}
function splitFloat(str) {
  return str.split(/([0-9]+\.[0-9]+)+/);
}
function toHalfWidth(str) {
  return str.replace(/[！-～]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 65248);
  }).replace(/[^\S\r\n]/g, function(ch) {
    return " ";
  });
}
function toFullWidth(str) {
  return str.replace(/[!-~]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) + 65248);
  }).replace(/[^\S\r\n]/g, function(ch) {
    return "\u3000";
  });
}
function compareStrings(strA, strB) {
  function C(a, b) {
    const dp = [];
    for (let i = 0; i < a.length + 1; i++) {
      dp.push([]);
      for (let j = 0; j < b.length + 1; j++) {
        dp[i][j] = 0;
      }
    }
    return dp;
  }
  function M(dp, a, b) {
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp;
  }
  function P(dp, a, b) {
    let MATCH = 0, INSERT = 1, DELETE = -1, res = [], matches = 0, i = a.length, j = b.length;
    while (i > 0 || j > 0) {
      const prev = res[res.length - 1];
      const itemA = a[i - 1];
      const itemB = b[j - 1];
      if (i > 0 && j > 0 && itemA === itemB) {
        if (prev && prev.type === MATCH) {
          prev.value = itemA + prev.value;
        } else {
          res.push({ type: MATCH, value: itemA });
        }
        matches++;
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        if (prev && prev.type === INSERT) {
          prev.value = itemB + prev.value;
        } else {
          res.push({ type: INSERT, value: itemB });
        }
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        if (prev && prev.type === DELETE) {
          prev.value = itemA + prev.value;
        } else {
          res.push({ type: DELETE, value: itemA });
        }
        i--;
      }
    }
    return {
      acc: matches * 2 / (a.length + b.length),
      result: res.reverse()
    };
  }
  return P(M(C(strA, strB), strA, strB), strA, strB);
}
function id() {
  return Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3).toString(16) + "xxxxxx".replace(/x/g, function(v) {
    return Math.floor(Math.random() * 16).toString(16);
  }) + (__uniq__++).toString(16).padStart(6, "0");
}
function xor(str, salt) {
  if (salt.length === 0) {
    return str;
  }
  let res = "", i = 0;
  while (salt.length < str.length) {
    salt += salt;
  }
  while (i < str.length) {
    res += String.fromCharCode(str.charCodeAt(i) ^ salt.charCodeAt(i));
    i++;
  }
  return res;
}
function toBase64(str, type) {
  str = String(str);
  if (/[^\0-\xFF]/.test(str)) {
    throw new Error(
      "The string to be encoded contains characters outside of the Latin1 range."
    );
  }
  let padding = str.length % 3;
  let output = "";
  let position = -1;
  let a;
  let b;
  let c;
  let buffer;
  let length = str.length - padding;
  while (++position < length) {
    a = str.charCodeAt(position) << 16;
    b = str.charCodeAt(++position) << 8;
    c = str.charCodeAt(++position);
    buffer = a + b + c;
    output += BASE64_CHARACTERS.charAt(buffer >> 18 & 63) + BASE64_CHARACTERS.charAt(buffer >> 12 & 63) + BASE64_CHARACTERS.charAt(buffer >> 6 & 63) + BASE64_CHARACTERS.charAt(buffer & 63);
  }
  if (padding == 2) {
    a = str.charCodeAt(position) << 8;
    b = str.charCodeAt(++position);
    buffer = a + b;
    output += BASE64_CHARACTERS.charAt(buffer >> 10) + BASE64_CHARACTERS.charAt(buffer >> 4 & 63) + BASE64_CHARACTERS.charAt(buffer << 2 & 63) + "=";
  } else if (padding == 1) {
    buffer = str.charCodeAt(position);
    output += BASE64_CHARACTERS.charAt(buffer >> 2) + BASE64_CHARACTERS.charAt(buffer << 4 & 63) + "==";
  }
  return (type ? `data:${type};base64,` : "") + output;
}
function fromBase64(str) {
  str = String(str).replace(/^data:([A-Za-z-+\/]+);[A-Za-z0-9]+,/, "").replace(/[\t\n\f\r ]/g, "");
  let length = str.length;
  if (length % 4 == 0) {
    str = str.replace(/==?$/, "");
    length = str.length;
  }
  if (length % 4 == 1 || /[^+a-zA-Z0-9/]/.test(str)) {
    throw new Error(
      "Invalid character: the string to be decoded is not correctly encoded."
    );
  }
  let bitCounter = 0;
  let bitStorage;
  let buffer;
  let output = "";
  let position = -1;
  while (++position < length) {
    buffer = BASE64_CHARACTERS.indexOf(str.charAt(position));
    bitStorage = bitCounter % 4 ? bitStorage * 64 + buffer : buffer;
    if (bitCounter++ % 4) {
      output += String.fromCharCode(
        255 & bitStorage >> (-2 * bitCounter & 6)
      );
    }
  }
  return output;
}
function parseCommand(str) {
  let result = [], i = 0, tmp = str.replace(/\\'|\\"/g, "00"), bracket = null, part = "";
  while (i < str.length) {
    if (!bracket) {
      if (tmp[i] === "'" || tmp[i] === '"') {
        bracket = str[i];
      } else if (tmp[i] === " ") {
        if (part !== "") {
          result.push(part);
          part = "";
        }
      } else {
        part += str[i];
      }
    } else {
      if (tmp[i] === bracket) {
        result.push(part);
        part = "";
        bracket = null;
      } else {
        part += str[i];
      }
    }
    i++;
  }
  if (part.trim() !== "") {
    result.push(part);
  }
  return result;
}
function parseQueryString(str) {
  const qs = str.indexOf("?") > -1 ? str.split("?").pop() : str;
  let result = {};
  for (const [key, value] of new URLSearchParams(qs).entries()) {
    if (!result[key]) {
      result[key] = [value];
    } else {
      result[key].push(value);
    }
  }
  return result;
}
function parseTemplate(str, obj) {
  return str.replace(/\$\{[^}]+\}/g, function(item) {
    const key = item.substring(2, item.length - 1) ?? "";
    if (key.indexOf(".") > -1) {
      return parseTemplate(
        "${" + key.split(".").slice(1).join(".") + "}",
        obj[key.split(".")[0]]
      );
    } else {
      return obj[key] ?? "";
    }
  });
}
function createArray(len, value) {
  let arr = new Array(len);
  if (isFunction(value)) {
    for (let i = 0; i < len; i++) {
      arr[i] = value(i);
    }
  } else if (isObject(value)) {
    for (let i = 0; i < len; i++) {
      arr[i] = clone(value);
    }
  } else if (isArray(value)) {
    for (let i = 0; i < len; i++) {
      arr[i] = clone(value);
    }
  } else if (typeof value !== "undefined") {
    for (let i = 0; i < len; i++) {
      arr[i] = value;
    }
  }
  return arr;
}
function getMinValue(arr) {
  return arr.reduce(function(prev, curr) {
    return curr < prev ? curr : prev;
  }, arr[0] || 0);
}
function getMaxValue(arr) {
  return arr.reduce(function(prev, curr) {
    return curr > prev ? curr : prev;
  }, arr[0] || 0);
}
function getMeanValue(arr) {
  return arr.reduce(function(prev, curr) {
    return prev + curr;
  }, 0) / arr.length;
}
function getModeValue(arr) {
  let seen = {}, maxValue = arr[0], maxCount = 1;
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    seen[value] = seen[value] ? seen[value] + 1 : 1;
    if (seen[value] > maxCount) {
      maxValue = value;
      maxCount = seen[value];
    }
  }
  return maxValue;
}
function sortArray(arr) {
  const priorities = [
    isUndefined,
    isNull,
    isBoolean,
    isNumber,
    isString,
    isObject,
    isArray,
    isFunction
  ];
  return arr.sort(function(a, b) {
    const aIdx = priorities.findIndex(function(fn) {
      return fn(a);
    });
    const bIdx = priorities.findIndex(function(fn) {
      return fn(b);
    });
    if (aIdx !== bIdx) {
      return aIdx - bIdx;
    } else if (aIdx === 0 || aIdx === 1) {
      return 0;
    } else if (aIdx === 2) {
      return a !== b ? a ? 1 : -1 : 0;
    } else if (aIdx === 3) {
      return a - b;
    } else if (aIdx === 4) {
      return a.localeCompare(b, void 0, {
        numeric: true,
        sensitivity: "base"
      });
    } else if (aIdx === 5) {
      return Object.keys(a).length - Object.keys(b).length;
    } else if (aIdx === 6) {
      return a.length - b.length;
    } else {
      return 0;
    }
  });
}
function shuffleArray(arr) {
  let i = arr.length;
  while (i > 0) {
    let j = Math.floor(Math.random() * i);
    i--;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function getRandomValue(arr) {
  return arr[Math.floor(random(0, arr.length))];
}
function getCases(arr) {
  function getFirstIndexes(a) {
    if (a.length < 1) {
      return;
    }
    const result2 = [];
    for (let i = 0; i < a.length; i++) {
      result2.push(0);
    }
    return result2;
  }
  function getNextIndexes(a, indexes2) {
    for (let i = a.length - 1; i >= 0; i--) {
      if (indexes2[i] < a[i].length - 1) {
        indexes2[i] += 1;
        return indexes2;
      }
      indexes2[i] = 0;
    }
    return;
  }
  function getValues(a, indexes2) {
    const result2 = [];
    for (let i = 0; i < a.length; i++) {
      result2.push(a[i][indexes2[i]]);
    }
    return result2;
  }
  const result = [];
  let indexes = getFirstIndexes(arr);
  while (indexes) {
    const values = getValues(arr, indexes);
    result.push(values);
    indexes = getNextIndexes(arr, indexes);
  }
  return result;
}
function copyObject(obj) {
  const result = isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = isObject(value) && !isNull(value) ? copyObject(value) : value;
  }
  return result;
}
function groupByKey(arr, key) {
  const group = {};
  for (const obj of arr) {
    if (!group[String(obj[key])]) {
      group[String(obj[key])] = [obj];
    } else {
      group[String(obj[key])].push(obj);
    }
  }
  return group;
}
function queryObject(obj, qry) {
  const QUERY_OPERATORS = {
    and: ["$and"],
    notAnd: ["$notAnd", "$nand"],
    or: ["$or"],
    notOr: ["$notOr", "$nor"],
    not: ["$not"],
    include: ["$include", "$in"],
    exclude: ["$exclude", "$nin"],
    greaterThan: ["$greaterThan", "$gt"],
    greaterThanOrEqual: ["$greaterThanOrEqual", "$gte"],
    lessThan: ["$lessThan", "$lt"],
    lessThanOrEqual: ["$lessThanOrEqual", "$lte"],
    equal: ["$equal", "$eq"],
    notEqual: ["$notEqual", "$neq", "$ne"],
    function: ["$function", "$func", "$fn"],
    regexp: ["$regexp", "$regex", "$re", "$reg"]
  };
  function A(d, q) {
    for (const [key, value] of Object.entries(q)) {
      if (!B(d, value, key.split("."))) {
        return false;
      }
    }
    return true;
  }
  function B(d, q, k) {
    const o = k.shift();
    if (k.length > 0) {
      if (isObject(d)) {
        return B(d[o], q, k);
      } else {
        return false;
      }
    }
    return C(d, q, o);
  }
  function C(d, q, o) {
    if (QUERY_OPERATORS.and.indexOf(o) > -1) {
      for (const v of q) {
        if (!A(d, v)) {
          return false;
        }
      }
      return true;
    } else if (QUERY_OPERATORS.notAnd.indexOf(o) > -1) {
      return !C(d, q, "$and");
    } else if (QUERY_OPERATORS.or.indexOf(o) > -1) {
      for (const v of q) {
        if (A(d, v)) {
          return true;
        }
      }
      return false;
    } else if (QUERY_OPERATORS.notOr.indexOf(o) > -1) {
      return !C(d, q, "$or");
    } else if (QUERY_OPERATORS.not.indexOf(o) > -1) {
      return !A(d, q);
    } else if (QUERY_OPERATORS.include.indexOf(o) > -1) {
      if (isArray(d)) {
        for (const v of d) {
          if (!C(v, q, "$include")) {
            return false;
          }
        }
        return true;
      } else {
        for (const v of q) {
          if (C(d, v, "$equal")) {
            return true;
          }
        }
        return false;
      }
    } else if (QUERY_OPERATORS.exclude.indexOf(o) > -1) {
      return !C(d, q, "$include");
    } else if (QUERY_OPERATORS.greaterThan.indexOf(o) > -1) {
      return d > q;
    } else if (QUERY_OPERATORS.greaterThanOrEqual.indexOf(o) > -1) {
      return d >= q;
    } else if (QUERY_OPERATORS.lessThan.indexOf(o) > -1) {
      return d < q;
    } else if (QUERY_OPERATORS.lessThanOrEqual.indexOf(o) > -1) {
      return d <= q;
    } else if (QUERY_OPERATORS.equal.indexOf(o) > -1) {
      if (isArray(d) && isArray(q)) {
        if (d.length !== q.length) {
          return false;
        }
        for (let i = 0; i < q.length; i++) {
          if (d[i] !== q[i]) {
            return false;
          }
        }
        return true;
      } else {
        return d === q;
      }
    } else if (QUERY_OPERATORS.notEqual.indexOf(o) > -1) {
      return !C(d, q, "$equal");
    } else if (QUERY_OPERATORS.function.indexOf(o) > -1) {
      return q(d);
    } else if (QUERY_OPERATORS.regexp.indexOf(o) > -1) {
      return q.test(d);
    } else if (!isObject(d)) {
      return false;
    } else if (isObject(q)) {
      return A(d[o], q);
    } else {
      return C(d[o], q, "$equal");
    }
  }
  return A(obj, qry);
}
function getContainedSize(src, dst) {
  const aspectRatio = src.width / src.height;
  if (aspectRatio < dst.width / dst.height) {
    return {
      width: dst.height * aspectRatio,
      height: dst.height
    };
  } else {
    return {
      width: dst.width,
      height: dst.width / aspectRatio
    };
  }
}
function getCoveredSize(src, dst) {
  const aspectRatio = src.width / src.height;
  if (aspectRatio < dst.width / dst.height) {
    return {
      width: dst.width,
      height: dst.width / aspectRatio
    };
  } else {
    return {
      width: dst.height * aspectRatio,
      height: dst.height
    };
  }
}
function wait(delay) {
  return new Promise(function(resolve) {
    return setTimeout(resolve, delay);
  });
}
function promiseAll(funcs) {
  return funcs.reduce(function(prevPromise, currFunction) {
    return prevPromise.then(function(prev) {
      return currFunction().then(function(curr) {
        return prev.concat([curr]);
      });
    });
  }, Promise.resolve([]));
}
export {
  createArray as array,
  bezier,
  getCases as cases,
  getRandomValue as choose,
  compareStrings as compare,
  getContainedSize as contain,
  copyObject as copy,
  getCoveredSize as cover,
  fromBase64,
  groupByKey as group,
  id,
  isArray,
  isBoolean,
  isBooleanArray,
  isEmpty,
  isEmptyArray,
  isEmptyObject,
  isEmptyString,
  isFunction,
  isNull,
  isNumber,
  isNumberArray,
  isNumeric,
  isObject,
  isObjectArray,
  isSameType,
  isString,
  isStringArray,
  getMaxValue as max,
  getMeanValue as mean,
  getMinValue as min,
  getModeValue as mode,
  parseCommand,
  parseQueryString,
  parseTemplate,
  promiseAll,
  queryObject as query,
  random,
  shuffleArray as shuffle,
  sortArray as sort,
  splitFloat,
  splitInt,
  toBase64,
  toFullWidth,
  toHalfWidth,
  wait,
  xor
};
