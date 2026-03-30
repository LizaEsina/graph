const DEFAULT_GRID_COLUMNS = 3;
const CLUSTER_RING_STEP = 620;
const CLUSTER_START_RADIUS = 380;
const OVERVIEW_RADIUS = 220;
const FOCUS_RADIUS = 230;
const OUTER_RADIUS = 430;

function polarToCartesian(radius, angle) {
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  };
}

function createClusterCenters(count) {
  if (count <= 1) {
    return [{ x: 0, y: 0 }];
  }

  const centers = [];
  let placed = 0;
  let ring = 0;

  while (placed < count) {
    const radius = ring === 0 ? CLUSTER_START_RADIUS : CLUSTER_START_RADIUS + ring * CLUSTER_RING_STEP;
    const capacity = ring === 0 ? 4 : 6 + ring * 4;
    const itemsInRing = Math.min(capacity, count - placed);
    const angleOffset = ring % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / itemsInRing;

    for (let index = 0; index < itemsInRing; index += 1) {
      const angle = angleOffset + (Math.PI * 2 * index) / itemsInRing;
      centers.push(polarToCartesian(radius, angle));
    }

    placed += itemsInRing;
    ring += 1;
  }

  return centers;
}

export function createGridLayouts(nodes, edges = {}, columns = DEFAULT_GRID_COLUMNS) {
  const entries = Object.keys(nodes);
  const layouts = {};
  const localIds = entries.filter((id) => !nodes[id]?.ghost);
  const graphNodeIds = localIds.length > 0 ? localIds : entries;

  if (graphNodeIds.length <= 1) {
    entries.forEach((id) => {
      layouts[id] = { x: 0, y: 0 };
    });
    return layouts;
  }

  const adjacency = new Map(graphNodeIds.map((id) => [id, new Set()]));

  Object.values(edges).forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
      return;
    }

    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  });

  const visited = new Set();
  const components = [];

  graphNodeIds.forEach((startId) => {
    if (visited.has(startId)) {
      return;
    }

    const queue = [startId];
    const component = [];
    visited.add(startId);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      component.push(nodeId);

      adjacency.get(nodeId)?.forEach((neighborId) => {
        if (visited.has(neighborId)) {
          return;
        }

        visited.add(neighborId);
        queue.push(neighborId);
      });
    }

    components.push(component.sort((a, b) => a.localeCompare(b)));
  });

  const sortedComponents = components.sort((a, b) => b.length - a.length);
  const clusterCenters = createClusterCenters(sortedComponents.length);

  sortedComponents.forEach((component, componentIndex) => {
    const center = clusterCenters[componentIndex] || { x: 0, y: 0 };
    const componentSizeBoost = Math.max(0, component.length - 1) * 18;

    if (component.length === 1) {
      const angle = (componentIndex % 2 === 0 ? -1 : 1) * (Math.PI / 10);
      const point = polarToCartesian(36 + componentSizeBoost, angle);
      layouts[component[0]] = {
        x: center.x + point.x,
        y: center.y + point.y,
      };
      return;
    }

    const radius = Math.max(OVERVIEW_RADIUS, 120 + component.length * 24);
    const componentAngleOffset = componentIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / component.length;

    component.forEach((id, index) => {
      const angle = componentAngleOffset + (Math.PI * 2 * index) / component.length;
      const point = polarToCartesian(radius, angle);

      layouts[id] = {
        x: point.x + center.x,
        y: point.y + center.y,
      };
    });
  });

  const ghostIds = entries.filter((id) => nodes[id]?.ghost);
  const ghostGroups = new Map();

  ghostIds.forEach((ghostId) => {
    const anchors = Object.values(edges)
      .flatMap((edge) => {
        if (edge.source === ghostId && layouts[edge.target]) {
          return [edge.target];
        }

        if (edge.target === ghostId && layouts[edge.source]) {
          return [edge.source];
        }

        return [];
      })
      .filter(Boolean);

    if (anchors.length === 0) {
      return;
    }

    const groupKey = [...new Set(anchors)].sort().join("|");
    if (!ghostGroups.has(groupKey)) {
      ghostGroups.set(groupKey, {
        anchors: [...new Set(anchors)],
        ghostIds: [],
      });
    }

    ghostGroups.get(groupKey).ghostIds.push(ghostId);
  });

  ghostGroups.forEach(({ anchors, ghostIds }) => {
    const anchorCenter = anchors.reduce(
      (acc, anchorId) => {
        acc.x += layouts[anchorId]?.x || 0;
        acc.y += layouts[anchorId]?.y || 0;
        return acc;
      },
      { x: 0, y: 0 }
    );

    anchorCenter.x /= anchors.length;
    anchorCenter.y /= anchors.length;

    const baseAngle =
      Math.abs(anchorCenter.x) < 1 && Math.abs(anchorCenter.y) < 1
        ? -Math.PI / 4
        : Math.atan2(anchorCenter.y, anchorCenter.x);

    ghostIds.forEach((ghostId, index) => {
      const spread = ghostIds.length === 1 ? 0 : (index / (ghostIds.length - 1) - 0.5) * 1.2;
      const angle = baseAngle + spread;
      const radius = 170 + Math.floor(index / 5) * 40;
      const point = polarToCartesian(radius, angle);

      layouts[ghostId] = {
        x: Math.round(anchorCenter.x + point.x),
        y: Math.round(anchorCenter.y + point.y),
      };
    });
  });

  ghostIds.forEach((ghostId, index) => {
    if (layouts[ghostId]) {
      return;
    }

    const angle = (Math.PI * 2 * index) / Math.max(ghostIds.length, 1) - Math.PI / 2;
    const point = polarToCartesian(OVERVIEW_RADIUS + 200, angle);
    layouts[ghostId] = {
      x: point.x,
      y: point.y,
    };
  });

  return layouts;
}

export function getFocusState(nodeId, edges) {
  const focusedNodes = new Set();
  const focusedEdges = new Set();

  if (!nodeId) {
    return { focusedNodes, focusedEdges };
  }

  focusedNodes.add(nodeId);

  Object.entries(edges).forEach(([edgeId, edge]) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      focusedEdges.add(edgeId);
      focusedNodes.add(edge.source);
      focusedNodes.add(edge.target);
    }
  });

  return { focusedNodes, focusedEdges };
}

export function createFocusLayouts(nodes, edges, focusNodeId) {
  if (!focusNodeId || !nodes[focusNodeId]) {
    return createGridLayouts(nodes, edges);
  }

  const layouts = {
    [focusNodeId]: { x: 0, y: 0 },
  };

  const neighbors = [];
  const outerNodes = [];

  Object.keys(nodes).forEach((id) => {
    if (id === focusNodeId) return;

    const isNeighbor = Object.values(edges).some(
      (edge) =>
        (edge.source === focusNodeId && edge.target === id) ||
        (edge.target === focusNodeId && edge.source === id)
    );

    if (isNeighbor) {
      neighbors.push(id);
    } else {
      outerNodes.push(id);
    }
  });

  neighbors.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(neighbors.length, 1) - Math.PI / 2;
    layouts[id] = polarToCartesian(FOCUS_RADIUS, angle);
  });

  outerNodes.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(outerNodes.length, 1) - Math.PI / 2;
    const ringOffset = index % 2 === 0 ? 0 : 90;
    const point = polarToCartesian(OUTER_RADIUS + ringOffset, angle);

    layouts[id] = point;
  });

  return layouts;
}
