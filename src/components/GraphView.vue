<script setup>
import { computed, nextTick, ref } from "vue";
import { createBaseGraph, expandGraphFromNode } from "../services/graphExpansion";
import { createFocusLayouts, createGridLayouts, getFocusState } from "../services/graphLayout";
import { graphStore } from "../store/graphStore";

const graphRef = ref(null);
let clickTimer = null;
let lastClickedNode = null;
const GRAPH_MODES = [
  { id: "all", label: "Все связи" },
  { id: "focus", label: "Фокус" },
];

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
  if (graphStore.graphMode !== "focus") {
    return true;
  }

  return graphStore.focusedNodes.size === 0 || graphStore.focusedNodes.has(nodeId);
}

function isFocusedEdge(edgeId) {
  if (graphStore.graphMode !== "focus") {
    return true;
  }

  return graphStore.focusedEdges.size === 0 || graphStore.focusedEdges.has(edgeId);
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

function formatEdgeLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getServiceSearchText(nodeId) {
  const service = graphStore.serviceMap[nodeId];
  const node = graphStore.nodes[nodeId];

  if (!service) {
    return "";
  }

  return normalizeText([
    service.name,
    service.id,
    service.rawId,
    node?.name,
    nodeId,
  ].filter(Boolean).join(" "));
}

const displayNodeIds = computed(() => {
  const query = normalizeText(graphStore.searchQuery);
  const ids =
    graphStore.graphMode === "focus" &&
    graphStore.selectedNode &&
    graphStore.focusedNodes.size > 0
      ? Array.from(graphStore.focusedNodes).filter((id) => graphStore.nodes[id])
      : Object.keys(graphStore.nodes);

  if (!query) {
    return ids;
  }

  const matchedServiceIds = ids.filter((id) => getServiceSearchText(id).includes(query));

  if (matchedServiceIds.length === 0) {
    return [];
  }

  const visibleIds = new Set(matchedServiceIds);

  Object.values(graphStore.edges).forEach((edge) => {
    if (!ids.includes(edge.source) || !ids.includes(edge.target)) {
      return;
    }

    if (visibleIds.has(edge.source) || visibleIds.has(edge.target)) {
      visibleIds.add(edge.source);
      visibleIds.add(edge.target);
    }
  });

  return ids.filter((id) => visibleIds.has(id));
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
  const targetFocusNodeId = graphStore.graphMode === "focus" ? focusNodeId : null;

  graphStore.layouts = {
    nodes: targetFocusNodeId
      ? createFocusLayouts(graphStore.nodes, graphStore.edges, targetFocusNodeId)
      : createGridLayouts(graphStore.nodes, graphStore.edges),
  };
}

async function fitGraph() {
  await nextTick();
  graphRef.value?.fitToContents({ margin: 80 });
}

function applySelection(nodeId) {
  graphStore.selectedNode = nodeId;
  graphStore.selectedService = graphStore.serviceMap[nodeId] || null;
}

function clearFocusState() {
  graphStore.focusedNodes = new Set();
  graphStore.focusedEdges = new Set();
}

function rebuildGraphForMode(mode) {
  const { nodes, edges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges,
    mode
  );

  graphStore.nodes = nodes;
  graphStore.edges = edges;
}

function rebuildFocusGraph(selectedNodeId = null, selectedDepth = 0) {
  const { nodes: baseNodes, edges: baseEdges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges,
    "focus"
  );

  const expandedDepths = { ...graphStore.expandedDepths };

  if (selectedNodeId && selectedDepth > 0) {
    expandedDepths[selectedNodeId] = Math.max(expandedDepths[selectedNodeId] || 0, selectedDepth);
  }

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

function applyFocus(nodeId) {
  const { focusedNodes, focusedEdges } = getFocusState(nodeId, graphStore.edges);

  applySelection(nodeId);
  graphStore.focusedNodes = focusedNodes;
  graphStore.focusedEdges = focusedEdges;

  updateLayouts(nodeId);
  fitGraph();
}

function selectNode(nodeId) {
  applySelection(nodeId);

  if (graphStore.graphMode === "focus") {
    rebuildFocusGraph(nodeId, 1);
    applyFocus(nodeId);
    return;
  }

  clearFocusState();
}

function setGraphMode(mode) {
  if (graphStore.graphMode === mode) {
    return;
  }

  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  lastClickedNode = null;
  graphStore.graphMode = mode;
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  rebuildGraphForMode(mode);
  clearFocusState();
  updateLayouts();
  fitGraph();
}

function handleNodeClick({ node }) {
  if (graphStore.graphMode === "focus" && clickTimer && lastClickedNode === node) {
    clearTimeout(clickTimer);
    clickTimer = null;
    lastClickedNode = null;
    expandNode(node);
    selectNode(node);
    return;
  }

  lastClickedNode = node;
  clickTimer = setTimeout(() => {
    selectNode(node);
    clickTimer = null;
    lastClickedNode = null;
  }, 220);
}

function expandNode(nodeId) {
  const currentDepth = Math.max(graphStore.expandedDepths[nodeId] || 1, 1);
  const nextDepth = currentDepth + 1;

  rebuildFocusGraph(nodeId, nextDepth);
  updateLayouts(graphStore.graphMode === "focus" ? graphStore.selectedNode : null);
}

function resetGraph() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  lastClickedNode = null;
  const { nodes, edges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges,
    graphStore.graphMode
  );

  graphStore.nodes = nodes;
  graphStore.edges = edges;
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  clearFocusState();
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  updateLayouts();
  fitGraph();
}

const eventHandlers = {
  "node:click": handleNodeClick,
};

const configs = {
  view: {
    autoPanAndZoomOnLoad: "fit-content",
    fitContentMargin: 80,
    autoPanOnResize: true,
    doubleClickZoomEnabled: false,
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
        if (graphStore.selectedNode === node.id) return 12;
        if (isFocusedNode(node.id)) return node.ghost ? 9 : 10;
        return 8;
      },
      color: () => "#111111",
      background: {
        visible: false,
      },
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
      visible: false,
      text: "label",
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
      <div class="graph-mode-tabs" role="tablist" aria-label="Режим отображения графа">
        <button
          v-for="mode in GRAPH_MODES"
          :key="mode.id"
          class="graph-mode-tab"
          :class="{ active: graphStore.graphMode === mode.id }"
          type="button"
          role="tab"
          :aria-selected="graphStore.graphMode === mode.id"
          @click="setGraphMode(mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
      <div class="legend-card">
        <span class="legend-dot primary"></span>
        <span>Клик: выбрать сервис</span>
      </div>
      <div class="legend-card">
        <span class="legend-dot accent"></span>
        <span>Двойной клик: раскрыть вложенность</span>
      </div>
      <div class="legend-card">
        <span class="legend-dot child"></span>
        <span>Зелёный: дочерние модули</span>
      </div>
      <button class="ghost-button" @click="resetGraph">Сбросить вид</button>
    </div>

    <v-network-graph
      ref="graphRef"
      :nodes="displayNodes"
      :edges="displayEdges"
      :layouts="displayLayouts"
      :selected-nodes="displayNodes[graphStore.selectedNode] ? [graphStore.selectedNode] : []"
      :configs="configs"
      :event-handlers="eventHandlers"
      @update:layouts="graphStore.layouts = $event"
    >
      <template #edge-label="{ edge, area, hovered, selected, scale }">
        <VEdgeLabel
          v-if="formatEdgeLabel(edge.label)"
          :edge="edge"
          :area="area"
          :text="formatEdgeLabel(edge.label)"
          :hovered="hovered"
          :selected="selected"
          :scale="scale"
          align="center"
          vertical-align="below"
          :config="{
            fontFamily: `'Avenir Next', 'Segoe UI', sans-serif`,
            fontSize: isFocusedEdge(edge.id) ? 11 : 10,
            color: isFocusedEdge(edge.id) ? '#2f4154' : '#6f8296',
            margin: isFocusedEdge(edge.id) ? 10 : 8,
            padding: 8,
            background: {
              visible: true,
              color: isFocusedEdge(edge.id) ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.94)',
              padding: { vertical: 2, horizontal: 6 },
              borderRadius: 6,
            },
          }"
        />
      </template>
    </v-network-graph>
  </div>
</template>
