<script setup>
import { computed, ref, watch } from "vue";
import { graphStore } from "../store/graphStore";

const activeTab = ref("yaml");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  if (!markdown) {
    return "<p>README отсутствует</p>";
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const codeBlocks = [];

  let prepared = normalized.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.push({
      language: escapeHtml(language || ""),
      code: escapeHtml(code.trim()),
    }) - 1;

    return `@@CODEBLOCK_${index}@@`;
  });

  const blocks = prepared
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const html = blocks
    .map((block) => {
      if (/^@@CODEBLOCK_\d+@@$/.test(block)) {
        const index = Number(block.match(/\d+/)?.[0]);
        const item = codeBlocks[index];
        const language = item.language ? `<div class="md-code-lang">${item.language}</div>` : "";
        return `<pre class="md-code-block">${language}<code>${item.code}</code></pre>`;
      }

      if (block.startsWith(">")) {
        const content = block
          .split("\n")
          .map((line) => line.replace(/^>\s?/, ""))
          .join(" ");
        return `<blockquote>${formatInlineMarkdown(content)}</blockquote>`;
      }

      if (/^- /.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.replace(/^- /, "").trim())
          .map((line) => `<li>${formatInlineMarkdown(line)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      if (/^\d+\. /.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.replace(/^\d+\. /, "").trim())
          .map((line) => `<li>${formatInlineMarkdown(line)}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      const heading = block.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`;
      }

      return `<p>${formatInlineMarkdown(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return html;
}

const renderedReadme = computed(() => renderMarkdown(graphStore.selectedService?.readmeRaw));

watch(
  () => graphStore.selectedNode,
  () => {
    activeTab.value = "yaml";
  }
);
</script>

<template>
  <aside class="sidebar">
    <div v-if="graphStore.selectedNode">
      <p class="sidebar-eyebrow">Текущий фокус</p>
      <h2 class="sidebar-title">{{ graphStore.selectedNode }}</h2>

      <div v-if="!graphStore.selectedService">
        <div class="empty-card">
          Это external зависимость. Для неё можно посмотреть связи на графе, но локального YAML/README нет.
        </div>
      </div>

      <div v-else class="sidebar-card">
        <div class="tab-row" role="tablist" aria-label="Service content tabs">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'yaml' }"
            @click="activeTab = 'yaml'"
            role="tab"
            :aria-selected="activeTab === 'yaml'"
          >
            YAML
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'readme' }"
            @click="activeTab = 'readme'"
            role="tab"
            :aria-selected="activeTab === 'readme'"
          >
            README
          </button>
        </div>

        <div v-if="activeTab === 'yaml'" class="content-card">
          <pre class="content-pre">
{{ graphStore.selectedService.yamlRaw }}
          </pre>
        </div>

        <div v-if="activeTab === 'readme'" class="content-card">
          <div class="markdown-body" v-html="renderedReadme"></div>
        </div>
      </div>
    </div>

    <div v-else class="empty-card">
      Выберите ноду на графе. Сервис окажется в фокусе, а справа откроются YAML и README.
    </div>
  </aside>
</template>
