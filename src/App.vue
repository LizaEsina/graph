<script setup>
import { ref } from "vue";
import UploadPanel from "./components/UploadPanel.vue";
import GraphView from "./components/GraphView.vue";
import Sidebar from "./components/Sidebar.vue";
const sidebarOpen = ref(true);
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <div class="main-panel">
      <UploadPanel />
      <div class="graph-frame">
        <GraphView
          class="graph-canvas"
          :sidebar-open="sidebarOpen"
          @toggle-sidebar="sidebarOpen = !sidebarOpen"
        />
      </div>
    </div>

    <Sidebar :open="sidebarOpen" @close="sidebarOpen = false" />
  </div>
</template>
