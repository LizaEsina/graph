<script setup>
import { computed } from "vue";
import { parseZip } from "../services/zipParser";
import { buildGraph } from "../services/graphBuilder";
import { createBaseGraph } from "../services/graphExpansion";
import { createGridLayouts } from "../services/graphLayout";
import { clearGraphStorePersistence } from "../services/storePersistence";
import { graphStore } from "../store/graphStore";

const serviceCount = computed(() => Object.keys(graphStore.serviceMap).length);
const visibleNodeCount = computed(() => Object.keys(graphStore.nodes).length);
const visibleEdgeCount = computed(() => Object.keys(graphStore.edges).length);

async function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const services = await parseZip(file);
  const graph = buildGraph(services);
  const baseGraph = createBaseGraph(graph.nodes, graph.edges, graphStore.graphMode);
  const builtEdges = Object.values(graph.edges).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relationType: edge.relationType,
    relationGroup: edge.relationGroup,
    targetIsInternal: Boolean(graph.serviceMap[edge.target]),
    visibleInitially: Boolean(baseGraph.edges[edge.id]),
  }));
  const allYamlRelations = services.flatMap((service) =>
    service.relations.map((relation, index) => ({
      source: service.id,
      sourceName: service.name,
      relationIndex: index,
      type: relation.type || "",
      target: relation.target || "",
      description: relation.description || relation.desc || "",
    }))
  );

  console.group("[graph-app] ZIP import diagnostics");
  console.log("Services parsed:", services.length);
  console.table(
    services.map((service) => ({
      id: service.id,
      rawId: service.rawId,
      name: service.name,
      relations: service.relations.length,
    }))
  );
  console.log("Graph stats:", graph.stats);
  console.log("Visible on initial screen:", {
    nodes: Object.keys(baseGraph.nodes).length,
    edges: Object.keys(baseGraph.edges).length,
  });
  console.log("All relations from YAML:", allYamlRelations.length);
  console.table(allYamlRelations);
  console.log("All built graph edges:", builtEdges.length);
  console.table(builtEdges);
  console.log(
    graphStore.graphMode === "focus"
      ? "Note: initial screen shows main local services only; nested and external relations appear after expansion in focus mode."
      : "Note: initial screen shows the full graph, including ghost/external relations, using clustered overview layout."
  );
  console.table(graph.relationDebug);
  console.groupEnd();

  window.__GRAPH_DEBUG__ = {
    services,
    graph,
    baseGraph,
    allYamlRelations,
    builtEdges,
  };

  graphStore.fullNodes = graph.nodes;
  graphStore.fullEdges = graph.edges;
  graphStore.serviceMap = graph.serviceMap;
  graphStore.graphRevision += 1;

  resetGraph();
  event.target.value = "";
}

function resetGraph() {
  const { nodes, edges } = createBaseGraph(
    graphStore.fullNodes,
    graphStore.fullEdges,
    graphStore.graphMode
  );

  graphStore.nodes = nodes;
  graphStore.edges = edges;

  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  graphStore.activeTags = [];
  graphStore.focusedNodes = new Set();
  graphStore.focusedEdges = new Set();
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  graphStore.layouts = {
    nodes: createGridLayouts(nodes, edges),
  };
  graphStore.zoomLevel = 1;
}

function clearStoredData() {
  graphStore.fullNodes = {};
  graphStore.fullEdges = {};
  graphStore.nodes = {};
  graphStore.edges = {};
  graphStore.layouts = { nodes: {} };
  graphStore.graphRevision += 1;
  graphStore.zoomLevel = 1;
  graphStore.graphMode = "all";
  graphStore.activeTags = [];
  graphStore.serviceMap = {};
  graphStore.selectedNode = null;
  graphStore.selectedService = null;
  graphStore.focusedNodes = new Set();
  graphStore.focusedEdges = new Set();
  graphStore.expandedNodes = new Set();
  graphStore.expandedDepths = {};
  graphStore.searchQuery = "";

  clearGraphStorePersistence();
}
</script>

<template>
  <div class="upload-panel compact">
    <div class="upload-actions">
      <label class="upload-control compact">
        <span>Загрузить ZIP</span>
        <input type="file" accept=".zip" @change="handleUpload" />
      </label>

      <button class="secondary-control compact" type="button" @click="clearStoredData">
        Очистить данные
      </button>
    </div>

    <div class="upload-stats">
      <div class="stat-chip compact">
        <span class="stat-label">Сервисов</span>
        <strong>{{ serviceCount }}</strong>
      </div>
      <div class="stat-chip compact">
        <span class="stat-label">Нод</span>
        <strong>{{ visibleNodeCount }}</strong>
      </div>
      <div class="stat-chip compact">
        <span class="stat-label">Связей</span>
        <strong>{{ visibleEdgeCount }}</strong>
      </div>
      <div class="stat-chip compact">
        <span class="stat-label">Формат</span>
        <strong>ZIP</strong>
      </div>
    </div>
  </div>
</template>
