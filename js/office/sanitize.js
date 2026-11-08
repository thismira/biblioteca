// Limpeza do texto das histórias. Tudo o que entra no editor (colado do
// Google Docs, do Word, de um site, ou guardado na nuvem) passa por aqui e
// sai só com o que uma história precisa:
//   <p> parágrafo · <h3> título de cena · <hr> separador de cena (✦ ✦ ✦)
//   <ul>/<ol> com <li> (listas, um nível só)
//   <strong> negrito · <em> itálico · <u> sublinhado · <s> riscado · <br>
//   alinhamento do parágrafo: style="text-align:left|center|right|justify"
// Cores, fontes, tamanhos, links, imagens e qualquer código somem (fonte e
// tamanho valem para o texto todo, nas configurações da história). O texto
// é sempre "escapado", então nada colado vira HTML de verdade.

// Elementos que começam um bloco novo (parágrafo).
const BLOCKS = new Set([
  "P", "DIV", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER",
  "ASIDE", "MAIN", "DL", "DT", "DD", "TABLE", "TBODY", "THEAD", "TR",
  "TD", "TH", "FIGURE", "FIGCAPTION", "ADDRESS",
]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
// Elementos ignorados com tudo o que tem dentro.
const DROP = new Set([
  "SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD", "IFRAME", "OBJECT", "EMBED",
  "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "IMG", "PICTURE", "VIDEO", "AUDIO",
  "CANVAS", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "FORM",
]);
const ALIGNS = ["left", "center", "right", "justify"];
// Linha que é só um separador: "* * *", "***", "✦ ✦ ✦", "#", "~~~", "---".
const SEPARATOR = /^\s*(?:(?:[*✦•~#⁂]\s*){1,5}|[-–—]{3,})\s*$/;
// Formatação de trecho, na ordem em que as tags se aninham.
const FORMATS = [["bold", "strong"], ["italic", "em"], ["underline", "u"], ["strike", "s"]];
const PLAIN = { bold: false, italic: false, underline: false, strike: false };

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Formatação pelo nome da tag e pelo estilo. O Google Docs usa
// <span style="font-weight:700; font-style:italic; text-decoration:underline">
// e embrulha tudo num <b style="font-weight:normal">, que NÃO é negrito.
function formatOf(el, format) {
  let { bold, italic, underline, strike } = format;
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") bold = true;
  if (tag === "I" || tag === "EM" || tag === "CITE") italic = true;
  if (tag === "U" || tag === "INS") underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") strike = true;
  const style = el.getAttribute?.("style") || "";
  const weight = style.match(/font-weight\s*:\s*([\w]+)/i)?.[1];
  if (weight) bold = /^(bold|bolder|[6-9]00)$/i.test(weight);
  const fontStyle = style.match(/font-style\s*:\s*([\w]+)/i)?.[1];
  if (fontStyle) italic = /^(italic|oblique)$/i.test(fontStyle);
  const deco = style.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/i)?.[1]?.toLowerCase();
  // (links colados chegam sublinhados: o sublinhado de link não conta)
  if (deco && !el.closest?.("a")) {
    underline = deco.includes("underline");
    strike = deco.includes("line-through");
  }
  return { bold, italic, underline, strike };
}

function alignOf(el) {
  if (el.nodeType !== Node.ELEMENT_NODE) return null;
  const value = (el.style?.textAlign || el.getAttribute("align") || "").toLowerCase();
  return ALIGNS.includes(value) ? value : null;
}

// Monta a lista de blocos:
// { type: "p" | "h3" | "li" | "hr", align, list: "ul" | "ol", parts: [{ text, bold, … } | { br: true }] }
function collect(rootNode) {
  const blocks = [];
  let current = null;

  const start = (type, ctx) => {
    current = { type, align: ctx.align, list: ctx.list, parts: [] };
    blocks.push(current);
  };
  const end = () => (current = null);
  const children = (node, ctx) => {
    for (const child of node.childNodes) walk(child, ctx);
  };

  function walk(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/[\s ]+/g, " ");
      if (!text) return;
      if (!current) {
        if (!text.trim()) return; // espaços soltos entre blocos
        start(ctx.li ? "li" : "p", ctx);
      }
      current.parts.push({ text, ...ctx.format });
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
      if (ctx.inBlock && current) current.parts.push({ br: true });
      else end();
      return;
    }
    const format = node.nodeType === Node.ELEMENT_NODE ? formatOf(node, ctx.format) : ctx.format;
    const align = alignOf(node) || ctx.align;

    if (tag === "UL" || tag === "OL") {
      // Listas dentro de listas ficam num nível só.
      end();
      children(node, { format, inBlock: false, align: null, list: tag === "OL" ? "ol" : "ul", li: false });
      end();
      return;
    }
    if (tag === "LI") {
      end();
      const c = { format, inBlock: true, align, list: ctx.list || "ul", li: true };
      start("li", c);
      children(node, c);
      end();
      return;
    }
    if (ctx.li) {
      // Dentro de um item (o Google Docs põe <p> no <li>): não quebra o item.
      if (current && !current.align && alignOf(node)) current.align = alignOf(node);
      children(node, { ...ctx, format });
      return;
    }
    if (HEADINGS.has(tag)) {
      end();
      const c = { format, inBlock: true, align, list: null, li: false };
      start("h3", c);
      children(node, c);
      end();
      return;
    }
    if (BLOCKS.has(tag)) {
      end();
      children(node, { format, inBlock: true, align, list: null, li: false });
      end();
      return;
    }
    children(node, { ...ctx, format });
  }

  walk(rootNode, { format: PLAIN, inBlock: false, align: null, list: null, li: false });
  return blocks;
}

// Junta pedaços vizinhos com a mesma formatação e escreve o HTML do bloco.
function inlineHtml(parts) {
  // tira quebras e espaços no começo e no fim do bloco
  const items = parts.map((p) => ({ ...p }));
  while (items.length && (items[0].br || !items[0].text.trim())) items.shift();
  if (items.length) items[0].text = items[0].text.replace(/^ +/, "");
  while (items.length && (items.at(-1).br || !items.at(-1).text.trim())) items.pop();
  if (items.length) items.at(-1).text = items.at(-1).text.replace(/ +$/, "");

  let html = "";
  let open = { ...PLAIN };
  const close = () => {
    for (const [key, tag] of [...FORMATS].reverse()) if (open[key]) html += `</${tag}>`;
    open = { ...PLAIN };
  };
  for (const item of items) {
    if (item.br) {
      close();
      html += "<br>";
      continue;
    }
    // espaço sozinho não muda a formatação (evita <em> </em>)
    const want = item.text.trim() ? item : open;
    if (FORMATS.some(([key]) => Boolean(want[key]) !== open[key])) {
      close();
      for (const [key, tag] of FORMATS) {
        if (want[key]) html += `<${tag}>`;
        open[key] = Boolean(want[key]);
      }
    }
    html += escape(item.text);
  }
  close();
  return html;
}

function blocksToHtml(blocks) {
  let html = "";
  let openList = null;
  const closeList = () => {
    if (openList) html += `</${openList}>`;
    openList = null;
  };
  const addHr = () => {
    closeList();
    if (!html.endsWith("<hr>")) html += "<hr>"; // dois separadores seguidos = um
  };
  for (const block of blocks) {
    if (block.type === "hr") {
      addHr();
      continue;
    }
    const inner = inlineHtml(block.parts);
    if (!inner || inner === "<br>") continue; // bloco vazio
    if (block.type === "p" && SEPARATOR.test(inner.replace(/<[^>]+>/g, ""))) {
      addHr();
      continue;
    }
    const attr = block.align ? ` style="text-align:${block.align}"` : "";
    if (block.type === "li") {
      if (openList !== block.list) {
        closeList();
        html += `<${block.list}>`;
        openList = block.list;
      }
      html += `<li${attr}>${inner}</li>`;
      continue;
    }
    closeList();
    html += `<${block.type}${attr}>${inner}</${block.type}>`;
  }
  closeList();
  return html;
}

// HTML qualquer → HTML limpo da história.
export function sanitizeHtml(dirty) {
  if (!dirty) return "";
  const doc = new DOMParser().parseFromString(dirty, "text/html");
  return blocksToHtml(collect(doc.body));
}

// Um elemento da página (ex.: o próprio editor) → HTML limpo.
// (O editor guarda fonte e tamanho em variáveis CSS, que não contam.)
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
