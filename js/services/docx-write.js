// Monta um arquivo Word (.docx) no navegador, sem bibliotecas: abre no
// Word, no Google Docs e no LibreOffice. Usado por "Baixar história".
//
// Um .docx é um zip com XMLs: o texto (document.xml), os estilos
// (styles.xml) e as listas (numbering.xml). Os capítulos chegam no HTML
// limpo do escritório (sanitize.js): p, h3, hr, ul/ol/li, strong, em, u,
// s, br e text-align.

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const JC = { center: "center", right: "right", justify: "both", left: "left" };

// ---------- Zip (com CRC32 e compressão do próprio navegador) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = await deflate(raw);
    const nameBytes = enc.encode(name);
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);        // versão necessária
    local.setUint16(6, 0x0800, true);    // nomes em UTF-8
    local.setUint16(8, 8, true);         // deflate
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((sum, p) => sum + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ---------- HTML do capítulo → parágrafos do Word ----------

function runs(node, format = {}) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue.replace(/\s+/g, " ");
      if (!text) continue;
      // (a ordem importa para o Word: b, i, strike, u)
      const rPr = [format.b && "<w:b/>", format.i && "<w:i/>", format.s && "<w:strike/>", format.u && `<w:u w:val="single"/>`].filter(Boolean).join("");
      out += `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName;
      if (tag === "BR") {
        out += "<w:r><w:br/></w:r>";
        continue;
      }
      out += runs(child, {
        b: format.b || tag === "STRONG" || tag === "B",
        i: format.i || tag === "EM" || tag === "I",
        u: format.u || tag === "U",
        s: format.s || tag === "S",
      });
    }
  }
  return out;
}

// (a ordem dentro de w:pPr importa para o Word: pStyle, pageBreakBefore, numPr, ind, jc)
const paragraph = (content, { style, align, numId, pageBreak } = {}) => {
  const pPr = [
    style && `<w:pStyle w:val="${style}"/>`,
    pageBreak && "<w:pageBreakBefore/>",
    numId && `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`,
    numId && `<w:ind w:left="720" w:hanging="360"/>`,
    align && JC[align] && `<w:jc w:val="${JC[align]}"/>`,
  ].filter(Boolean).join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
};

const textRun = (text) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const alignOf = (el) => (el.getAttribute("style") || "").match(/text-align:\s*(\w+)/)?.[1] || null;

// Devolve os parágrafos e a lista de numerações usadas (uma por lista numerada).
function chapterBody(html, numbering) {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  let out = "";
  let first = true; // o primeiro parágrafo depois de um título não tem recuo
  for (const el of doc.body.children) {
    const tag = el.tagName;
    if (tag === "H3") {
      out += paragraph(runs(el), { style: "Cena", align: alignOf(el) });
      first = true;
    } else if (tag === "HR") {
      out += paragraph(textRun("✦   ✦   ✦"), { style: "Separador" });
      first = true;
    } else if (tag === "UL" || tag === "OL") {
      const numId = tag === "UL" ? 1 : numbering.newOrdered();
      for (const li of el.children) out += paragraph(runs(li), { numId, align: alignOf(li) });
      first = true;
    } else {
      out += paragraph(runs(el), { style: first ? "PrimeiroParagrafo" : null, align: alignOf(el) });
      first = false;
    }
  }
  return out;
}

// ---------- Arquivo ----------

// story: { title, synopsis, layout: { font, size, spacing, paragraphs } }
// chapters: [{ title, html }]
export async function buildStoryDocx(story, chapters) {
  const layout = story.layout;
  const half = Math.round(layout.size * 2);      // tamanho em meios-pontos
  const line = Math.round(240 * layout.spacing); // espaçamento entre linhas
  const book = layout.paragraphs !== "docs";     // recuo na 1ª linha, sem espaço entre parágrafos
  const font = esc(layout.font);

  let ordered = 1;
  const orderedIds = [];
  const numbering = { newOrdered: () => { ordered += 1; orderedIds.push(ordered); return ordered; } };

  let body = paragraph(textRun(story.title || "Sem título"), { style: "Title" });
  if (story.synopsis) body += paragraph(textRun(story.synopsis), { style: "Subtitle" });
  chapters.forEach((c) => {
    body += paragraph(textRun(c.title || "Sem título"), { style: "Heading1", pageBreak: true });
    body += chapterBody(c.html, numbering);
  });

  const document = `${XML_HEAD}<w:document ${W_NS}><w:body>${body}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body></w:document>`;

  const style = (id, name, pPr, rPr, { basedOn = "Normal", next = "Normal", outline } = {}) => `
    <w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}<w:next w:val="${next}"/><w:qFormat/>
      <w:pPr>${pPr}${outline != null ? `<w:outlineLvl w:val="${outline}"/>` : ""}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  const styles = `${XML_HEAD}<w:styles ${W_NS}>
    <w:docDefaults>
      <w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${half}"/><w:szCs w:val="${half}"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>
      <w:pPrDefault><w:pPr><w:spacing w:after="${book ? 0 : 160}" w:line="${line}" w:lineRule="auto"/>${book ? `<w:ind w:firstLine="567"/>` : ""}</w:pPr></w:pPrDefault>
    </w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
    ${style("PrimeiroParagrafo", "Primeiro parágrafo", `<w:ind w:firstLine="0"/>`, "", { next: "Normal" })}
    ${style("Title", "Title", `<w:spacing w:before="2400" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, `<w:sz w:val="56"/><w:szCs w:val="56"/>`, { next: "Subtitle" })}
    ${style("Subtitle", "Subtitle", `<w:spacing w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, `<w:i/><w:color w:val="6E5560"/>`)}
    ${style("Heading1", "heading 1", `<w:keepNext/><w:spacing w:before="1200" w:after="600"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, `<w:sz w:val="${half + 16}"/><w:szCs w:val="${half + 16}"/>`, { next: "PrimeiroParagrafo", outline: 0 })}
    ${style("Cena", "heading 2", `<w:keepNext/><w:spacing w:before="360" w:after="180"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, `<w:b/><w:sz w:val="${half + 4}"/><w:szCs w:val="${half + 4}"/>`, { next: "PrimeiroParagrafo", outline: 1 })}
    ${style("Separador", "Separador de cena", `<w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, `<w:color w:val="9E4A65"/>`)}
  </w:styles>`;

  const numberingXml = `${XML_HEAD}<w:numbering ${W_NS}>
    <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    ${orderedIds.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("")}
  </w:numbering>`;

  return zip({
    "[Content_Types].xml": `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
    </Types>`,
    "_rels/.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
    "word/_rels/document.xml.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
    </Relationships>`,
    "word/document.xml": document,
    "word/styles.xml": styles,
    "word/numbering.xml": numberingXml,
  });
}
