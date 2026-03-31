import { getRelationGroup } from "./graphRelations";

export function normalizeEntityId(value) {
  if (!value) return null;

  return String(value)
    .split("(")[0]
    .split(":")
    .pop()
    .trim()
    .toLowerCase();
}

function normalizeAlias(value) {
  const id = normalizeEntityId(value);
  if (!id) return null;

  return id
    .replace(/[_\s/]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseEntityRef(value) {
  if (!value) {
    return { refType: null, alias: null };
  }

  const cleaned = String(value).split("(")[0].trim().toLowerCase();
  const colonIndex = cleaned.indexOf(":");

  if (colonIndex === -1) {
    return {
      refType: null,
      alias: normalizeAlias(cleaned),
    };
  }

  const refType = cleaned.slice(0, colonIndex).trim();
  const rawName = cleaned.slice(colonIndex + 1).trim();

  return {
    refType,
    alias: normalizeAlias(rawName),
  };
}

function collectAliases(service) {
  const bareAlias = normalizeAlias(service.id);
  const aliases = new Set();

  if (bareAlias) {
    aliases.add(bareAlias);
    aliases.add(`component:${bareAlias}`);
  }

  if (service.entityKind && bareAlias) {
    aliases.add(`${service.entityKind}:${bareAlias}`);
  }

  if (service.entityType && bareAlias) {
    aliases.add(`${service.entityType}:${bareAlias}`);
  }

  const rawAlias = normalizeAlias(service.rawId);
  if (rawAlias) {
    aliases.add(rawAlias);
  }

  return Array.from(aliases).filter(Boolean);
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
    const aliasToCanonicalId = new Map();
    const localServiceIds = new Set();
    const stats = {
      services: services.length,
      rawRelations: 0,
      addedEdges: 0,
      matchedInternal: 0,
      createdGhosts: 0,
      skippedEmpty: 0,
      skippedSelfLoops: 0,
    };
    const relationDebug = [];
  
    services.forEach((s) => {
      serviceMap[s.id] = s;
      localServiceIds.add(s.id);
  
      nodes[s.id] = {
        id: s.id,
        name: s.name,
        level: 0,
        ghost: false,
      };

      collectAliases(s).forEach((alias) => {
        aliasToCanonicalId.set(alias, s.id);
      });
    });
  
    let edgeId = 0;
  
    services.forEach((s) => {
      s.relations.forEach((rel) => {
        stats.rawRelations += 1;
        if (edgeId >= MAX_EDGES) return;
  
        const parsedTarget = parseEntityRef(rel.target);
        const normalizedTarget = parsedTarget.alias;
        if (!normalizedTarget) {
          stats.skippedEmpty += 1;
          relationDebug.push({
            source: s.id,
            rawTarget: rel.target,
            normalizedTarget,
            targetRefType: parsedTarget.refType,
            matchedAliasKey: null,
            resolvedTarget: null,
            type: rel.type || "",
            status: "skipped-empty",
          });
          return;
        }

        const candidateKeys = [];

        if (parsedTarget.refType) {
          candidateKeys.push(`${parsedTarget.refType}:${normalizedTarget}`);
        }

        if (!parsedTarget.refType || parsedTarget.refType === "component") {
          candidateKeys.push(normalizedTarget);
        }

        const matchedAliasKey = candidateKeys.find((key) => aliasToCanonicalId.has(key)) || null;
        const targetId = matchedAliasKey
          ? aliasToCanonicalId.get(matchedAliasKey)
          : normalizedTarget;

        if (targetId === s.id) {
          stats.skippedSelfLoops += 1;
          relationDebug.push({
            source: s.id,
            rawTarget: rel.target,
            normalizedTarget,
            targetRefType: parsedTarget.refType,
            matchedAliasKey,
            resolvedTarget: targetId,
            type: rel.type || "",
            status: "skipped-self-loop",
          });
          return;
        }
  
        const level = getLevel(rel.type);
        const matchedInternal = localServiceIds.has(targetId);
        const targetAlreadyExists = Boolean(nodes[targetId]);
  
        if (!targetAlreadyExists) {
          nodes[targetId] = {
            id: targetId,
            name: targetId,
            level,
            ghost: true,
          };
          stats.createdGhosts += 1;
        }

        if (matchedInternal) {
          stats.matchedInternal += 1;
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

        stats.addedEdges += 1;
        relationDebug.push({
          source: s.id,
          rawTarget: rel.target,
          normalizedTarget,
          targetRefType: parsedTarget.refType,
          matchedAliasKey,
          resolvedTarget: targetId,
          type: rel.type || "",
          status: matchedInternal
            ? "matched-internal"
            : targetAlreadyExists
              ? "ghost-reused"
              : "ghost-created",
        });
      });
    });
  
    return { nodes, edges, serviceMap, stats, relationDebug };
  }
