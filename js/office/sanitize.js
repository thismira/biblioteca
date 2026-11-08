// Limpeza do texto das histórias. Tudo o que entra no editor (colado do
// Google Docs, do Word, de um site, ou guardado na nuvem) passa por aqui e
// sai só com o que uma história precisa:
//   <p> parágrafo · <h3> título de cena · <hr> separador de cena (✦ ✦ ✦)
//   <strong> negrito · <em> itálico · <br> quebra de linha
// Cores, fontes, tamanhos, links, imagens e qualquer código somem. O texto
// é sempre "escapado", então nada colado vira HTML de verdade.

// Elementos que começam um bloco novo (parágrafo).
const BLOCKS = new Set([
  "P", "DIV", "LI", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER",
  "ASIDE", "MAIN", "UL", "OL", "DL", "DT", "DD", "TABLE", "TBODY", "THEAD", "TR",
  "TD", "TH", "FIGURE", "FIGCAPTION", "ADDRESS",
]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
// Elementos ignorados com tudo o que tem dentro.
const DROP = new Set([
  "SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD", "IFRAME", "OBJECT", "EMBED",
  "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "IMG", "PICTURE", "VIDEO", "AUDIO",
  "CANVAS", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "FORM",
]);
// Linha que é só um separador: "* * *", "***", "✦ ✦ ✦", "#", "~~~", "---".
const SEPARATOR = /^\s*(?:(?:[*✦•~#⁂]\s*){1,5}|[-–—]{3,})\s*$/;

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Negrito/itálico pelo estilo (o Google Docs usa <span style="font-weight:700">
// e embrulha tudo num <b style="font-weight:normal">, que NÃO é negrito).
function formatOf(el, format) {
  let { bold, italic } = format;
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") bold = true;
  if (tag === "I" || tag === "EM" || tag === "CITE") italic = true;
  const style = el.getAttribute?.("style") || "";
  const weight = style.match(/font-weight\s*:\s*([\w]+)/i)?.[1];
  if (weight) bold = /^(bold|bolder|[6-9]00)$/i.test(weight);
  const fontStyle = style.match(/font-style\s*:\s*([\w]+)/i)?.[1];
  if (fontStyle) italic = /^(italic|oblique)$/i.test(fontStyle);
  return { bold, italic };
}

// Monta a lista de blocos: { type: "p" | "h3" | "hr", parts: [{ text, bold, italic } | { br: true }] }.
function collect(rootNode) {
  const blocks = [];
  let current = null;

  const start = (type = "p") => {
    current = { type, parts: [] };
    blocks.push(current);
  };
  const end = () => (current = null);

  function walk(node, format, inBlock) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/[\s ]+/g, " ");
      if (!text) return;
      if (!current) {
        if (!text.trim()) return; // espaços soltos entre blocos
        start();
      }
      current.parts.push({ text, ...format });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const tag = node.tagName;
    if (DROP.has(tag)) return;
    if (tag === "HR") {
      end();
      blocks.push({ type: "hr", parts: [] });
      return;
    }
    if (tag === "BR") {
      // Dentro de um parágrafo é quebra de linha; solta, separa parágrafos.
      if (inBlock && current) current.parts.push({ br: true });
      else end();
      return;
    }
    const next = node.nodeType === Node.ELEMENT_NODE ? formatOf(node, format) : format;
    const isHeading = HEADINGS.has(tag);
    if (isHeading || BLOCKS.has(tag)) {
      end();
      if (isHeading) start("h3");
      for (const child of node.childNodes) walk(child, next, true);
      end();
      return;
    }
    for (const child of node.childNodes) walk(child, next, inBlock);
  }

  walk(rootNode, { bold: false, italic: false }, false);
  return blocks;
}

// Junta pedaços vizinhos com a mesma formatação e escreve o HTML do bloco.
function inlineHtml(parts) {
  // tira espaços no começo e no fim do bloco
  const items = parts.map((p) => ({ ...p }));
  while (items.length && (items[0].br || !items[0].text.trim())) items.shift();
  if (items.length && items[0].text) items[0].text = items[0].text.replace(/^ +/, "");
  while (items.length && (items.at(-1).br || !items.at(-1).text.trim())) items.pop();
  if (items.length && items.at(-1).text) items.at(-1).text = items.at(-1).text.replace(/ +$/, "");

  let html = "";
  let open = { bold: false, italic: false };
  const close = () => {
    if (open.italic) html += "</em>";
    if (open.bold) html += "</strong>";
    open = { bold: false, italic: false };
  };
  for (const item of items) {
    if (item.br) {
      close();
      html += "<br>";
      continue;
    }
    // espaço sozinho não precisa de formatação (evita <em> </em>)
    const bold = item.text.trim() ? item.bold : open.bold;
    const italic = item.text.trim() ? item.italic : open.italic;
    if (bold !== open.bold || italic !== open.italic) {
      close();
      if (bold) html += "<strong>";
      if (italic) html += "<em>";
      open = { bold, italic };
    }
    html += escape(item.text);
  }
  close();
  return html;
}

function blocksToHtml(blocks) {
  let html = "";
  for (const block of blocks) {
    if (block.type === "hr") {
      if (!html.endsWith("<hr>")) html += "<hr>"; // dois separadores seguidos = um
      continue;
    }
    const inner = inlineHtml(block.parts);
    if (!inner || inner === "<br>") continue; // parágrafo vazio
    const plain = inner.replace(/<[^>]+>/g, "");
    if (SEPARATOR.test(plain)) {
      if (!html.endsWith("<hr>")) html += "<hr>";
      continue;
    }
    html += `<${block.type}>${inner}</${block.type}>`;
  }
  return html;
}

// HTML qualquer → HTML limpo da história.
export function sanitizeHtml(dirty) {
  if (!dirty) return "";
  const doc = new DOMParser().parseFromString(dirty, "text/html");
  return blocksToHtml(collect(doc.body));
}

// Um elemento da página (ex.: o próprio editor) → HTML limpo.
export function sanitizeElement(el) {
  return blocksToHtml(collect(el));
}

// Texto puro (colado sem formatação): cada linha vira um parágrafo.
export function textToHtml(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => (SEPARATOR.test(line) ? "<hr>" : `<p>${escape(line)}</p>`))
    .join("")
    .replace(/(<hr>)+/g, "<hr>");
}

// Palavras de um texto (conta "guarda-chuva" e "d’água" como uma só).
export function countWords(text) {
  return (text || "").match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length || 0;
}
