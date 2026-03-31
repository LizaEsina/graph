import yaml from "js-yaml";

const STORAGE_KEY = "graph-app-store-v1";

function serializeSet(set) {
  return Array.from(set || []);
}

function deserializeSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function extractTagsFromYaml(yamlRaw) {
  if (!yamlRaw) {
    return [];
  }

  try {
    const parsed = yaml.load(yamlRaw);
    return Array.isArray(parsed?.metadata?.tags) ? parsed.metadata.tags : [];
  } catch {
    return [];
  }
}

function normalizeServiceMap(serviceMap) {
  return Object.fromEntries(
    Object.entries(serviceMap || {}).map(([id, service]) => {
      if (Array.isArray(service?.tags) && service.tags.length > 0) {
        return [id, service];
      }

      return [
        id,
        {
          ...service,
          tags: extractTagsFromYaml(service?.yamlRaw),
        },
      ];
    })
  );
}

function normalizeActiveTags(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeLayouts(layouts) {
  return {
    nodes: Object.fromEntries(
      Object.entries(layouts?.nodes || {}).filter(([, layout]) => {
        return (
          Number.isFinite(layout?.x) &&
          Number.isFinite(layout?.y) &&
          Math.abs(layout.x) <= 20000 &&
          Math.abs(layout.y) <= 20000
        );
      })
    ),
  };
}

export function createGraphStoreSnapshot(store) {
  return {
    fullNodes: store.fullNodes,
    fullEdges: store.fullEdges,
    nodes: store.nodes,
    edges: store.edges,
    layouts: normalizeLayouts(store.layouts),
    graphRevision: store.graphRevision,
    zoomLevel: store.zoomLevel,
    graphMode: store.graphMode,
    activeTags: store.activeTags,
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
    store.layouts = normalizeLayouts(snapshot.layouts);
    store.graphRevision = snapshot.graphRevision || 0;
    store.zoomLevel = snapshot.zoomLevel || 1;
    store.graphMode = snapshot.graphMode || "all";
    store.activeTags = normalizeActiveTags(snapshot.activeTags ?? snapshot.activeTag);
    store.serviceMap = normalizeServiceMap(snapshot.serviceMap || {});
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
