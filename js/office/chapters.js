// Aba "Manuscrito": o sumário dos capítulos de uma história, escrito nas
// linhas da página. Criar, renomear, apagar (com confirmação) e reordenar
// arrastando (mesmo arrastar das estantes, em lista vertical).
// Clicar num capítulo abre o editor (`onOpen`).

import * as db from "../data/db.js";
import { enableDragAndDrop } from "../ui/drag.js";
import { confirmDialog, promptDialog, toast } from "../ui/dialogs.js";

const words = (n) => `${n.toLocaleString("pt-BR")} palavra${n === 1 ? "" : "s"}`;

export function createChapterList({ onOpen }) {
  const el = document.createElement("div");
  el.className = "manuscrito";
  el.innerHTML = `
    <h2 class="aba-titulo">Manuscrito</h2>
    <p class="cap-aviso" aria-live="polite"></p>
    <ol class="capitulos" aria-label="Capítulos"></ol>
    <button class="cap-novo" type="button" data-acao="novo">+ Novo capítulo</button>`;
  const list = el.querySelector(".capitulos");
  const notice = el.querySelector(".cap-aviso");
  const rows = new Map(); // id → <li>, reaproveitados (o arraste não perde o item)
  let storyId = null;

  const showError = (err) => toast(err.message);

  function makeRow(id) {
    const li = document.createElement("li");
    li.className = "capitulo";
    li.dataset.id = id;
    li.innerHTML = `
      <span class="cap-alca" aria-hidden="true">⋮⋮</span>
      <button class="cap-abrir" type="button" data-acao="abrir">
        <span class="cap-num"></span><span class="cap-nome"></span><span class="cap-pontos"></span><span class="cap-palavras"></span>
      </button>
      <button class="cap-acao" type="button" data-acao="renomear" aria-label="Renomear capítulo" title="Renomear">✎</button>
      <button class="cap-acao" type="button" data-acao="apagar" aria-label="Apagar capítulo" title="Apagar">×</button>`;
    return li;
  }

  // Números seguem a posição na tela (mudam durante o arraste).
  function renumber() {
    [...list.children].forEach((li, i) => {
      li.querySelector(".cap-num").textContent = i + 1;
    });
  }

  function render() {
    if (!storyId || dragger.isDragging()) return;
    if (!db.chaptersLoaded(storyId)) {
      list.replaceChildren();
      notice.textContent = "Abrindo o manuscrito…";
      return;
    }
    const chapters = db.getChapters(storyId);
    notice.textContent = chapters.length ? "" : "Nenhum capítulo ainda. Que tal começar o primeiro?";
    const seen = new Set();
    const items = chapters.map((c) => {
      seen.add(c.id);
      if (!rows.has(c.id)) rows.set(c.id, makeRow(c.id));
      const li = rows.get(c.id);
      li.querySelector(".cap-nome").textContent = c.title || "Sem título";
      li.querySelector(".cap-palavras").textContent = words(c.words);
      li.querySelector(".cap-abrir").setAttribute("aria-label", `${c.title || "Sem título"}, ${words(c.words)}`);
      return li;
    });
    for (const id of rows.keys()) if (!seen.has(id)) rows.delete(id);
    keepFocus(() => list.replaceChildren(...items));
    renumber();
  }

  // Tirar e recolocar os itens perde o foco do teclado: devolve no fim.
  function keepFocus(change) {
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    change();
    if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  function show(id) {
    if (id !== storyId) {
      storyId = id;
      rows.clear();
      list.replaceChildren();
    }
    if (!db.chaptersLoaded(id)) {
      db.loadChapters(id).catch((err) => {
        if (storyId !== id) return;
        notice.textContent = "Não consegui abrir o manuscrito. Confira a internet e abra a história de novo.";
        showError(err);
      });
    }
    render();
  }

  const currentIds = () => [...list.children].map((li) => li.dataset.id);

  // ---------- Ações ----------

  async function createChapter() {
    const n = db.getChapters(storyId).length + 1;
    const title = await promptDialog({
      title: "Novo capítulo",
      label: "Título do capítulo",
      value: `Capítulo ${n}`,
      confirmText: "Criar",
      maxLength: 80,
    });
    if (!title) return;
    try {
      const chapter = await db.addChapter(storyId, title);
      rows.get(chapter.id)?.querySelector(".cap-abrir").focus();
    } catch (err) {
      showError(err);
    }
  }

  async function renameChapter(id) {
    const chapter = db.getChapters(storyId).find((c) => c.id === id);
    if (!chapter) return;
    const title = await promptDialog({
      title: "Renomear capítulo",
      label: "Título do capítulo",
      value: chapter.title,
      maxLength: 80,
    });
    if (!title || title === chapter.title) return;
    db.renameChapter(storyId, id, title).catch(showError);
  }

  async function removeChapter(id) {
    const chapter = db.getChapters(storyId).find((c) => c.id === id);
    if (!chapter) return;
    const ok = await confirmDialog({
      title: "Apagar este capítulo?",
      message: chapter.words
        ? `"${chapter.title || "Sem título"}" tem ${words(chapter.words)}. O texto será apagado e isso não pode ser desfeito.`
        : `"${chapter.title || "Sem título"}" será apagado.`,
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    db.deleteChapter(storyId, id).catch(showError);
  }

  // Muda a ordem (arrastando ou pelo teclado) e salva.
  function saveOrder(ids) {
    db.moveChapters(storyId, ids).catch((err) => {
      showError(err);
      render(); // volta para a ordem salva
    });
  }

  el.addEventListener("click", (event) => {
    const button = event.target.closest("[data-acao]");
    if (!button || !storyId) return;
    const id = button.closest(".capitulo")?.dataset.id;
    if (button.dataset.acao === "novo") createChapter();
    else if (button.dataset.acao === "abrir") onOpen(storyId, id);
    else if (button.dataset.acao === "renomear") renameChapter(id);
    else if (button.dataset.acao === "apagar") removeChapter(id);
  });

  // Alt + seta para cima/baixo move o capítulo (sem precisar arrastar).
  list.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const li = event.target.closest(".capitulo");
    if (!li) return;
    event.preventDefault();
    const ids = currentIds();
    const i = ids.indexOf(li.dataset.id);
    const j = i + (event.key === "ArrowUp" ? -1 : 1);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    renderOrder(ids);
    saveOrder(ids);
  });

  function renderOrder(ids) {
    keepFocus(() => list.replaceChildren(...ids.map((id) => rows.get(id)).filter(Boolean)));
    renumber();
  }

  const dragger = enableDragAndDrop({
    container: list,
    item: ".capitulo",
    row: null,
    axis: "y",
    ghostClass: "capitulo-fantasma",
    slotClass: "capitulo-vaga",
    canDrag: () => list.children.length > 1,
    renderOrder,
    onDrop: (id, prev, next, changed) => {
      if (changed) saveOrder(currentIds());
      else render();
    },
  });

  return { el, show, render };
}
