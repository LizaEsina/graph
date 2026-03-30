const DEPENDENCY_RELATIONS = new Set(["dependsOn", "consumesApi", "providesApi"]);
const CHILD_RELATIONS = new Set(["parentOf"]);
const CONTEXT_RELATIONS = new Set(["partOf"]);

export function getRelationGroup(type) {
  if (CHILD_RELATIONS.has(type)) {
    return "child";
  }

  if (DEPENDENCY_RELATIONS.has(type)) {
    return "dependency";
  }

  if (CONTEXT_RELATIONS.has(type)) {
    return "context";
  }

  return "related";
}

export function isTraversableRelation(type) {
  return DEPENDENCY_RELATIONS.has(type) || CHILD_RELATIONS.has(type);
}
