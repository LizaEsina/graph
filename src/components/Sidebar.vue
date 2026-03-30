<script setup>
import { computed, ref, watch } from "vue";
import { graphStore } from "../store/graphStore";

defineProps({
  open: {
    type: Boolean,
    default: true,
  },
});

defineEmits(["close"]);

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

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];

  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBuffer = [];
  let listType = null;
  let listBuffer = [];
  let quoteBuffer = [];
  let tableBuffer = [];
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    html.push(`<p>${formatInlineMarkdown(paragraphBuffer.join(" ")).replace(/\n/g, "<br>")}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length || !listType) return;
    html.push(`<${listType}>${listBuffer.join("")}</${listType}>`);
    listBuffer = [];
    listType = null;
  };

  const flushQuote = () => {
    if (!quoteBuffer.length) return;
    html.push(`<blockquote>${formatInlineMarkdown(quoteBuffer.join(" "))}</blockquote>`);
    quoteBuffer = [];
  };

  const flushTable = () => {
    if (!tableBuffer.length) return;

    const rows = tableBuffer
      .filter((line) => !/^\|\s*[:-]+/.test(line.trim()))
      .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
    );

    if (!rows.length) {
      tableBuffer = [];
      return;
    }

    const [header, ...body] = rows;
    const thead = `<thead><tr>${header
      .map((cell) => `<th>${formatInlineMarkdown(cell)}</th>`)
      .join("")}</tr></thead>`;
    const tbody = body.length
      ? `<tbody>${body
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${formatInlineMarkdown(cell)}</td>`).join("")}</tr>`
          )
          .join("")}</tbody>`
      : "";

    html.push(`<table>${thead}${tbody}</table>`);
    tableBuffer = [];
  };

  const flushCode = () => {
    if (!codeBuffer.length && !codeLanguage) return;
    const language = codeLanguage ? `<div class="md-code-lang">${escapeHtml(codeLanguage)}</div>` : "";
    html.push(
      `<pre class="md-code-block">${language}<code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`
    );
    codeLanguage = "";
    codeBuffer = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();

      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.replace(/```/, "").trim();
      } else {
        inCodeBlock = false;
        flushCode();
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      return;
    }

    if (/^\|(.+)\|$/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      tableBuffer.push(line);
      return;
    }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      html.push("<hr>");
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      flushTable();
      quoteBuffer.push(line.replace(/^>\s?/, ""));
      return;
    }

    if (/^- /.test(line)) {
      flushParagraph();
      flushQuote();
      flushTable();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listBuffer.push(`<li>${formatInlineMarkdown(line.replace(/^- /, "").trim())}</li>`);
      return;
    }

    if (/^\d+\. /.test(line)) {
      flushParagraph();
      flushQuote();
      flushTable();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listBuffer.push(`<li>${formatInlineMarkdown(line.replace(/^\d+\. /, "").trim())}</li>`);
      return;
    }

    flushList();
    flushQuote();
    flushTable();
    paragraphBuffer.push(line);

    if (index === lines.length - 1) {
      flushParagraph();
    }
  });

  flushParagraph();
  flushList();
  flushQuote();
  flushTable();
  flushCode();

  return html.join("");
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
  <aside class="sidebar" :class="{ hidden: !open }">
    <div v-if="graphStore.selectedNode">
      <div class="sidebar-header">
        <div>
          <p class="sidebar-eyebrow">Текущий фокус</p>
          <h2 class="sidebar-title">{{ graphStore.selectedNode }}</h2>
        </div>
        <button class="sidebar-close" type="button" @click="$emit('close')">Скрыть</button>
      </div>

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
      <div class="sidebar-header">
        <p class="sidebar-eyebrow">Детали</p>
        <button class="sidebar-close" type="button" @click="$emit('close')">Скрыть</button>
      </div>
      Выберите ноду на графе. Сервис окажется в фокусе, а справа откроются YAML и README.
    </div>
  </aside>
</template>
