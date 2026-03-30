<script setup>
import { computed, ref } from "vue";
import UploadPanel from "./components/UploadPanel.vue";
import GraphView from "./components/GraphView.vue";
import Sidebar from "./components/Sidebar.vue";
import { graphStore } from "./store/graphStore";

const visibleNodeCount = computed(() => Object.keys(graphStore.nodes).length);
const visibleEdgeCount = computed(() => Object.keys(graphStore.edges).length);
const sidebarOpen = ref(true);
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <div class="main-panel">
      <UploadPanel />
      <div class="graph-frame">
        <div class="frame-header">
          <div>
            <h2>Карта зависимостей</h2>
          </div>

          <div class="frame-actions">
            <div class="stat-chip">
              <span class="stat-label">Нод</span>
              <strong>{{ visibleNodeCount }}</strong>
            </div>
            <div class="stat-chip">
              <span class="stat-label">Связей</span>
              <strong>{{ visibleEdgeCount }}</strong>
            </div>
            <button class="secondary-control" type="button" @click="sidebarOpen = !sidebarOpen">
              {{ sidebarOpen ? "Скрыть панель" : "Показать панель" }}
            </button>
          </div>
        </div>

        <GraphView class="graph-canvas" />
      </div>
    </div>

    <Sidebar :open="sidebarOpen" @close="sidebarOpen = false" />
  </div>
</template>
