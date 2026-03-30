import { reactive } from "vue";

export const graphStore = reactive({
  fullNodes: {},
  fullEdges: {},

  nodes: {},
  edges: {},
  layouts: {
    nodes: {},
  },
  zoomLevel: 1,
  graphMode: "all",

  serviceMap: {},

  selectedNode: null,
  selectedService: null,
  focusedNodes: new Set(),
  focusedEdges: new Set(),

  expandedNodes: new Set(),
  expandedDepths: {},
  searchQuery: "",
  highlightNodes: new Set(),
  highlightEdges: new Set(),
});
