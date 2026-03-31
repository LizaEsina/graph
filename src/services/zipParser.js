import JSZip from "jszip";
import yaml from "js-yaml";
import { normalizeEntityId } from "./graphBuilder";

export async function parseZip(file) {
  const zip = await JSZip.loadAsync(file);

  const services = [];
  const filesByFolder = {};

  Object.keys(zip.files).forEach((path) => {
    const parts = path.split("/");

    if (parts.length < 3) return;

    const folder = parts[1]; 

    if (!filesByFolder[folder]) {
      filesByFolder[folder] = [];
    }

    filesByFolder[folder].push(path);
  });

  for (const folder in filesByFolder) {
    const files = filesByFolder[folder];

    let yamlFile = null;
    let readmeFile = null;

    for (const filePath of files) {
      if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
        yamlFile = filePath;
      }

      if (filePath.toLowerCase().includes("readme")) {
        readmeFile = filePath;
      }
    }

    if (!yamlFile) continue;

    const yamlContent = await zip.files[yamlFile].async("string");
    const parsed = yaml.load(yamlContent);

    const rawId = parsed?.metadata?.name || folder;
    const id = normalizeEntityId(rawId) || folder;
    const name = parsed?.metadata?.displayName || rawId;
    const tags = Array.isArray(parsed?.metadata?.tags) ? parsed.metadata.tags : [];
    const entityKind = String(parsed?.kind || "Component").toLowerCase();
    const entityType = String(parsed?.spec?.type || "").toLowerCase();
    const relations = parsed?.spec?.relations || [];

    let readmeContent = null;
    if (readmeFile) {
      readmeContent = await zip.files[readmeFile].async("string");
    }

    services.push({
      folder,
      id,
      rawId,
      name,
      tags,
      entityKind,
      entityType,
      relations,
      yamlRaw: yamlContent,
      readmeRaw: readmeContent,
    });
  }

  return services;
}
