import { isTraversableRelation } from "./graphRelations";

function getSmartOutgoingEdges(fullEdges, nodeId) {
  return Object.entries(fullEdges).filter(
    ([, edge]) => edge.source === nodeId && isTraversableRelation(edge.relationType)
  );
}

function getContextEdges(fullEdges, nodeId) {
  return Object.entries(fullEdges).filter(
    ([, edge]) => edge.source === nodeId && !isTraversableRelation(edge.relationType)
  );
}

function walkDependencies(fullNodes, fullEdges, nodeId, depth, nodes, edges, visited) {
  if (!nodeId || depth < 0 || visited.has(`${nodeId}:${depth}`)) {
    return;
  }

  visited.add(`${nodeId}:${depth}`);

  if (fullNodes[nodeId]) {
    nodes[nodeId] = fullNodes[nodeId];
  }

  if (depth === 0) {
    getContextEdges(fullEdges, nodeId).forEach(([edgeId, edge]) => {
      edges[edgeId] = edge;

      if (fullNodes[edge.source]) {
        nodes[edge.source] = fullNodes[edge.source];
      }

      if (fullNodes[edge.target]) {
        nodes[edge.target] = fullNodes[edge.target];
      }
    });

    return;
  }

  getSmartOutgoingEdges(fullEdges, nodeId).forEach(([edgeId, edge]) => {
    edges[edgeId] = edge;

    if (fullNodes[edge.source]) {
      nodes[edge.source] = fullNodes[edge.source];
    }

    if (fullNodes[edge.target]) {
      nodes[edge.target] = fullNodes[edge.target];
    }

    walkDependencies(fullNodes, fullEdges, edge.target, depth - 1, nodes, edges, visited);
  });

  getContextEdges(fullEdges, nodeId).forEach(([edgeId, edge]) => {
    edges[edgeId] = edge;

    if (fullNodes[edge.source]) {
      nodes[edge.source] = fullNodes[edge.source];
    }

    if (fullNodes[edge.target]) {
      nodes[edge.target] = fullNodes[edge.target];
    }
  });
}

function createAllGraph(fullNodes, fullEdges) {
  return {
    nodes: { ...fullNodes },
    edges: { ...fullEdges },
  };
}

function createFocusGraph(fullNodes, fullEdges) {
  const nodes = Object.fromEntries(
    Object.entries(fullNodes).filter(([, node]) => !node.ghost)
  );
  const visibleNodeIds = new Set(Object.keys(nodes));
  const edges = Object.fromEntries(
    Object.entries(fullEdges).filter(
      ([, edge]) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )
  );

  return { nodes, edges };
}

export function createBaseGraph(fullNodes, fullEdges, mode = "all") {
  return mode === "focus"
    ? createFocusGraph(fullNodes, fullEdges)
    : createAllGraph(fullNodes, fullEdges);
}

export function expandGraphFromNode(fullNodes, fullEdges, currentNodes, currentEdges, nodeId, depth) {
  const nodes = { ...currentNodes };
  const edges = { ...currentEdges };
  const visited = new Set();

  walkDependencies(fullNodes, fullEdges, nodeId, depth, nodes, edges, visited);

  return { nodes, edges };
}
