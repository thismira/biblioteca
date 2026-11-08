// Lê um arquivo Word (.docx), como o que o Google Docs baixa em
// Arquivo → Fazer download → Microsoft Word. Tudo acontece no navegador:
// o arquivo não é enviado a lugar nenhum.
//
// Um .docx é um "zip" com arquivos XML dentro. Aqui:
//   1. abrimos o zip (DecompressionStream, sem bibliotecas);
//   2. lemos word/document.xml (o texto), styles.xml (quais estilos são
//      títulos) e numbering.xml (listas com marcador ou número);
//   3. devolvemos uma lista de "nós": títulos { kind: "heading", level, text }
//      e parágrafos { kind: "block", html, text }.
// O HTML dos parágrafos ainda passa pela limpeza (sanitize.js) depois.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ---------- Zip ----------

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Devolve { "word/document.xml": Uint8Array, … } só com os arquivos pedidos.
async function unzip(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Fim do "índice" do zip: assinatura 0x06054b50, perto do fim do arquivo.
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 70000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Esse arquivo não parece ser um .docx.");
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = {};
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const size = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const local = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    if (wanted.includes(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      files[name] = method === 8 ? await inflate(data) : method === 0 ? data : null;
    }
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ---------- XML ----------

const parseXml = (data) => data && new DOMParser().parseFromString(new TextDecoder().decode(data), "application/xml");
const kids = (el, name) => [...(el?.children || [])].filter((c) => c.namespaceURI === W && c.localName === name);
const kid = (el, name) => kids(el, name)[0] || null;
const val = (el) => el?.getAttributeNS(W, "val") ?? el?.getAttribute("w:val") ?? null;
// <w:b/> liga; <w:b w:val="0"/> ou "false" desliga.
const on = (el) => Boolean(el) && !["0", "false", "none", "off"].includes(val(el));

// Estilos: id → nível de título (0 = "Título", 1 = "Título 1"…) e tamanho padrão.
function readStyles(doc) {
  const levels = new Map();
  if (!doc) return { levels, defaultSize: 22 };
  for (const style of doc.getElementsByTagNameNS(W, "style")) {
    const id = style.getAttributeNS(W, "styleId") || style.getAttribute("w:styleId");
    const name = (val(kid(style, "name")) || "").toLowerCase();
    const outline = val(kid(kid(style, "pPr"), "outlineLvl"));
    let level = null;
    if (name === "title" || name === "título") level = 0;
    else if (/^(heading|título)\s*(\d)$/.test(name)) level = Number(name.match(/(\d)$/)[1]);
    else if (outline != null && Number(outline) < 9) level = Number(outline) + 1;
    if (id && level != null) levels.set(id, level);
  }
  const size = val(doc.getElementsByTagNameNS(W, "rPrDefault")[0]?.getElementsByTagNameNS(W, "sz")[0]);
  return { levels, defaultSize: Number(size) || 22 };
}

// Listas: numId → "ul" (marcador) ou "ol" (número).
function readNumbering(doc) {
  const lists = new Map();
  if (!doc) return lists;
  const abstract = new Map();
  for (const a of doc.getElementsByTagNameNS(W, "abstractNum")) {
    const lvl0 = kids(a, "lvl").find((l) => (l.getAttributeNS(W, "ilvl") || l.getAttribute("w:ilvl")) === "0") || kid(a, "lvl");
    const format = val(kid(lvl0, "numFmt"));
    abstract.set(a.getAttributeNS(W, "abstractNumId") || a.getAttribute("w:abstractNumId"), format === "bullet" || !format ? "ul" : "ol");
  }
  for (const num of doc.getElementsByTagNameNS(W, "num")) {
    const id = num.getAttributeNS(W, "numId") || num.getAttribute("w:numId");
    lists.set(id, abstract.get(val(kid(num, "abstractNumId"))) || "ul");
  }
  return lists;
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ALIGN = { center: "center", right: "right", end: "right", both: "justify", distribute: "justify" };

// Um parágrafo do Word → { text, html, style, align, list, bold, size }.
function readParagraph(p, numbering, defaultSize) {
  const pPr = kid(p, "pPr");
  const style = val(kid(pPr, "pStyle"));
  const align = ALIGN[val(kid(pPr, "jc"))] || null;
  const numId = val(kid(kid(pPr, "numPr"), "numId"));
  const list = numId && numId !== "0" ? numbering.get(numId) || "ul" : null;
  const outline = val(kid(pPr, "outlineLvl"));

  let html = "";
  let text = "";
  let boldChars = 0;
  const sizes = []; // [tamanho, letras]

  function run(r, inLink) {
    const rPr = kid(r, "rPr");
    const f = {
      b: on(kid(rPr, "b")),
      i: on(kid(rPr, "i")),
      // (o sublinhado de um link não conta)
      u: !inLink && Boolean(kid(rPr, "u")) && val(kid(rPr, "u")) !== "none",
      s: on(kid(rPr, "strike")) || on(kid(rPr, "dstrike")),
    };
    // sem tamanho no trecho = o tamanho padrão do documento
    const size = Number(val(kid(rPr, "sz"))) || defaultSize;
    let piece = "";
    for (const c of r.children) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === "t") piece += c.textContent;
      else if (c.localName === "tab") piece += " ";
      else if (c.localName === "noBreakHyphen") piece += "-";
      else if (c.localName === "br" || c.localName === "cr") {
        if ((c.getAttributeNS(W, "type") || c.getAttribute("w:type")) === "page") continue; // quebra de página: ignora
        flush(piece, f);
        piece = "";
        html += "<br>";
        text += "\n";
      }
    }
    flush(piece, f, size);
  }

  function flush(piece, f, size = 0) {
    if (!piece) return;
    let h = escape(piece);
    if (f.s) h = `<s>${h}</s>`;
    if (f.u) h = `<u>${h}</u>`;
    if (f.i) h = `<em>${h}</em>`;
    if (f.b) h = `<strong>${h}</strong>`;
    html += h;
    text += piece;
    const letters = piece.replace(/\s/g, "").length;
    if (f.b) boldChars += letters;
    sizes.push([size, letters]);
  }

  // Percorre o parágrafo na ordem (links, revisões, campos…).
  (function walk(el, inLink) {
    for (const c of el.children) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === "r") run(c, inLink);
      else if (["pPr", "del", "moveFrom", "instrText", "rPr"].includes(c.localName)) continue; // não é texto visível
      else walk(c, inLink || c.localName === "hyperlink"); // hyperlink, ins, smartTag, fldSimple, sdt…
    }
  })(p, false);

  const letters = text.replace(/\s/g, "").length;
  const weighted = sizes.filter(([s]) => s).reduce((a, [s, l]) => a + s * l, 0);
  const sized = sizes.filter(([s]) => s).reduce((a, [, l]) => a + l, 0);
  return {
    text: text.replace(/\s+/g, " ").trim(),
    html,
    style,
    outline: outline != null ? Number(outline) + 1 : null,
    align,
    list,
    bold: letters > 0 && boldChars / letters > 0.9,
    size: sized ? weighted / sized : 0,
  };
}

// Corpo do documento: parágrafos, também os de dentro de tabelas e caixas.
function paragraphs(body) {
  const out = [];
  (function walk(el) {
    for (const c of el.children) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === "p") out.push(c);
      else if (["tbl", "tr", "tc", "sdt", "sdtContent", "customXml"].includes(c.localName)) walk(c);
    }
  })(body);
  return out;
}

// Linha que parece título mesmo sem estilo: curta, sem ponto final, e em
// negrito, com letra maior ou começando com "Capítulo", "Parte"…
const NAMED = /^(cap[ií]tulo|parte|livro|pr[oó]logo|ep[ií]logo|interl[uú]dio)\b/i;
function looksLikeHeading(p, bodySize) {
  if (!p.text || p.text.length > 80 || p.list) return false;
  if (/[.,;:!?…"”»)]$/.test(p.text) && !NAMED.test(p.text)) return false;
  return NAMED.test(p.text) || p.bold || (p.size && p.size >= bodySize * 1.2);
}

// Abre o .docx e devolve { nodes, levels: [níveis usados], guessed }.
// `guessed` = true quando não havia estilos de título e os títulos foram
// deduzidos (linhas curtas em negrito/maiores).
export async function readDocx(file) {
  const files = await unzip(await file.arrayBuffer(), ["word/document.xml", "word/styles.xml", "word/numbering.xml"]);
  const doc = parseXml(files["word/document.xml"]);
  const body = doc?.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("Não achei texto nesse arquivo. Ele foi baixado como Word (.docx)?");
  const { levels: styleLevels, defaultSize } = readStyles(parseXml(files["word/styles.xml"]));
  const numbering = readNumbering(parseXml(files["word/numbering.xml"]));
  const list = paragraphs(body).map((p) => readParagraph(p, numbering, defaultSize));

  // Tamanho "normal" da letra: o mais usado no texto.
  const bySize = new Map();
  list.forEach((p) => p.size && bySize.set(Math.round(p.size), (bySize.get(Math.round(p.size)) || 0) + p.text.length));
  const bodySize = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] || defaultSize;

  let levelOf = (p) => (p.text ? styleLevels.get(p.style) ?? p.outline : null);
  let guessed = false;
  if (!list.some((p) => levelOf(p) != null)) {
    // Sem estilos de título: deduz. Letra maior = nível mais alto.
    guessed = true;
    const candidates = list.filter((p) => looksLikeHeading(p, bodySize));
    const sizes = [...new Set(candidates.map((p) => Math.round(Math.max(p.size || bodySize, bodySize))))].sort((a, b) => b - a);
    levelOf = (p) => (candidates.includes(p) ? 1 + sizes.indexOf(Math.round(Math.max(p.size || bodySize, bodySize))) : null);
  }

  const nodes = [];
  for (const p of list) {
    const level = levelOf(p);
    if (level != null) {
      nodes.push({ kind: "heading", level, text: p.text });
      continue;
    }
    if (!p.text) continue;
    const attr = p.align ? ` style="text-align:${p.align}"` : "";
    const html = p.list ? `<${p.list}><li${attr}>${p.html}</li></${p.list}>` : `<p${attr}>${p.html}</p>`;
    nodes.push({ kind: "block", html, text: p.text });
  }
  const levels = [...new Set(nodes.filter((n) => n.kind === "heading").map((n) => n.level))].sort((a, b) => a - b);
  return { nodes, levels, guessed };
}
