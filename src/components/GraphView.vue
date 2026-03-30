<script setup>
import { computed, nextTick, ref } from "vue";
import { createBaseGraph, expandGraphFromNode } from "../services/graphExpansion";
import { createFocusLayouts, createGridLayouts, getFocusState } from "../services/graphLayout";
import { graphStore } from "../store/graphStore";

const graphRef = ref(null);

const COLORS = [
  "#7cc8c6",
  "#91b7d8",
  "#b7c9a8",
  "#d8c39a",
  "#9eb4c7",
  "#9dc7b8",
  "#b4bfd8",
  "#cdb8d7",
];

function isFocusedNode(nodeId) {
  return graphStore.focusedNodes.size === 0 || graphStore.focusedNodes.has(nodeId);
}

function isFocusedEdge(edgeId) {
  return graphStore.focusedEdges.size === 0 || graphStore.focusedEdges.has(edgeId);
}

function getLabelScaleFactor() {
  const zoom = graphStore.zoomLevel || 1;
  return Math.max(0.78, Math.min(1, 0.78 + (zoom - 0.25) * 0.16));
}

function getScaledFontSize(baseSize) {
  return Math.round(baseSize * getLabelScaleFactor());
}

function getEdgeColor(edge) {
  if (!isFocusedEdge(edge.id)) {
    return "rgba(146, 161, 179, 0.28)";
  }

  switch (edge.relationGroup) {
    case "child":
      return "#7fb3a4";
    case "dependency":
      return "#d7bc79";
    case "context":
      return "#93a8be";
    default:
      return "#a8b7c7";
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

const displayNodeIds = computed(() => {
  const query = normalizeText(graphStore.searchQuery);
  const ids = Object.keys(graphStore.nodes);

  if (!query) {
    return ids;
  }

  return ids.filter((id) => {
    const node = graphStore.nodes[id];
    return normalizeText(node.name || id).includes(query);
  });
});

const displayNodes = computed(() =>
  Object.fromEntries(displayNodeIds.value.map((id) => [id, graphStore.nodes[id]]))
);

const displayEdges = computed(() =>
  Object.fromEntries(
    Object.entries(graphStore.edges).filter(([, edge]) => {
      return displayNodes.value[edge.source] && displayNodes.value[edge.target];
    })
  )
);

const displayLayouts = computed(() => ({
  nodes: Object.fromEntries(
    displayNodeIds.value
      .map((id) => [id, graphStore.layouts.nodes[id]])
      .filter(([, layout]) => Boolean(layout))
  ),
}));

function updateLayouts(focusNodeId = null) {
  graphStore.layouts = {
    nodes: focusNodeId
      ? createFocusLayouts(graphStore.nodes, graphStore.edges, focusNodeId)
      : createGridLayouts(graphStore.nodes),
  };
}

async function fitGraph() {
  await nextTick();
  graphRef.value?.fitToContents({ margin: 80 });
}

function applyFocus(nodeId) {
  const { focusedNodes, focusedEdges } = getFocusState(nodeId, graphStore.edges);

  graphStore.selectedNode = nodeId;
  graphStore.selectedService = graphStore.serviceMap[nodeId] || null;
  graphStore.focusedNodes = focusedNodes;
  graphStore.focusedEdges = focusedEdges;

  updateLayouts(nodeId);
  fitGraph();
}

function handleNodeClick({ node }) {
  applyFocus(node);
}

function handleNodeDoubleClick({ node }) {
  expandNode(node);
  applyFocus(node);
}

function expandNode(nodeId) {
  const nextDepth = (graphStore.expandedDepths[nodeId] || 0) + 1;
  const { nodes: baseNodes, edges: baseEdges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges
  );

  const expandedDepths = {
    ...graphStore.expandedDepths,
    [nodeId]: nextDepth,
  };

  let nodes = baseNodes;
  let edges = baseEdges;

  Object.entries(expandedDepths).forEach(([expandedNodeId, depth]) => {
    const expandedGraph = expandGraphFromNode(
      graphStore.fullNodes,
      graphStore.fullEdges,
      nodes,
      edges,
      expandedNodeId,
      depth
    );

    nodes = expandedGraph.nodes;
    edges = expandedGraph.edges;
  });

  graphStore.expandedNodes = new Set(Object.keys(expandedDepths));
  graphStore.expandedDepths = expandedDepths;
  graphStore.nodes = nodes;
  graphStore.edges = edges;
}

function resetGraph() {
  const { nodes, edges } = createBaseGraph(graphStore.fullNodes, graphStore.fullEdges);

  graphStore.nodes = nodes;
  graphStore.edges = edges;
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  graphStore.focusedNodes = new Set();
  graphStore.focusedEdges = new Set();
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  updateLayouts();
  fitGraph();
}

const eventHandlers = {
  "node:click": handleNodeClick,
  "node:dblclick": handleNodeDoubleClick,
};

const configs = {
  view: {
    autoPanAndZoomOnLoad: "fit-content",
    fitContentMargin: 80,
    autoPanOnResize: true,
    scalingObjects: false,
    minZoomLevel: 0.25,
    maxZoomLevel: 4,
  },

  node: {
    draggable: true,
    normal: {
      type: "circle",
      radius: (node) => {
        if (graphStore.selectedNode && graphStore.selectedNode === node.id) return 24;
        if (node.ghost) return isFocusedNode(node.id) ? 14 : 11;
        return isFocusedNode(node.id) ? 18 : 13;
      },
      color: (node) => {
        if (node.ghost) {
          return isFocusedNode(node.id) ? "#a9b6c7" : "#d8e0ea";
        }

        return COLORS[node.level % COLORS.length];
      },
      strokeWidth: (node) => {
        if (graphStore.selectedNode === node.id) return 3;
        return isFocusedNode(node.id) ? 2 : 1;
      },
      strokeColor: (node) => {
        if (graphStore.selectedNode === node.id) return "#fffef8";
        return isFocusedNode(node.id) ? "#7d92aa" : "#d4dde8";
      },
    },
    label: {
      visible: true,
      text: (node) => node.name || node.id,
      fontFamily: "'Avenir Next', 'Segoe UI', sans-serif",
      fontSize: (node) => {
        if (graphStore.selectedNode === node.id) return getScaledFontSize(13);
        if (isFocusedNode(node.id)) return getScaledFontSize(node.ghost ? 9 : 10);
        return getScaledFontSize(8);
      },
      color: () => "#111111",
      background: (node) => ({
        visible: true,
        color: isFocusedNode(node.id) ? "rgba(255, 255, 255, 0.99)" : "rgba(255, 255, 255, 0.98)",
        padding: { vertical: 3, horizontal: 8 },
        borderRadius: 12,
      }),
      lineHeight: 1.2,
      direction: "south",
      directionAutoAdjustment: true,
      margin: 14,
    },
    focusring: {
      visible: true,
      width: 3,
      padding: 6,
      color: "#e8c98b",
    },
  },

  edge: {
    type: "curve",
    gap: 28,
    normal: {
      width: (edge) => (isFocusedEdge(edge.id) ? 3 : 1.2),
      color: (edge) => getEdgeColor(edge),
      dasharray: (edge) => {
        if (!isFocusedEdge(edge.id)) return "6 10";
        return edge.relationGroup === "context" ? "5 7" : 0;
      },
      animate: false,
      animationSpeed: 50,
    },
    selected: {
      width: 3,
      color: "#d7bc79",
      animate: false,
      animationSpeed: 50,
    },
    marker: {
      source: {
        type: "none",
      },
      target: {
        type: "arrow",
        width: 5,
        height: 5,
        margin: -1,
        offset: 0,
        units: "strokeWidth",
        color: null,
      },
    },
    label: {
      fontFamily: "'Avenir Next', 'Segoe UI', sans-serif",
      fontSize: 10,
      color: "#55697f",
      background: {
        visible: true,
        color: "rgba(255, 255, 255, 0.9)",
        padding: { vertical: 2, horizontal: 6 },
        borderRadius: 999,
      },
      lineHeight: 1.2,
      margin: 4,
      padding: 4,
    },
  },
};
</script>

<template>
  <div class="graph-view">
    <div class="graph-toolbar">
      <label class="search-field">
        <input
          v-model="graphStore.searchQuery"
          type="text"
          placeholder="Поиск сервиса"
        />
      </label>
      <div class="legend-card">
        <span class="legend-dot primary"></span>
        <span>Клик: сфокусировать сервис</span>
      </div>
      <div class="legend-card">
        <span class="legend-dot accent"></span>
        <span>Двойной клик: раскрыть вложенность</span>
      </div>
      <div class="legend-card">
        <span class="legend-dot child"></span>
        <span>Зелёный: дочерние модули</span>
      </div>
      <button class="ghost-button" @click="resetGraph">Сбросить фокус</button>
    </div>

    <v-network-graph
      ref="graphRef"
      :nodes="displayNodes"
      :edges="displayEdges"
      :layouts="displayLayouts"
      :zoom-level="graphStore.zoomLevel"
      :selected-nodes="displayNodes[graphStore.selectedNode] ? [graphStore.selectedNode] : []"
      :configs="configs"
      :event-handlers="eventHandlers"
      @update:zoomLevel="graphStore.zoomLevel = $event"
      @update:layouts="graphStore.layouts = $event"
    />
  </div>
</template>
