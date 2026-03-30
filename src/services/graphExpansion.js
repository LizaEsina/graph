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

export function createBaseGraph(fullNodes, fullEdges) {
  const nodes = {};
  const edges = {};

  Object.entries(fullNodes).forEach(([id, node]) => {
    if (!node.ghost) {
      nodes[id] = node;
    }
  });

  Object.entries(fullEdges).forEach(([id, edge]) => {
    if (nodes[edge.source] && nodes[edge.target]) {
      edges[id] = edge;
    }
  });

  return { nodes, edges };
}

export function expandGraphFromNode(fullNodes, fullEdges, currentNodes, currentEdges, nodeId, depth) {
  const nodes = { ...currentNodes };
  const edges = { ...currentEdges };
  const visited = new Set();

  walkDependencies(fullNodes, fullEdges, nodeId, depth, nodes, edges, visited);

  return { nodes, edges };
}
