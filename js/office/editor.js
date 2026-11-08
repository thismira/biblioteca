// Editor de escrita, no jeito do Google Docs: título no alto, barra de
// formatação completa, páginas A4 brancas sobre fundo cinza e sumário das
// cenas à esquerda.
//
// - Texto com `contenteditable` (sem bibliotecas) + `execCommand`.
// - Fonte, tamanho, espaçamento e estilo dos parágrafos valem para o TEXTO
//   TODO e ficam guardados na história (`story.layout`, db.storyLayout):
//   todos os capítulos dela usam o mesmo visual.
// - Páginas: a folha tem fundo de páginas A4; um parágrafo que não cabe no
//   fim da página passa inteiro para a próxima (regras `nth-child` num
//   <style> próprio — o texto dela nunca é alterado para isso).
// - Colar: tudo passa por sanitize.js.
// - Salvar sozinho 1 s depois que ela para de digitar, ao trocar de tela e
//   ao fechar a página. ANTES de cada envio o texto é guardado neste
//   aparelho (rascunho); a nuvem confirmou → o rascunho some.
// - Sem internet: tenta de novo sozinho (a cada 15 s e quando a conexão
//   volta). Outro aparelho salvou no meio: nada é sobrescrito, a versão
//   daqui vira "(cópia deste aparelho)" (db.keepBothVersions).

import * as db from "../data/db.js";
import { sanitizeHtml, sanitizeElement, textToHtml, countWords } from "./sanitize.js";
import { alertDialog, chooseDialog, confirmDialog, toast } from "../ui/dialogs.js";

const SAVE_DELAY = 1000;   // ms sem digitar para salvar
const RETRY_DELAY = 15000; // ms entre tentativas quando a gravação falha
const COUNT_DELAY = 250;   // ms para atualizar contagem, páginas e sumário

// Página A4 a 96 pontos por polegada (como o navegador mede): 21 × 29,7 cm.
const PAGE_H = 1123;
const PAGE_GAP = 16;               // espaço cinza entre as páginas
const PAGE_STEP = PAGE_H + PAGE_GAP;
const MARGIN = 96;                 // margem de 2,54 cm (a do Google Docs)
const CONTENT_H = PAGE_H - 2 * MARGIN;
const pagedQuery = matchMedia("(min-width: 900px)"); // celular: folha contínua

export const FONTS = {
  "Lora": `"Lora", Georgia, serif`,
  "EB Garamond": `"EB Garamond", Garamond, serif`,
  "Cormorant Garamond": `"Cormorant Garamond", Garamond, serif`,
  "Times New Roman": `"Times New Roman", Times, serif`,
  "Georgia": `Georgia, serif`,
  "Arial": `Arial, Helvetica, sans-serif`,
  "Courier Prime": `"Courier Prime", "Courier New", monospace`,
};
const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
const SPACINGS = [["1", "Simples"], ["1.15", "1,15"], ["1.5", "1,5"], ["2", "Duplo"]];

const EMPTY = "<p><br></p>";
const time = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const day = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const n = (x) => x.toLocaleString("pt-BR");

// Ícones da barra (traço simples, como os do Docs).
const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  undo: icon(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  redo: icon(`<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`),
  left: icon(`<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>`),
  center: icon(`<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>`),
  right: icon(`<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>`),
  justify: icon(`<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>`),
  bullets: icon(`<circle cx="5" cy="7" r="1.3"/><circle cx="5" cy="12" r="1.3"/><circle cx="5" cy="17" r="1.3"/><path d="M9.5 7H20M9.5 12H20M9.5 17H20"/>`),
  numbers: icon(`<path d="M4 5.5h1.5V10M4 10h3M4 14.5c.3-.6.9-1 1.6-1 .8 0 1.4.5 1.4 1.2 0 1.3-3 1.9-3 3.3h3M10.5 7H20M10.5 12H20M10.5 17H20"/>`),
  outline: icon(`<path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10"/>`),
};

export function createEditor(root, { onBack, onOpenChapter }) {
  const option = (value, label) => `<option value="${value}">${label}</option>`;
  root.innerHTML = `
    <div class="ed-cabecalho">
      <header class="ed-topo">
        <button class="ed-voltar" type="button" data-acao="voltar" aria-label="Voltar ao Manuscrito">←<span> Manuscrito</span></button>
        <div class="ed-doc">
          <input class="ed-titulo" maxlength="80" aria-label="Título do capítulo" placeholder="Título do capítulo">
          <div class="ed-doc-info"><span class="ed-historia"></span><span class="ed-status" aria-live="polite"></span></div>
        </div>
        <button class="ed-botao" type="button" data-acao="foco">Modo foco</button>
      </header>
      <div class="ed-ferramentas" role="toolbar" aria-label="Formatação">
        <button type="button" data-cmd="undo" aria-label="Desfazer" title="Desfazer (⌘Z)">${ICONS.undo}</button>
        <button type="button" data-cmd="redo" aria-label="Refazer" title="Refazer (⇧⌘Z)">${ICONS.redo}</button>
        <span class="ed-div"></span>
        <select data-ctl="estilo" aria-label="Estilo do parágrafo" title="Estilo do parágrafo">
          ${option("p", "Texto normal")}${option("h3", "Título de cena")}
        </select>
        <span class="ed-div"></span>
        <select data-ctl="fonte" aria-label="Fonte (texto todo)" title="Fonte (vale para a história toda)">
          ${Object.keys(FONTS).map((f) => option(f, f)).join("")}
        </select>
        <span class="ed-div"></span>
        <button type="button" data-tam="-1" aria-label="Diminuir a letra" title="Diminuir a letra">−</button>
        <select data-ctl="tamanho" class="ed-tamanho" aria-label="Tamanho da letra (texto todo)" title="Tamanho da letra (vale para a história toda)">
          ${SIZES.map((s) => option(s, s)).join("")}
        </select>
        <button type="button" data-tam="1" aria-label="Aumentar a letra" title="Aumentar a letra">+</button>
        <span class="ed-div"></span>
        <button type="button" data-cmd="bold" aria-label="Negrito" title="Negrito (⌘B)"><b>N</b></button>
        <button type="button" data-cmd="italic" aria-label="Itálico" title="Itálico (⌘I)"><i>I</i></button>
        <button type="button" data-cmd="underline" aria-label="Sublinhado" title="Sublinhado (⌘U)"><u>S</u></button>
        <button type="button" data-cmd="strikeThrough" aria-label="Riscado" title="Riscado"><s>R</s></button>
        <span class="ed-div"></span>
        <button type="button" data-cmd="justifyLeft" aria-label="Alinhar à esquerda" title="Alinhar à esquerda">${ICONS.left}</button>
        <button type="button" data-cmd="justifyCenter" aria-label="Centralizar" title="Centralizar">${ICONS.center}</button>
        <button type="button" data-cmd="justifyRight" aria-label="Alinhar à direita" title="Alinhar à direita">${ICONS.right}</button>
        <button type="button" data-cmd="justifyFull" aria-label="Justificar" title="Justificar">${ICONS.justify}</button>
        <span class="ed-div"></span>
        <select data-ctl="espaco" aria-label="Espaçamento entre linhas (texto todo)" title="Espaçamento entre linhas">
          ${SPACINGS.map(([v, t]) => option(v, `Espaço ${t}`)).join("")}
        </select>
        <select data-ctl="paragrafos" aria-label="Estilo dos parágrafos (texto todo)" title="Estilo dos parágrafos">
          ${option("livro", "Parágrafos: livro")}${option("docs", "Parágrafos: Docs")}
        </select>
        <span class="ed-div"></span>
        <button type="button" data-cmd="insertUnorderedList" aria-label="Lista com marcadores" title="Lista com marcadores">${ICONS.bullets}</button>
        <button type="button" data-cmd="insertOrderedList" aria-label="Lista numerada" title="Lista numerada">${ICONS.numbers}</button>
        <button type="button" data-cmd="separador" aria-label="Separador de cena" title="Separador de cena (✦ ✦ ✦)" class="ed-estrela">✦</button>
        <span class="ed-div ed-div-sumario"></span>
        <button type="button" data-acao="sumario" class="ed-bt-sumario" aria-label="Mostrar o sumário" title="Sumário" aria-pressed="true">${ICONS.outline}</button>
      </div>
    </div>
    <div class="ed-corpo">
      <aside class="ed-sumario" aria-label="Sumário do capítulo">
        <h2>Sumário</h2>
        <ol></ol>
        <p class="ed-sumario-vazio">Os títulos de cena aparecem aqui.</p>
      </aside>
      <div class="ed-paginas">
        <article class="ed-folha">
          <div class="ed-texto" contenteditable="false" role="textbox" aria-multiline="true"
            aria-label="Texto do capítulo" spellcheck="true" lang="pt-BR" data-placeholder="Era uma vez…"></div>
        </article>
        <nav class="ed-vizinhos" aria-label="Outros capítulos"></nav>
      </div>
    </div>
    <footer class="ed-rodape"><span class="ed-pagina"></span><span class="ed-contagem"></span></footer>
    <button class="ed-sair-foco" type="button" data-acao="foco">Sair do foco</button>
    <style class="ed-quebras"></style>`;

  const $ = (sel) => root.querySelector(sel);
  const text = $(".ed-texto");
  const sheet = $(".ed-folha");
  const titleInput = $(".ed-titulo");
  const statusEl = $(".ed-status");
  const breaks = $(".ed-quebras");

  let storyId = null;
  let chapterId = null;
  let base = null;        // última versão confirmada pela nuvem
  let dirty = false;      // há mudanças que a nuvem ainda não tem
  let saving = null;      // promessa da gravação em andamento
  let saveAgain = false;  // mudou de novo durante a gravação
  let saveTimer = null;
  let retryTimer = null;
  let countTimer = null;
  let words = 0;
  let pages = 1;
  let openToken = 0;      // abrir outro capítulo cancela uma abertura antiga
  let lastRange = null;   // onde estava o cursor (os menus tiram o foco do texto)

  // Parágrafos novos viram <p> (e não <div>).
  document.execCommand("defaultParagraphSeparator", false, "p");

  // ---------- Visual do texto (vale para a história toda) ----------

  const layout = () => db.storyLayout(db.getStory(storyId));

  function applyLayout() {
    const l = layout();
    text.style.setProperty("--ed-fonte", FONTS[l.font] || FONTS.Lora);
    text.style.setProperty("--ed-tamanho", `${l.size}pt`);
    text.style.setProperty("--ed-linha", l.spacing);
    text.classList.toggle("paragrafos-docs", l.paragraphs === "docs");
    $('[data-ctl="fonte"]').value = l.font;
    $('[data-ctl="tamanho"]').value = l.size;
    $('[data-ctl="espaco"]').value = String(l.spacing);
    $('[data-ctl="paragrafos"]').value = l.paragraphs;
    refreshSoon();
  }

  function setLayout(changes) {
    if (!storyId) return;
    const next = { ...layout(), ...changes };
    db.updateStory(storyId, { layout: next }).catch((err) => toast(err.message));
    applyLayout();
  }

  // ---------- Mostrar ----------

  // Folha vazia mostra "Era uma vez…" (some ao digitar).
  const markEmpty = () => text.classList.toggle("folha-vazia", !text.textContent.trim() && !text.querySelector("hr"));

  function setStatus(message, kind = "") {
    statusEl.textContent = message;
    statusEl.dataset.tipo = kind;
  }

  function renderCounts() {
    const story = db.getStory(storyId);
    if (!story || !base) return;
    const storyWords = Math.max(0, story.words - base.words + words);
    const todayWords = Math.max(0, db.wordsToday(storyId) + words - base.words);
    $(".ed-contagem").innerHTML = `
      <span><b>${n(words)}</b> ${words === 1 ? "palavra" : "palavras"}</span>
      <span class="ed-na-historia"><b>${n(storyWords)}</b> na história</span>
      <span class="ed-hoje">hoje: <b>${n(todayWords)}</b></span>`;
  }

  // Contagem, páginas e sumário: um pouco depois de ela parar de digitar.
  function refreshSoon() {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (!base) return;
      words = countWords(text.innerText);
      renderCounts();
      paginate();
      renderOutline();
      renderPageNumber();
    }, COUNT_DELAY);
  }

  // "← Capítulo anterior · Próximo capítulo →" depois da última página.
  function renderNeighbors() {
    const list = db.getChapters(storyId);
    const i = list.findIndex((c) => c.id === chapterId);
    const nav = $(".ed-vizinhos");
    nav.replaceChildren();
    const link = (c, label, cls) => {
      if (!c) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.dataset.capitulo = c.id;
      b.innerHTML = `<small>${label}</small><span></span>`;
      b.querySelector("span").textContent = c.title || "Sem título";
      nav.appendChild(b);
    };
    if (i < 0) return;
    link(list[i - 1], "← Anterior", "ant");
    link(list[i + 1], "Próximo →", "prox");
  }

  // ---------- Páginas ----------
  // Mede onde cada bloco cairia e empurra para a próxima página o que
  // atravessaria o pé da página (com padding-top, por regras CSS: nada é
  // escrito dentro do texto dela, então o desfazer e o salvar não mudam).
  function paginate() {
    breaks.textContent = "";
    if (!root.classList.contains("paginas") || root.hidden) {
      sheet.style.minHeight = "";
      pages = 0;
      return;
    }
    const top = text.offsetTop; // posição do texto dentro da folha
    const rules = [];
    let extra = 0;
    const blocks = text.children;
    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i];
      const y = top + el.offsetTop + extra;
      const h = el.offsetHeight;
      const pageTop = Math.floor(y / PAGE_STEP) * PAGE_STEP;
      let push = 0;
      if (pageTop > 0 && y < pageTop + MARGIN) push = pageTop + MARGIN - y;         // caiu na margem de cima
      else if (y + h > pageTop + PAGE_H - MARGIN && h <= CONTENT_H) push = pageTop + PAGE_STEP + MARGIN - y; // não cabe: próxima página
      if (push > 0) {
        rules.push(`.ed-texto > :nth-child(${i + 1}) { padding-top: ${Math.ceil(push)}px !important; }`);
        extra += push;
      }
    }
    breaks.textContent = rules.join("\n");
    const end = top + text.offsetHeight; // já com os empurrões
    pages = Math.max(1, Math.floor(end / PAGE_STEP) + 1);
    sheet.style.minHeight = `${pages * PAGE_STEP - PAGE_GAP}px`;
  }

  // "Página 2 de 5", pela posição do cursor (ou do meio da tela).
  function renderPageNumber() {
    const el = $(".ed-pagina");
    if (!pages) {
      el.textContent = "";
      return;
    }
    const sel = getSelection();
    let y = innerHeight / 2;
    if (sel.rangeCount && text.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0).getClientRects()[0] || sel.anchorNode.parentElement?.getBoundingClientRect();
      if (r) y = r.top;
    }
    const page = Math.min(pages, Math.max(1, Math.floor((y - sheet.getBoundingClientRect().top) / PAGE_STEP) + 1));
    el.textContent = `Página ${page} de ${pages}`;
  }

  // ---------- Sumário (títulos de cena) ----------

  const scenes = () => [...text.querySelectorAll(":scope > h3")];

  function renderOutline() {
    const list = $(".ed-sumario ol");
    const items = scenes().map((h, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.cena = i;
      b.textContent = h.textContent.trim() || "Cena sem título";
      li.appendChild(b);
      return li;
    });
    list.replaceChildren(...items);
    $(".ed-sumario-vazio").hidden = items.length > 0;
    markCurrentScene();
  }

  // A cena que está na tela fica marcada no sumário.
  function markCurrentScene() {
    const all = scenes();
    let current = -1;
    all.forEach((h, i) => {
      if (h.getBoundingClientRect().top < 200) current = i;
    });
    root.querySelectorAll("[data-cena]").forEach((b) => {
      if (Number(b.dataset.cena) === current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  }

  let scrollFrame = 0;
  window.addEventListener("scroll", () => {
    if (root.hidden || !base || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      markCurrentScene();
      renderPageNumber();
    });
  }, { passive: true });

  function goToScene(i) {
    const h = scenes()[i];
    if (!h) return;
    h.scrollIntoView({ block: "start" }); // pula direto (suave demora em textos longos)
    const range = document.createRange();
    range.selectNodeContents(h);
    range.collapse(true);
    text.focus({ preventScroll: true });
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  // ---------- Abrir ----------

  function fill(chapter, html) {
    base = chapter;
    text.innerHTML = sanitizeHtml(html) || EMPTY;
    markEmpty();
    titleInput.value = chapter.title;
    words = countWords(text.innerText);
    $(".ed-historia").textContent = db.getStory(storyId)?.title || "";
    applyLayout();
    renderCounts();
    renderNeighbors();
    renderOutline();
    paginate();
    renderPageNumber();
    // As fontes chegam depois: mede as páginas de novo quando chegarem.
    document.fonts?.ready.then(() => base && paginate());
  }

  // Abre um capítulo. `atEnd`: cursor no fim do texto ("Continuar escrevendo").
  async function open(sId, cId, { atEnd = false } = {}) {
    if (cId === chapterId && base) return;
    await close();
    const token = ++openToken;
    storyId = sId;
    chapterId = cId;
    base = null;
    dirty = false;
    text.contentEditable = "false";
    text.innerHTML = "";
    titleInput.value = "";
    breaks.textContent = "";
    $(".ed-contagem").textContent = "";
    $(".ed-pagina").textContent = "";
    $(".ed-vizinhos").replaceChildren();
    $(".ed-sumario ol").replaceChildren();
    $(".ed-historia").textContent = db.getStory(sId)?.title || "";
    setStatus("Abrindo o capítulo…");

    let chapter;
    try {
      // A lista (para "anterior/próximo") e o texto vêm juntos.
      [chapter] = await Promise.all([db.getChapter(cId), db.loadChapters(sId)]);
    } catch (err) {
      if (token !== openToken) return;
      setStatus("Não consegui abrir. Confira a internet.", "erro");
      toast(err.message);
      return;
    }
    if (token !== openToken) return;
    if (!chapter) {
      toast("Esse capítulo não existe mais.");
      onBack();
      return;
    }

    let html = chapter.html;
    let title = chapter.title;
    let recovered = false;
    const draft = db.getChapterDraft(cId);
    if (draft && draft.html !== chapter.html) {
      // Texto guardado neste aparelho que a nuvem não tem.
      const cloudChanged = draft.baseUpdatedAt !== chapter.updatedAt;
      let useDraft = !cloudChanged; // a nuvem não mudou: o rascunho é só a continuação
      if (cloudChanged) {
        const answer = await chooseDialog({
          title: "Achei um texto não enviado",
          message: `Este aparelho guardou uma versão de ${day(draft.savedAt)} às ${time(draft.savedAt)} que não chegou à nuvem, mas o capítulo também foi salvo em outro lugar (${day(chapter.updatedAt)} às ${time(chapter.updatedAt)}). Qual você quer abrir?`,
          options: [
            { text: "A deste aparelho", value: "local" },
            { text: "A da nuvem", value: "nuvem" },
          ],
        });
        if (token !== openToken) return;
        useDraft = answer === "local";
        if (!useDraft) {
          const discard = await confirmDialog({
            title: "Descartar o texto deste aparelho?",
            message: "A versão guardada neste aparelho será apagada e a da nuvem fica. Isso não pode ser desfeito.",
            confirmText: "Sim, descartar",
            cancelText: "Abrir a deste aparelho",
            danger: true,
          });
          if (token !== openToken) return;
          useDraft = !discard;
        }
      }
      if (useDraft) {
        html = draft.html;
        title = draft.title || chapter.title;
        recovered = true;
        if (!cloudChanged) toast("Recuperei o texto que ainda não tinha sido enviado ✨");
      } else {
        db.discardChapterDraft(cId);
      }
    } else if (draft) {
      db.discardChapterDraft(cId); // igual à nuvem: não precisa mais
    }

    // `base` é sempre a versão da nuvem; o texto recuperado é enviado por cima.
    fill(chapter, html);
    text.contentEditable = "true";
    if (recovered) {
      titleInput.value = title;
      dirty = true;
      setStatus("Enviando o texto recuperado…");
      save();
    } else {
      setStatus(chapter.updatedAt ? `Salvo em ${day(chapter.updatedAt)} às ${time(chapter.updatedAt)}` : "");
    }
    if (atEnd) placeCaretAtEnd();
  }

  function placeCaretAtEnd() {
    text.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(text);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    text.lastElementChild?.scrollIntoView({ block: "center" });
  }

  // ---------- Salvar ----------

  function currentDraft() {
    const html = sanitizeElement(text);
    return { storyId, html, title: titleInput.value.trim() || base.title, words: countWords(text.innerText) };
  }

  // Guarda neste aparelho (síncrono: funciona até com a página fechando).
  function keepLocal(draft) {
    try {
      db.saveChapterDraft(chapterId, { ...draft, savedAt: new Date().toISOString(), baseUpdatedAt: base.updatedAt });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
    if (!dirty || !base) return;
    if (saving) {
      saveAgain = true;
      return saving;
    }
    const id = chapterId;
    const sId = storyId;
    const draft = currentDraft();
    keepLocal(draft);
    dirty = false;
    setStatus("Salvando…");
    saving = (async () => {
      try {
        const saved = await db.saveChapter(sId, { id, html: draft.html, title: draft.title, words: draft.words });
        const here = id === chapterId;
        // A nuvem tem tudo o que estava no rascunho (e nada novo foi digitado).
        if (!here || !dirty) db.discardChapterDraft(id);
        if (!here) return; // já trocou de capítulo
        base = saved;
        if (!dirty) setStatus(`Salvo às ${time(saved.updatedAt)}`, "ok");
        renderCounts();
      } catch (err) {
        if (err.conflict) return handleConflict(sId, id, draft);
        console.error(err);
        if (id === chapterId) {
          dirty = true;
          setStatus(navigator.onLine === false
            ? "Sem internet — guardado neste aparelho"
            : "Não consegui salvar na nuvem — guardado neste aparelho. Tentando de novo…", "erro");
          retryTimer = setTimeout(save, RETRY_DELAY);
        }
      }
    })();
    try {
      await saving;
    } finally {
      saving = null;
      if (saveAgain) {
        saveAgain = false;
        if (dirty) save();
      }
    }
  }

  // Outro aparelho salvou este capítulo enquanto ela escrevia aqui.
  async function handleConflict(sId, id, draft) {
    try {
      const { cloud, copy } = await db.keepBothVersions(sId, { id, ...draft });
      db.discardChapterDraft(id); // a versão daqui agora é o capítulo "cópia"
      if (id !== chapterId) return;
      dirty = false;
      if (cloud) fill(cloud, cloud.html);
      setStatus(`Salvo às ${time(new Date().toISOString())}`, "ok");
      await alertDialog({
        title: "Este capítulo mudou em outro aparelho",
        message: `Para não perder nada, o que você escreveu aqui virou um capítulo novo, logo abaixo no Manuscrito: "${copy.title}". Esta página agora mostra a versão do outro aparelho. Depois é só apagar a que não quiser.`,
      });
      if (!cloud) onOpenChapter(sId, copy.id, { replace: true });
    } catch (err) {
      console.error(err);
      dirty = true;
      setStatus("Não consegui salvar — guardado neste aparelho. Tentando de novo…", "erro");
      retryTimer = setTimeout(save, RETRY_DELAY);
    }
  }

  // Sair do capítulo: salva o que faltar (o rascunho local já protege).
  async function close() {
    clearTimeout(countTimer);
    setFocusMode(false);
    if (dirty && base) {
      keepLocal(currentDraft());
      await save();
    } else if (saving) {
      await saving;
    }
    clearTimeout(retryTimer);
    text.contentEditable = "false";
    chapterId = null;
    base = null;
    lastRange = null;
  }

  // ---------- Escrever ----------

  text.addEventListener("input", () => {
    if (!base) return;
    if (!text.firstElementChild) text.innerHTML = EMPTY; // nunca fica sem parágrafo
    markEmpty();
    dirty = true;
    setStatus("Editando…");
    refreshSoon();
    scheduleSave();
  });

  // Colar: só o que interessa (formatação de trecho, parágrafos, cenas, listas).
  text.addEventListener("paste", (event) => {
    event.preventDefault();
    const data = event.clipboardData;
    const html = data.getData("text/html");
    let clean = html ? sanitizeHtml(html) : textToHtml(data.getData("text/plain"));
    if (!clean) return;
    // Um parágrafo só: entra no meio da linha, sem quebrar o parágrafo.
    const single = clean.match(/^<p>(.*)<\/p>$/s);
    if (single && !single[1].includes("<p>")) clean = single[1];
    document.execCommand("insertHTML", false, clean);
  });

  // Arquivos e imagens soltos no texto não entram.
  text.addEventListener("drop", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });

  // Clicar na parte vazia da página leva o cursor para o fim do texto.
  sheet.addEventListener("pointerdown", (event) => {
    if (event.target !== sheet || text.contentEditable !== "true") return;
    event.preventDefault();
    placeCaretAtEnd();
  });

  titleInput.addEventListener("input", () => {
    if (!base) return;
    dirty = true;
    setStatus("Editando…");
    scheduleSave();
  });
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      text.focus();
    }
  });

  // ---------- Barra de formatação ----------

  // Bloco (parágrafo, cena ou lista) onde está o cursor.
  function currentBlock() {
    let node = getSelection().anchorNode;
    while (node && node.parentNode !== text) node = node.parentNode;
    return node?.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  // Devolve o cursor ao texto (os menus da barra tiram o foco dele).
  function backToText() {
    if (text.contains(getSelection().anchorNode)) return;
    text.focus({ preventScroll: true });
    if (lastRange && text.contains(lastRange.startContainer)) {
      getSelection().removeAllRanges();
      getSelection().addRange(lastRange);
    }
  }

  function runCommand(cmd, value) {
    if (text.contentEditable !== "true") return;
    backToText();
    if (cmd === "separador") document.execCommand("insertHTML", false, "<hr><p><br></p>");
    else if (cmd === "formatBlock") document.execCommand("formatBlock", false, value);
    else document.execCommand(cmd);
    updateToolbar();
  }

  const PRESSED = ["bold", "italic", "underline", "strikeThrough", "justifyLeft", "justifyCenter",
    "justifyRight", "justifyFull", "insertUnorderedList", "insertOrderedList"];

  // Botões acesos conforme o texto onde está o cursor.
  function updateToolbar() {
    const sel = getSelection();
    if (!sel.rangeCount || !text.contains(sel.anchorNode)) return;
    lastRange = sel.getRangeAt(0).cloneRange();
    for (const cmd of PRESSED) {
      root.querySelector(`[data-cmd="${cmd}"]`).setAttribute("aria-pressed", String(document.queryCommandState(cmd)));
    }
    $('[data-ctl="estilo"]').value = currentBlock()?.tagName === "H3" ? "h3" : "p";
  }
  document.addEventListener("selectionchange", () => {
    if (root.hidden || !base) return;
    updateToolbar();
    renderPageNumber();
  });

  // Apertar um botão não tira o cursor do texto.
  root.querySelector(".ed-ferramentas").addEventListener("pointerdown", (e) => e.target.closest("button") && e.preventDefault());

  root.querySelector(".ed-ferramentas").addEventListener("change", (event) => {
    const ctl = event.target.dataset.ctl;
    if (ctl === "estilo") runCommand("formatBlock", event.target.value);
    else if (ctl === "fonte") setLayout({ font: event.target.value });
    else if (ctl === "tamanho") setLayout({ size: Number(event.target.value) });
    else if (ctl === "espaco") setLayout({ spacing: Number(event.target.value) });
    else if (ctl === "paragrafos") setLayout({ paragraphs: event.target.value });
    if (ctl !== "estilo") backToText();
  });

  function stepSize(dir) {
    const current = layout().size;
    const next = dir > 0 ? SIZES.find((s) => s > current) : [...SIZES].reverse().find((s) => s < current);
    if (next) setLayout({ size: next });
  }

  // ---------- Sumário e modo foco ----------

  function setOutline(on) {
    root.classList.toggle("sem-sumario", !on);
    const b = $(".ed-bt-sumario");
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Esconder o sumário" : "Mostrar o sumário");
  }

  function setFocusMode(on) {
    root.classList.toggle("foco", on);
    document.body.classList.toggle("escrevendo-foco", on);
    if (on) text.focus({ preventScroll: true });
  }

  root.addEventListener("click", (event) => {
    const el = event.target.closest("[data-acao], [data-cmd], [data-capitulo], [data-tam], [data-cena]");
    if (!el) return;
    if (el.dataset.cmd) runCommand(el.dataset.cmd);
    else if (el.dataset.tam) stepSize(Number(el.dataset.tam));
    else if (el.dataset.cena) goToScene(Number(el.dataset.cena));
    else if (el.dataset.capitulo) onOpenChapter(storyId, el.dataset.capitulo, { replace: true });
    else if (el.dataset.acao === "voltar") onBack();
    else if (el.dataset.acao === "sumario") setOutline(root.classList.contains("sem-sumario"));
    else if (el.dataset.acao === "foco") setFocusMode(!root.classList.contains("foco"));
  });

  root.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault(); // ⌘S salva na hora (em vez de "salvar página")
      save();
    } else if (event.key === "Escape" && root.classList.contains("foco")) {
      setFocusMode(false);
    }
  });

  // Páginas só em telas largas; ao mudar o tamanho da janela, mede de novo.
  const setPaged = () => {
    root.classList.toggle("paginas", pagedQuery.matches);
    if (base) refreshSoon();
  };
  pagedQuery.addEventListener("change", setPaged);
  setPaged();
  window.addEventListener("resize", () => !root.hidden && base && refreshSoon());

  // Página fechando ou indo para segundo plano: guarda aqui e tenta enviar.
  const flush = () => {
    if (!dirty || !base) return;
    keepLocal(currentDraft());
    save();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("online", () => dirty && base && save());

  // A história mudou (ex.: total de palavras, visual): acompanha.
  db.subscribeStories(() => {
    if (root.hidden || !base) return;
    renderCounts();
    renderNeighbors();
    applyLayout();
  });

  return {
    open,
    close,
    get chapterId() { return chapterId; },
    sheet: () => sheet,
    // A tela do editor acabou de aparecer: mede as páginas.
    shown: () => base && refreshSoon(),
  };
}
