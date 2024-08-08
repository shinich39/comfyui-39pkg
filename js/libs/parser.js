"use strict";

const SAMPLER_TYPES = [
  "KSampler", 
  "KSamplerAdvanced"
];

const SAMPLER_KEYS = [
  "model",
  "positive",
  "negative",
  "latent_image",
  "seed",
  "noise_seed",
  "cfg",
  "denoise",
  "steps",
  "start_at_step",
  "end_at_step",
  "scheduler",
  "sampler_name",
];

/**
 * 
 * @param {object} info 
 * @returns 
 */
function getNodeMap({ workflow, sampler }) {
  let w = JSON.parse(JSON.stringify(workflow)),
      f = [], 
      b = [];

  w = unwind(w);

  searchBackward(w, b, 0, sampler.id);
  searchForward(w, f, 0, sampler.id);

  return [...b.slice(1).reverse(), ...f];
  
  function searchForward(w, acc, i, id) {
    const node = w.nodes.find((n) => n.id === id);
    if (!acc[i]) {
      acc[i] = [node];
    } else {
      acc[i].push(node);
    }

    if (!node.outputs) {
      return;
    }

    for (const output of node.outputs) {
      for (const link of output) {
        const n = link?.targetNode;
        if (n) {
          searchForward(w, acc, i + 1, n.id);
        }
      }
    }
  }

  function searchBackward(w, acc, i, id) {
    const node = w.nodes.find((n) => n.id === id);
    if (!acc[i]) {
      acc[i] = [node];
    } else {
      acc[i].push(node);
    }

    if (!node.inputs) {
      return;
    }

    for (const link of node.inputs) {
      const n = link?.originNode;
      if (n) {
        searchBackward(w, acc, i + 1, n.id);
      }
    }
  }

  function unwind(w) {
    w.links = w.links
      .filter((l) => !!l)
      .map((l) => {
        return {
          id: l.id ?? l[0],
          type: l.type ?? l[5],
          origin_id: l.origin_id ?? l[1],
          origin_slot: l.origin_slot ?? l[2],
          target_id: l.target_id ?? l[3],
          target_slot: l.target_slot ?? l[4],
          originNode: w.nodes.find((e) => e.id === (l.origin_id ?? l[1])),
          originSlot: (l.origin_slot ?? l[2]),
          targetNode: w.nodes.find((e) => e.id === (l.target_id ?? l[3])),
          targetSlot: (l.target_slot ?? l[4]),
        }
      });

    for (const n of w.nodes) {
      n.inputs = n.inputs?.map((i) => {
        return w.links.find((l) => l.id === i.link);
      });

      n.outputs = n.outputs?.map((o) => {
        return o.links?.filter(l => l).map((l) => {
          return w.links.find((_l) => _l.id === l);
        });
      });
    }

    return w;
  }
}

/**
 * 
 * @param {object} info 
 * @returns {{id: string, type: string, title: string|null }[]}
 */
function getSamplerNodes({ workflow, prompt }) {
  return Object.entries(prompt)
    .reduce((acc, [k, v]) => {
      if (SAMPLER_TYPES.indexOf(v.class_type) > -1) {
        let id = parseInt(k);
        let type = v.class_type;
        let title = workflow?.nodes?.find(e => e.id === id)?.title ?? null;
        acc.push({ id, type, title });
      }
      return acc;
    }, [])
    .sort((a, b) => {
      return a._id - b._id;
    });
}

/**
 * 
 * @param {object} info 
 * @returns 
 */
function getLastNode({ workflow, sampler }) {
  workflow = JSON.parse(JSON.stringify(workflow));
  workflow = unwind(workflow);

  let steps = [];
  search(workflow, steps, 0, sampler.id);
  let lastNode = steps[steps.length - 1]?.[0];

  if (!lastNode) {
    throw new Error("Last node not found.");
  }

  return {
    id: lastNode.id,
    type: lastNode.type,
    title: lastNode.title,
  }

  function search(w, acc, i, id) {
    const node = w.nodes.find((n) => n.id === id);
    if (!acc[i]) {
      acc[i] = [node];
    } else {
      acc[i].push(node);
    }

    if (!node.outputs) {
      return;
    }

    for (const output of node.outputs) {
      for (const link of output) {
        if (link.type !== "LATENT" && link.type !== "IMAGE") {
          console.error(`${link.type} is not LATENT or IMAGE`);
          continue;
        }
        const n = link.targetNode;
        search(w, acc, i + 1, n.id);
      }
    }
  }

  function unwind(w) {
    w.links = w.links
      .filter((l) => !!l)
      .map((l) => {
        return {
          id: l.id,
          type: l.type,
          originNode: w.nodes.find((e) => e.id === l.origin_id),
          originSlot: l.origin_slot,
          targetNode: w.nodes.find((e) => e.id === l.target_id),
          targetSlot: l.target_slot,
        }
      });

    for (const n of w.nodes) {
      n.inputs = n.inputs?.map((i) => {
        return w.links.find((l) => l.id === i.link);
      });

      n.outputs = n.outputs?.map((o) => {
        return o.links?.filter(l => l).map((l) => {
          return w.links.find((_l) => _l.id === l);
        });
      });
    }

    return w;
  }
}

export { getSamplerNodes, getLastNode, getNodeMap }