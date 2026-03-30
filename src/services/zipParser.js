import JSZip from "jszip";
import yaml from "js-yaml";

export async function parseZip(file) {
  const zip = await JSZip.loadAsync(file);

  const services = [];
  const filesByFolder = {};

  // группируем по ВТОРОМУ уровню (после root папки)
  Object.keys(zip.files).forEach((path) => {
    const parts = path.split("/");

    if (parts.length < 3) return;

    const folder = parts[1]; // ВАЖНО

    if (!filesByFolder[folder]) {
      filesByFolder[folder] = [];
    }

    filesByFolder[folder].push(path);
  });

  // обрабатываем каждую папку
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

    // ✅ ПРАВИЛЬНЫЙ ПАРСИНГ
    const id = parsed?.metadata?.name || folder;
    const name = parsed?.metadata?.displayName || id;
    const relations = parsed?.spec?.relations || [];

    let readmeContent = null;
    if (readmeFile) {
      readmeContent = await zip.files[readmeFile].async("string");
    }

    services.push({
      folder,
      id,
      name,
      relations,
      yamlRaw: yamlContent,
      readmeRaw: readmeContent,
    });
  }

  return services;
}