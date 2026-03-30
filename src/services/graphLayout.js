const DEFAULT_GRID_COLUMNS = 4;
const DEFAULT_X_GAP = 240;
const DEFAULT_Y_GAP = 180;
const FOCUS_RADIUS = 230;
const OUTER_RADIUS = 430;

function polarToCartesian(radius, angle) {
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  };
}

export function createGridLayouts(nodes, columns = DEFAULT_GRID_COLUMNS) {
  const entries = Object.keys(nodes);
  const layouts = {};

  entries.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    layouts[id] = {
      x: column * DEFAULT_X_GAP,
      y: row * DEFAULT_Y_GAP,
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
    return createGridLayouts(nodes);
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
