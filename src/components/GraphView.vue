<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { createBaseGraph, expandGraphFromNode } from "../services/graphExpansion";
import { createFocusLayouts, createGridLayouts, getFocusState } from "../services/graphLayout";
import { graphStore } from "../store/graphStore";

defineProps({
  sidebarOpen: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["toggle-sidebar"]);

const graphRef = ref(null);
const zoomLevel = ref(graphStore.zoomLevel || 1);
const tagsModalOpen = ref(false);
let clickTimer = null;
let lastClickedNode = null;
let zoomFrame = 0;
let pendingZoomLevel = zoomLevel.value;
const ZOOM_STEP = 0.04;

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
const MAX_LAYOUT_ABS = 20000;
const zoomTier = computed(() => {
  const zoom = zoomLevel.value || 1;

  if (zoom < 0.11) {
    return "far";
  }

  if (zoom < 0.28) {
    return "mid";
  }

  if (zoom < 0.56) {
    return "near";
  }

  return "close";
});

const overviewLabelNodeIds = computed(() => {
  if (graphStore.graphMode === "focus") {
    return new Set(Object.keys(graphStore.nodes));
  }

  const serviceIds = Object.keys(graphStore.nodes).filter((id) => !graphStore.nodes[id]?.ghost);

  if (zoomTier.value === "close" || zoomTier.value === "near") {
    return new Set(serviceIds);
  }

  if (zoomTier.value === "far") {
    return new Set();
  }

  const degreeMap = new Map(serviceIds.map((id) => [id, 0]));

  Object.values(graphStore.edges).forEach((edge) => {
    if (degreeMap.has(edge.source)) {
      degreeMap.set(edge.source, degreeMap.get(edge.source) + 1);
    }

    if (degreeMap.has(edge.target)) {
      degreeMap.set(edge.target, degreeMap.get(edge.target) + 1);
    }
  });

  const sortedIds = serviceIds
    .filter((id) => hasValidLayoutPosition(graphStore.layouts.nodes[id]))
    .sort((leftId, rightId) => {
      const degreeDelta = (degreeMap.get(rightId) || 0) - (degreeMap.get(leftId) || 0);

      if (degreeDelta !== 0) {
        return degreeDelta;
      }

      const left = graphStore.layouts.nodes[leftId];
      const right = graphStore.layouts.nodes[rightId];

      if (left.y !== right.y) {
        return left.y - right.y;
      }

      return left.x - right.x;
    });

  const minDistance = zoomTier.value === "far" ? 240 : 190;
  const selectedIds = new Set();
  const selectedPoints = [];

  sortedIds.forEach((id) => {
    const point = graphStore.layouts.nodes[id];
    const overlapsExisting = selectedPoints.some((selectedPoint) => {
      const dx = selectedPoint.x - point.x;
      const dy = selectedPoint.y - point.y;
      return Math.hypot(dx, dy) < minDistance;
    });

    if (!overlapsExisting) {
      selectedIds.add(id);
      selectedPoints.push(point);
    }
  });

  if (graphStore.selectedNode && graphStore.nodes[graphStore.selectedNode] && !graphStore.nodes[graphStore.selectedNode]?.ghost) {
    selectedIds.add(graphStore.selectedNode);
  }

  return selectedIds;
});

const renderEdgeLabels = computed(() => {
  if (graphStore.graphMode === "focus") {
    return true;
  }

  return zoomTier.value === "near" || zoomTier.value === "close";
});

function quantizeZoom(value) {
  const safeValue = Number.isFinite(value) ? value : 1;
  return Math.round(safeValue / ZOOM_STEP) * ZOOM_STEP;
}

function shouldShowNodeLabel(node) {
  if (graphStore.selectedNode === node.id) {
    return true;
  }

  if (graphStore.graphMode === "focus") {
    return true;
  }

  if (zoomTier.value === "far") {
    return false;
  }

  if (zoomTier.value === "mid") {
    return !node.ghost && !isTagDimmedNode(node.id) && overviewLabelNodeIds.value.has(node.id);
  }

  if (zoomTier.value === "near") {
    return !node.ghost || isFocusedNode(node.id);
  }

  return true;
}

function shouldShowEdgeLabel(edge) {
  if (!edge) {
    return false;
  }

  if (!isTagHighlightedEdge(edge)) {
    return false;
  }

  if (!renderEdgeLabels.value) {
    return false;
  }

  if (graphStore.graphMode === "focus") {
    return true;
  }

  if (zoomTier.value === "close") {
    return true;
  }

  if (zoomTier.value === "near") {
    const sourceNode = graphStore.nodes[edge.source];
    const targetNode = graphStore.nodes[edge.target];

    return (
      sourceNode?.ghost ||
      targetNode?.ghost ||
      (sourceNode && shouldShowNodeLabel(sourceNode)) ||
      (targetNode && shouldShowNodeLabel(targetNode))
    );
  }

  return false;
}

function getServiceTags(nodeId) {
  const service = graphStore.serviceMap[nodeId];
  return Array.isArray(service?.tags) ? service.tags.map(normalizeText).filter(Boolean) : [];
}

const selectedTags = computed(() => new Set(graphStore.activeTags || []));

function isTagMatch(nodeId) {
  if (selectedTags.value.size === 0) {
    return true;
  }

  return getServiceTags(nodeId).some((tag) => selectedTags.value.has(tag));
}

function isTagDimmedNode(nodeId) {
  return selectedTags.value.size > 0 && !isTagMatch(nodeId);
}

function isTagHighlightedEdge(edge) {
  if (!edge) {
    return false;
  }

  if (selectedTags.value.size === 0) {
    return true;
  }

  return isTagMatch(edge.source) || isTagMatch(edge.target);
}

function isFocusedNode(nodeId) {
  if (graphStore.graphMode !== "focus") {
    return true;
  }

  return graphStore.focusedNodes.size === 0 || graphStore.focusedNodes.has(nodeId);
}

function isFocusedEdge(edgeId) {
  if (!edgeId) {
    return false;
  }

  if (graphStore.graphMode !== "focus") {
    return true;
  }

  return graphStore.focusedEdges.size === 0 || graphStore.focusedEdges.has(edgeId);
}

function getEdgeColor(edge) {
  if (!edge) {
    return "#a8b7c7";
  }

  if (!isTagHighlightedEdge(edge)) {
    return "rgba(180, 191, 205, 0.18)";
  }

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

function hasFinitePosition(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function hasValidLayoutPosition(point) {
  return (
    Number.isFinite(point?.x) &&
    Number.isFinite(point?.y) &&
    Math.abs(point.x) <= MAX_LAYOUT_ABS &&
    Math.abs(point.y) <= MAX_LAYOUT_ABS
  );
}

function hasFiniteEdgeLabelArea(area) {
  return (
    hasFinitePosition(area?.source?.above) &&
    hasFinitePosition(area?.source?.below) &&
    hasFinitePosition(area?.target?.above) &&
    hasFinitePosition(area?.target?.below)
  );
}

function areLayoutsEqual(leftNodes = {}, rightNodes = {}) {
  const leftIds = Object.keys(leftNodes);
  const rightIds = Object.keys(rightNodes);

  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((id) => {
    const left = leftNodes[id];
    const right = rightNodes[id];

    return left?.x === right?.x && left?.y === right?.y;
  });
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

const availableTags = computed(() =>
  Array.from(
    new Set(
      Object.values(graphStore.serviceMap)
        .flatMap((service) => service.tags || [])
        .map(normalizeText)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))
);

function toggleTag(tag) {
  if (selectedTags.value.has(tag)) {
    graphStore.activeTags = graphStore.activeTags.filter((currentTag) => currentTag !== tag);
    return;
  }

  graphStore.activeTags = [...graphStore.activeTags, tag];
}

function clearTags() {
  graphStore.activeTags = [];
}

function closeTagsModal() {
  tagsModalOpen.value = false;
}

function handleZoomLevelUpdate(value) {
  const nextZoomLevel = quantizeZoom(value);

  if (Math.abs(nextZoomLevel - zoomLevel.value) < ZOOM_STEP / 2) {
    return;
  }

  pendingZoomLevel = nextZoomLevel;

  if (zoomFrame) {
    return;
  }

  zoomFrame = window.requestAnimationFrame(() => {
    zoomLevel.value = pendingZoomLevel;
    zoomFrame = 0;
  });
}

onBeforeUnmount(() => {
  if (zoomFrame) {
    window.cancelAnimationFrame(zoomFrame);
  }
});

watch(
  () => graphStore.graphRevision,
  () => {
    if (zoomFrame) {
      window.cancelAnimationFrame(zoomFrame);
      zoomFrame = 0;
    }

    pendingZoomLevel = graphStore.zoomLevel || 1;
    zoomLevel.value = pendingZoomLevel;
    tagsModalOpen.value = false;
  }
);

const displayNodeIds = computed(() => {
  const query = normalizeText(graphStore.searchQuery);
  const ids = Object.keys(graphStore.nodes);

  if (graphStore.graphMode === "focus" && graphStore.selectedNode) {
    return ids;
  }

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
      .map((id) => {
        const layout = graphStore.layouts.nodes[id];
        if (!hasValidLayoutPosition(layout)) {
          return [id, null];
        }

        return [id, layout];
      })
      .filter(([, layout]) => Boolean(layout))
  ),
}));

function handleLayoutsUpdate(nextLayouts) {
  if (graphStore.graphMode === "focus") {
    const normalizedNodes = Object.fromEntries(
      Object.entries(nextLayouts?.nodes || {})
        .filter(([, layout]) => hasValidLayoutPosition(layout))
        .map(([id, layout]) => [
          id,
          {
            x: Math.round(layout.x),
            y: Math.round(layout.y),
          },
        ])
    );

    if (areLayoutsEqual(graphStore.layouts.nodes, normalizedNodes)) {
      return;
    }

    graphStore.layouts = {
      nodes: normalizedNodes,
    };
    return;
  }
}

function updateLayouts(focusNodeId = null) {
  const targetFocusNodeId = graphStore.graphMode === "focus" ? focusNodeId : null;

  graphStore.layouts = {
    nodes: targetFocusNodeId
      ? createFocusLayouts(graphStore.nodes, graphStore.edges, targetFocusNodeId)
      : createGridLayouts(graphStore.nodes, graphStore.edges),
  };
}

async function fitGraph(options = {}) {
  const { margin = 80, resetZoom = false } = options;

  if (resetZoom) {
    zoomLevel.value = 1;
  }

  await nextTick();
  await graphRef.value?.fitToContents({ margin });
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
  const expandedDepths = { ...graphStore.expandedDepths };

  if (selectedNodeId && selectedDepth > 0) {
    expandedDepths[selectedNodeId] = Math.max(expandedDepths[selectedNodeId] || 0, selectedDepth);
  }

  let nodes = {};
  let edges = {};

  if (selectedNodeId && graphStore.fullNodes[selectedNodeId]) {
    nodes[selectedNodeId] = graphStore.fullNodes[selectedNodeId];
  }

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
  fitGraph({ margin: 64, resetZoom: true });
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

function openNodeInFocusMode(nodeId) {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  lastClickedNode = null;
  graphStore.graphMode = "focus";
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  graphStore.layouts = { nodes: {} };
  clearFocusState();
  rebuildFocusGraph(nodeId, 1);
  applyFocus(nodeId);
}

function handleNodeClick({ node }) {
  if (clickTimer && lastClickedNode === node) {
    clearTimeout(clickTimer);
    clickTimer = null;
    lastClickedNode = null;

    if (graphStore.graphMode === "focus") {
      expandNode(node);
      applyFocus(node);
      return;
    }

    openNodeInFocusMode(node);
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
  fitGraph({ margin: 64 });
}

function resetGraph() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  lastClickedNode = null;
  graphStore.graphMode = "all";
  const { nodes, edges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges,
    "all"
  );

  graphStore.nodes = nodes;
  graphStore.edges = edges;
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  clearFocusState();
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  updateLayouts();
  fitGraph({ margin: 80, resetZoom: true });
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
    minZoomLevel: 0.08,
    maxZoomLevel: 4,
  },

  node: {
    draggable: true,
    normal: {
      type: "circle",
      radius: (node) => {
        const isOverview = graphStore.graphMode === "all";
        const serviceScale =
          !isOverview
            ? 1
            : zoomTier.value === "far"
              ? 0.84
              : zoomTier.value === "mid"
                ? 0.92
                : 1;
        const ghostScale =
          !isOverview
            ? 1
            : zoomTier.value === "far"
              ? 0.32
              : zoomTier.value === "mid"
                ? 0.46
                : zoomTier.value === "near"
                  ? 0.64
                  : 1;

        if (graphStore.selectedNode && graphStore.selectedNode === node.id) return 23 * serviceScale;
        if (node.ghost) return (isFocusedNode(node.id) ? 15 : 12) * ghostScale;
        return (isFocusedNode(node.id) ? 19 : 14) * serviceScale;
      },
      color: (node) => {
        if (isTagDimmedNode(node.id)) {
          return node.ghost ? "#eef2f6" : "#e7edf3";
        }

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
        if (isTagDimmedNode(node.id)) return "#dbe3ec";
        return isFocusedNode(node.id) ? "#7d92aa" : "#d4dde8";
      },
    },
    label: {
      visible: (node) => shouldShowNodeLabel(node),
      text: (node) => node.name || node.id,
      fontFamily: "'Avenir Next', 'Segoe UI', sans-serif",
      fontSize: (node) => {
        const sizeByTier =
          zoomTier.value === "far"
            ? graphStore.selectedNode === node.id
              ? 12
              : node.ghost
                ? 8
                : 9
            : zoomTier.value === "mid"
              ? graphStore.selectedNode === node.id
                ? 14
                : node.ghost
                  ? 10
                  : 10
              : graphStore.selectedNode === node.id
                ? 15
                : isFocusedNode(node.id)
                  ? (node.ghost ? 10 : 12)
                  : 10;

        return sizeByTier;
      },
      color: (node) => (isTagDimmedNode(node.id) ? "#a5b3c1" : "#111111"),
      background: {
        visible: false,
      },
      lineHeight: 1.2,
      direction: "south",
      directionAutoAdjustment: true,
      margin: zoomTier.value === "far" ? 14 : 18,
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
    gap: 36,
    normal: {
      width: (edge) => {
        if (!edge) {
          return 1;
        }

        if (!isTagHighlightedEdge(edge)) {
          return 0.9;
        }

        return isFocusedEdge(edge.id) ? 3 : 1.3;
      },
      color: (edge) => getEdgeColor(edge),
      dasharray: (edge) => {
        if (!edge) {
          return 0;
        }

        if (!isTagHighlightedEdge(edge)) {
          return "4 9";
        }

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
    <div class="graph-controls">
      <div class="graph-toolbar">
        <label class="search-field">
          <input
            v-model="graphStore.searchQuery"
            type="text"
            placeholder="Поиск сервиса"
          />
        </label>
        <button class="secondary-chip" type="button" @click="tagsModalOpen = true">
          Теги
          <span class="chip-count" :class="{ active: selectedTags.size > 0 }">
            {{ selectedTags.size > 0 ? selectedTags.size : availableTags.length }}
          </span>
        </button>
        <div class="legend-card compact">
          <span class="legend-dot primary"></span>
          <span>Клик: выбрать сервис</span>
        </div>
        <div class="legend-card compact">
          <span class="legend-dot accent"></span>
          <span>Двойной клик: открыть в фокусе и углубить</span>
        </div>
        <div class="legend-card compact">
          <span class="legend-dot child"></span>
          <span>Зелёный: дочерние модули</span>
        </div>
        <button class="secondary-chip" type="button" @click="emit('toggle-sidebar')">
          {{ sidebarOpen ? "Скрыть панель" : "Показать панель" }}
        </button>
        <button class="ghost-button" @click="resetGraph">Сбросить вид</button>
      </div>
    </div>

    <div v-if="tagsModalOpen" class="tags-modal-backdrop" @click="closeTagsModal">
      <div class="tags-modal" role="dialog" aria-modal="true" aria-label="Фильтр по тегам" @click.stop>
        <div class="tags-modal-header">
          <div>
            <strong>Фильтр по тегам</strong>
            <p>Можно выбрать несколько тегов. Ноды без них будут приглушены.</p>
          </div>
          <div class="tags-modal-actions">
            <button
              v-if="selectedTags.size > 0"
              class="tags-modal-clear"
              type="button"
              @click="clearTags"
            >
              Сбросить теги
            </button>
            <button class="tags-modal-close" type="button" @click="closeTagsModal">Закрыть</button>
          </div>
        </div>
        <div v-if="availableTags.length" class="tag-pills modal" aria-label="Фильтр по тегам">
          <button
            v-for="tag in availableTags"
            :key="tag"
            class="tag-pill"
            :class="{ active: selectedTags.has(tag) }"
            type="button"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
        <p v-else class="tag-panel-empty">Теги появятся после загрузки графа</p>
      </div>
    </div>

    <v-network-graph
      :key="graphStore.graphRevision"
      ref="graphRef"
      class="graph-network"
      :nodes="displayNodes"
      :edges="displayEdges"
      :layouts="displayLayouts"
      :zoom-level="zoomLevel"
      :selected-nodes="displayNodes[graphStore.selectedNode] ? [graphStore.selectedNode] : []"
      :configs="configs"
      :event-handlers="eventHandlers"
      @update:layouts="handleLayoutsUpdate"
      @update:zoomLevel="handleZoomLevelUpdate"
    >
      <template #edge-label="{ edge, area, hovered, selected, scale }">
        <VEdgeLabel
          v-if="renderEdgeLabels && edge && shouldShowEdgeLabel(edge) && formatEdgeLabel(edge.label) && hasFiniteEdgeLabelArea(area)"
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
            fontSize: isFocusedEdge(edge?.id) ? 11 : 10,
            color: !isTagHighlightedEdge(edge) ? '#a7b4c1' : isFocusedEdge(edge?.id) ? '#2f4154' : '#6f8296',
            lineHeight: 1.2,
            margin: isFocusedEdge(edge?.id) ? 10 : 8,
            padding: 8,
            background: {
              visible: false,
            },
          }"
        />
      </template>
    </v-network-graph>
  </div>
</template>
