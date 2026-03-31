import { reactive } from "vue";

export const graphStore = reactive({
  fullNodes: {},
  fullEdges: {},

  nodes: {},
  edges: {},
  layouts: {
    nodes: {},
  },
  graphRevision: 0,
  zoomLevel: 1,
  graphMode: "all",
  activeTags: [],

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
