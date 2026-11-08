// Editor de escrita: uma folha de papel para escrever um capítulo.
//
// - Texto com `contenteditable` (sem bibliotecas). Formatação: negrito,
//   itálico, título de cena (<h3>), separador de cena (<hr> = ✦ ✦ ✦).
// - Colar: tudo passa por sanitize.js (fica só itálico, negrito, parágrafos).
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
const COUNT_DELAY = 250;   // ms para atualizar a contagem de palavras

const EMPTY = "<p><br></p>";
const time = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const day = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const n = (x) => x.toLocaleString("pt-BR");

export function createEditor(root, { onBack, onOpenChapter }) {
  root.innerHTML = `
    <header class="ed-barra">
      <button class="etiqueta-papel" type="button" data-acao="voltar">← Manuscrito</button>
      <div class="ed-ferramentas" role="toolbar" aria-label="Formatação">
        <button type="button" data-cmd="bold" aria-label="Negrito" title="Negrito (⌘B)"><b>N</b></button>
        <button type="button" data-cmd="italic" aria-label="Itálico" title="Itálico (⌘I)"><i>I</i></button>
        <button type="button" data-cmd="cena" aria-label="Título de cena" title="Título de cena">Cena</button>
        <button type="button" data-cmd="separador" aria-label="Separador de cena" title="Separador de cena">✦</button>
        <span class="ed-div" aria-hidden="true"></span>
        <button type="button" data-cmd="undo" aria-label="Desfazer" title="Desfazer (⌘Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>
        <button type="button" data-cmd="redo" aria-label="Refazer" title="Refazer (⇧⌘Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
      </div>
      <button class="etiqueta-papel dir" type="button" data-acao="foco">Modo foco</button>
    </header>
    <article class="ed-folha">
      <p class="ed-historia"></p>
      <input class="ed-titulo" maxlength="80" aria-label="Título do capítulo" placeholder="Título do capítulo">
      <div class="ed-texto" contenteditable="false" role="textbox" aria-multiline="true"
        aria-label="Texto do capítulo" spellcheck="true" lang="pt-BR" data-placeholder="Era uma vez…"></div>
      <nav class="ed-vizinhos" aria-label="Outros capítulos"></nav>
    </article>
    <footer class="ed-rodape">
      <span class="ed-status" aria-live="polite"></span>
      <span class="ed-contagem"></span>
    </footer>
    <button class="ed-sair-foco" type="button" data-acao="foco">Sair do foco</button>`;

  const $ = (sel) => root.querySelector(sel);
  const text = $(".ed-texto");
  const titleInput = $(".ed-titulo");
  const statusEl = $(".ed-status");

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
  let openToken = 0;      // abrir outro capítulo cancela uma abertura antiga

  // Parágrafos novos viram <p> (e não <div>).
  document.execCommand("defaultParagraphSeparator", false, "p");

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
      <span><b>${n(storyWords)}</b> na história</span>
      <span class="ed-hoje">hoje: <b>${n(todayWords)}</b></span>`;
  }

  function countSoon() {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      words = countWords(text.innerText);
      renderCounts();
    }, COUNT_DELAY);
  }

  // "← Capítulo anterior · Próximo capítulo →" no fim da folha.
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

  function fill(chapter, html) {
    base = chapter;
    text.innerHTML = sanitizeHtml(html) || EMPTY;
    markEmpty();
    titleInput.value = chapter.title;
    words = countWords(text.innerText);
    $(".ed-historia").textContent = db.getStory(storyId)?.title || "";
    renderCounts();
    renderNeighbors();
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
    $(".ed-contagem").textContent = "";
    $(".ed-vizinhos").replaceChildren();
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
  }

  // ---------- Escrever ----------

  text.addEventListener("input", () => {
    if (!base) return;
    if (!text.firstElementChild) text.innerHTML = EMPTY; // nunca fica sem parágrafo
    markEmpty();
    dirty = true;
    setStatus("Editando…");
    countSoon();
    scheduleSave();
  });

  // Colar: só o que interessa (itálico, negrito, parágrafos, cenas).
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

  // Bloco (parágrafo ou cena) onde está o cursor.
  function currentBlock() {
    let node = getSelection().anchorNode;
    while (node && node.parentNode !== text) node = node.parentNode;
    return node?.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  function runCommand(cmd) {
    if (text.contentEditable !== "true") return;
    if (!text.contains(getSelection().anchorNode)) text.focus();
    if (cmd === "cena") {
      const isScene = currentBlock()?.tagName === "H3";
      document.execCommand("formatBlock", false, isScene ? "p" : "h3");
    } else if (cmd === "separador") {
      document.execCommand("insertHTML", false, "<hr><p><br></p>");
    } else {
      document.execCommand(cmd);
    }
    updateToolbar();
  }

  // Botões acesos conforme o texto onde está o cursor.
  function updateToolbar() {
    if (!text.contains(getSelection().anchorNode)) return;
    const state = {
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      cena: currentBlock()?.tagName === "H3",
    };
    root.querySelectorAll("[data-cmd]").forEach((b) => {
      if (b.dataset.cmd in state) b.setAttribute("aria-pressed", String(state[b.dataset.cmd]));
    });
  }
  document.addEventListener("selectionchange", () => !root.hidden && updateToolbar());

  // Apertar um botão não tira o cursor do texto.
  root.querySelector(".ed-ferramentas").addEventListener("pointerdown", (e) => e.target.closest("button") && e.preventDefault());

  // ---------- Modo foco: só a folha ----------

  function setFocusMode(on) {
    root.classList.toggle("foco", on);
    document.body.classList.toggle("escrevendo-foco", on);
    if (on) text.focus({ preventScroll: true });
  }

  root.addEventListener("click", (event) => {
    const el = event.target.closest("[data-acao], [data-cmd], [data-capitulo]");
    if (!el) return;
    if (el.dataset.cmd) runCommand(el.dataset.cmd);
    else if (el.dataset.capitulo) onOpenChapter(storyId, el.dataset.capitulo, { replace: true });
    else if (el.dataset.acao === "voltar") onBack();
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

  // Página fechando ou indo para segundo plano: guarda aqui e tenta enviar.
  const flush = () => {
    if (!dirty || !base) return;
    keepLocal(currentDraft());
    save();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("online", () => dirty && base && save());

  // A história mudou (ex.: total de palavras): atualiza o rodapé.
  db.subscribeStories(() => {
    if (root.hidden || !base) return;
    renderCounts();
    renderNeighbors();
  });

  return {
    open,
    close,
    get chapterId() { return chapterId; },
    sheet: () => $(".ed-folha"),
  };
}
