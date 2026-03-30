<script setup>
import { computed } from "vue";
import { parseZip } from "../services/zipParser";
import { buildGraph } from "../services/graphBuilder";
import { createBaseGraph } from "../services/graphExpansion";
import { createGridLayouts } from "../services/graphLayout";
import { clearGraphStorePersistence } from "../services/storePersistence";
import { graphStore } from "../store/graphStore";

const serviceCount = computed(() => Object.keys(graphStore.serviceMap).length);

async function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const services = await parseZip(file);
  const graph = buildGraph(services);

  graphStore.fullNodes = graph.nodes;
  graphStore.fullEdges = graph.edges;
  graphStore.serviceMap = graph.serviceMap;

  resetGraph();
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
  graphStore.layouts = {
    nodes: createGridLayouts(nodes),
  };
  graphStore.zoomLevel = 1;
}

function clearStoredData() {
  graphStore.fullNodes = {};
  graphStore.fullEdges = {};
  graphStore.nodes = {};
  graphStore.edges = {};
  graphStore.layouts = { nodes: {} };
  graphStore.zoomLevel = 1;
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
  <div class="upload-panel">

    <div class="upload-actions">
      <label class="upload-control">
        <span>Загрузить ZIP</span>
        <input type="file" accept=".zip" @change="handleUpload" />
      </label>

      <button class="secondary-control" type="button" @click="clearStoredData">
        Очистить данные
      </button>
    </div>

    <div class="upload-stats">
      <div class="stat-chip">
        <span class="stat-label">Сервисов</span>
        <strong>{{ serviceCount }}</strong>
      </div>
      <div class="stat-chip">
        <span class="stat-label">Формат</span>
        <strong>ZIP</strong>
      </div>
    </div>
  </div>
</template>
