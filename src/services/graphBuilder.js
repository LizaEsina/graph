import { getRelationGroup } from "./graphRelations";

function normalizeTarget(target) {
    if (!target) return null;
  
    return target
      .split("(")[0]      
      .split(":").pop()   
      .trim()
      .toLowerCase();     
  }
  

  export const COLORS = [
    '#78E5D5', '#6A56E9', '#ACB0FF', '#FFDD6C', '#FFA66F',
    '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'
  ];
  
  function getLevel(type) {
    switch (type) {
      case "partOf": return 1;
      case "parentOf": return 2;
      case "dependsOn": return 3;
      case "consumesApi": return 4;
      case "providesApi": return 5;
      default: return 0;
    }
  }
  
  const MAX_EDGES = 300;
  
  export function buildGraph(services) {
    const nodes = {};
    const edges = {};
    const serviceMap = {};
  
    // ✅ 1. создаём ноды (БЕЗ edgeId)
    services.forEach((s) => {
      serviceMap[s.id] = s;
  
      nodes[s.id] = {
        id: s.id,
        name: s.name,
        level: 0,
        ghost: false,
      };
    });
  
    // ✅ 2. создаём связи
    let edgeId = 0;
  
    services.forEach((s) => {
      s.relations.forEach((rel) => {
        if (edgeId >= MAX_EDGES) return;
  
        const targetId = normalizeTarget(rel.target);
        if (!targetId) return;
        if (targetId === s.id) return;
  
        const level = getLevel(rel.type);
  
        if (!nodes[targetId]) {
          nodes[targetId] = {
            id: targetId,
            name: targetId,
            level,
            ghost: true,
          };
        }
  
        nodes[targetId].level = Math.max(nodes[targetId].level || 0, level);
  
        const id = "e" + edgeId++;

        edges[id] = {
          id,
          source: s.id,
          target: targetId,
          relationType: rel.type || "",
          relationGroup: getRelationGroup(rel.type),
          label: rel.type || "",
        };
      });
    });
  
    return { nodes, edges, serviceMap };
  }
