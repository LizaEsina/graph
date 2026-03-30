const STORAGE_KEY = "graph-app-store-v1";

function serializeSet(set) {
  return Array.from(set || []);
}

function deserializeSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

export function createGraphStoreSnapshot(store) {
  return {
    fullNodes: store.fullNodes,
    fullEdges: store.fullEdges,
    nodes: store.nodes,
    edges: store.edges,
    layouts: store.layouts,
    zoomLevel: store.zoomLevel,
    serviceMap: store.serviceMap,
    selectedNode: store.selectedNode,
    focusedNodes: serializeSet(store.focusedNodes),
    focusedEdges: serializeSet(store.focusedEdges),
    expandedNodes: serializeSet(store.expandedNodes),
    expandedDepths: store.expandedDepths,
    searchQuery: store.searchQuery,
  };
}

export function saveGraphStore(store) {
  try {
    const snapshot = createGraphStoreSnapshot(store);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Failed to save graph store", error);
  }
}

export function hydrateGraphStore(store) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const snapshot = JSON.parse(raw);

    store.fullNodes = snapshot.fullNodes || {};
    store.fullEdges = snapshot.fullEdges || {};
    store.nodes = snapshot.nodes || {};
    store.edges = snapshot.edges || {};
    store.layouts = snapshot.layouts || { nodes: {} };
    store.zoomLevel = snapshot.zoomLevel || 1;
    store.serviceMap = snapshot.serviceMap || {};
    store.selectedNode = snapshot.selectedNode || null;
    store.selectedService = store.selectedNode ? store.serviceMap[store.selectedNode] || null : null;
    store.focusedNodes = deserializeSet(snapshot.focusedNodes);
    store.focusedEdges = deserializeSet(snapshot.focusedEdges);
    store.expandedNodes = deserializeSet(snapshot.expandedNodes);
    store.expandedDepths = snapshot.expandedDepths || {};
    store.searchQuery = snapshot.searchQuery || "";
  } catch (error) {
    console.warn("Failed to hydrate graph store", error);
  }
}

export function clearGraphStorePersistence() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear graph store", error);
  }
}
