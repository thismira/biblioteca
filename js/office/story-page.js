// Página de uma história: um caderno aberto sobre a mesa.
// Esquerda: título, sinopse, gêneros, status, cor da capa e números.
// Direita: o conteúdo da aba escolhida nas divisórias da lateral.
// Tudo salva na hora (db.updateStory).

import * as db from "../data/db.js";
import { createCategoryPicker } from "../ui/category-picker.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { COVERS, paintNotebook } from "./notebook.js";
import { createChapterList } from "./chapters.js";
import { createCharacterBoard } from "./characters.js";
import { createWorld } from "./world.js";
import { createQuotes } from "../ui/quotes.js";
import { createPlaylist } from "../ui/playlist.js";

export const TABS = [
  ["manuscrito", "Manuscrito", "#FCF7EF"],
  ["personagens", "Personagens", "#F3CCD6"],
  ["mundo", "Mundo", "#D9E4D1"],
  ["playlist", "Playlist", "#DCD3EC"],
  ["quotes", "Best quotes", "#F4E3B7"],
];
// Gêneros sempre oferecidos (somados aos que ela já criou).
const STARTER_GENRES = ["Romance", "Fantasia", "Drama", "Mistério", "Época", "Ficção científica", "Conto", "Poesia"];
const SYNOPSIS_DELAY = 800; // ms sem digitar para salvar a sinopse

const plural = (n, one, many) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

export function createStoryPage(root, { onBack, onDeleted, onOpenChapter, onOpenCharacter }) {
  root.innerHTML = `
    <header class="esc-barra">
      <button class="etiqueta-papel" type="button" data-acao="mesa">← Mesa</button>
    </header>
    <div class="esc-aberto">
      <section class="esc-pag esq" aria-label="Sobre a história">
        <div class="h-capa"><span class="caderno"></span></div>
        <textarea class="h-titulo" rows="1" maxlength="80" aria-label="Título da história" placeholder="Título da história"></textarea>
        <textarea class="h-sinopse" rows="2" aria-label="Sinopse" placeholder="Sobre o que é essa história? Uma ou duas frases…"></textarea>
        <div class="linha-rot">Gêneros</div>
        <div class="h-generos"></div>
        <div class="linha-rot" id="h-status-rot">Status</div>
        <div class="selos" role="radiogroup" aria-labelledby="h-status-rot">
          ${db.STORY_STATUSES.map(([v, t]) => `<button type="button" role="radio" data-status="${v}">${t}</button>`).join("")}
        </div>
        <div class="linha-rot" id="h-cor-rot">Cor da capa</div>
        <div class="h-cores" role="radiogroup" aria-labelledby="h-cor-rot">
          ${COVERS.map(([c]) => `<button type="button" role="radio" data-cor="${c}" style="--c:${c}" aria-label="Cor ${c}"></button>`).join("")}
        </div>
        <div class="numeros"></div>
        <button class="link h-baixar" type="button" data-acao="baixar">⬇ Baixar história (Word)</button>
        <button class="link perigo h-apagar" type="button" data-acao="apagar-historia">Apagar história</button>
      </section>
      <section class="esc-pag dir" aria-live="polite"><div class="aba-conteudo"></div></section>
      <nav class="divisorias" role="tablist" aria-label="Partes da história">
        ${TABS.map(([v, t, c]) => `<button type="button" role="tab" data-aba="${v}" style="--t:${c}">${t}</button>`).join("")}
      </nav>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const titleInput = $(".h-titulo");
  const synopsis = $(".h-sinopse");
  let storyId = null;
  let tab = "manuscrito";
  let synopsisTimer = null;

  const chapterList = createChapterList({ onOpen: (id, chapterId) => onOpenChapter(id, chapterId) });
  const characterBoard = createCharacterBoard({ onOpen: (id, characterId) => onOpenCharacter(id, characterId) });
  const worldTab = createWorld();

  // Playlist e Best quotes da história (as mesmas peças dos livros).
  const saveQuietly = (changes) => save(changes);
  const playlistEl = document.createElement("div");
  playlistEl.className = "aba-playlist";
  playlistEl.innerHTML = `<h2 class="aba-titulo">Playlist</h2><p class="aba-dica">A trilha sonora da história. Dê play e abra um capítulo: a música continua enquanto ela escreve. 🎧</p><div></div>`;
  const playlist = createPlaylist(playlistEl.lastElementChild, {
    getBook: () => story(),
    save: saveQuietly,
    frameTitle: "Playlist da história no Spotify",
    removeMessage: "O link do Spotify desta história será apagado (a playlist continua existindo no Spotify).",
  });
  const quotesEl = document.createElement("div");
  quotesEl.className = "aba-quotes";
  quotesEl.innerHTML = `<h2 class="aba-titulo">Best quotes</h2><div></div>`;
  const quotes = createQuotes(quotesEl.lastElementChild, {
    getBook: () => story(),
    save: saveQuietly,
    chapters: () => db.getChapters(storyId),
    photo: false,
    emptyText: "Nenhuma best quote ainda. No editor, selecione um trecho e toque em ⭐ Best quote — ou escreva aqui. ✨",
    placeholder: "Aquele trecho da história que você mais ama…",
  });
  let freshTab = true; // a aba precisa ser redesenhada (abriu agora ou mudou de fora)

  const story = () => db.getStory(storyId);
  const save = (changes) =>
    db.updateStory(storyId, changes).catch((err) => toast(err.message));

  // Os campos de texto crescem com o conteúdo (o título quebra linha).
  function fit(field) {
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  }

  // Preenche a página (sem mexer no campo que ela estiver digitando).
  function render() {
    const s = story();
    if (!s) return;
    paintNotebook($(".h-capa .caderno"), s);
    $(".h-capa .caderno").tabIndex = -1;
    if (document.activeElement !== titleInput) {
      titleInput.value = s.title;
      fit(titleInput);
    }
    // (nunca por cima de uma sinopse que ainda vai ser salva)
    if (document.activeElement !== synopsis && !synopsisTimer) {
      synopsis.value = s.synopsis;
      fit(synopsis);
    }
    root.querySelectorAll("[data-status]").forEach((b) => {
      if (b.closest(".selos")) b.setAttribute("aria-checked", String(b.dataset.status === s.status));
    });
    root.querySelectorAll("[data-cor]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cor === s.color)));
    $(".numeros").innerHTML = `
      <div><b>${s.words.toLocaleString("pt-BR")}</b><small>palavras</small></div>
      <div><b>${s.chapterOrder.length}</b><small>${s.chapterOrder.length === 1 ? "capítulo" : "capítulos"}</small></div>
      <div><b>${s.characters.length}</b><small>${s.characters.length === 1 ? "personagem" : "personagens"}</small></div>`;
    renderTab();
  }

  function renderTabs() {
    root.querySelectorAll("[data-aba]").forEach((b) => {
      const on = b.dataset.aba === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  // O conteúdo da aba escolhida nas divisórias.
  function renderTab() {
    renderTabs();
    const box = $(".aba-conteudo");
    if (tab === "manuscrito") {
      if (box.firstElementChild !== chapterList.el) box.replaceChildren(chapterList.el);
      chapterList.show(storyId);
      return;
    }
    if (tab === "personagens") {
      if (box.firstElementChild !== characterBoard.el) box.replaceChildren(characterBoard.el);
      characterBoard.show(storyId);
      return;
    }
    if (tab === "mundo") {
      if (box.firstElementChild !== worldTab.el) box.replaceChildren(worldTab.el);
      worldTab.show(storyId);
      return;
    }
    if (tab === "playlist") {
      if (box.firstElementChild !== playlistEl) box.replaceChildren(playlistEl);
      playlist.render(); // (não recria o player se o link é o mesmo)
      return;
    }
    if (tab === "quotes") {
      // Só redesenha ao abrir a aba (redesenhar a cada gravação fecharia a edição).
      if (box.firstElementChild !== quotesEl || freshTab) {
        box.replaceChildren(quotesEl);
        quotes.render();
        freshTab = false;
        db.loadChapters(storyId).then(() => tab === "quotes" && quotes.render()).catch(() => {});
      }
    }
  }

  function show(id, tabName = "manuscrito") {
    const changed = id !== storyId;
    freshTab = true;
    storyId = id;
    tab = TABS.some(([v]) => v === tabName) ? tabName : "manuscrito";
    if (changed) {
      clearTimeout(synopsisTimer);
      synopsisTimer = null;
      const s = story();
      createCategoryPicker($(".h-generos"), {
        selected: s.genres,
        known: db.getAllGenres(),
        suggestions: STARTER_GENRES,
        placeholder: "Outro gênero e Enter",
        emptyText: "Nenhum gênero ainda",
        onChange: (genres) => save({ genres }),
      });
    }
    render();
  }

  // ---------- Edição ----------

  titleInput.addEventListener("input", () => fit(titleInput));
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // título numa linha só (quebra só visual)
      titleInput.blur();
    }
    if (e.key === "Escape") {
      titleInput.value = story().title;
      titleInput.blur();
    }
  });
  titleInput.addEventListener("change", () => {
    const title = titleInput.value.trim().replace(/\s+/g, " ");
    if (!title) titleInput.value = story().title; // título vazio não vale
    else if (title !== story().title) save({ title });
  });

  synopsis.addEventListener("input", () => {
    fit(synopsis);
    clearTimeout(synopsisTimer);
    const id = storyId;
    synopsisTimer = setTimeout(() => {
      synopsisTimer = null;
      if (id === storyId) save({ synopsis: synopsis.value.trim() });
    }, SYNOPSIS_DELAY);
  });
  synopsis.addEventListener("blur", () => {
    clearTimeout(synopsisTimer);
    synopsisTimer = null;
    if (synopsis.value.trim() !== story()?.synopsis) save({ synopsis: synopsis.value.trim() });
  });

  root.addEventListener("click", async (event) => {
    // Cliques dentro da aba aberta são da própria aba (ex.: apagar um
    // capítulo nunca pode chegar aqui e virar "apagar a história").
    if (event.target.closest(".aba-conteudo")) return;
    const el = event.target.closest("[data-acao], [data-status], [data-cor], [data-aba]");
    if (!el || !storyId) return;
    if (el.dataset.acao === "mesa") onBack();
    else if (el.dataset.acao === "apagar-historia") removeStory();
    else if (el.dataset.acao === "baixar") downloadStory(el);
    else if (el.dataset.status && el.closest(".selos")) save({ status: el.dataset.status });
    else if (el.dataset.cor) save({ color: el.dataset.cor });
    else if (el.dataset.aba) {
      tab = el.dataset.aba;
      freshTab = true;
      // Troca de aba não enche o "voltar" do navegador.
      history.replaceState(null, "", `#/historia/${storyId}${tab === "manuscrito" ? "" : "/" + tab}`);
      renderTab();
    }
  });

  // Setas do teclado entre as abas (padrão de abas acessíveis).
  $(".divisorias").addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(([v]) => v === tab);
    const next = TABS[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    root.querySelector(`[data-aba="${next}"]`).click();
    root.querySelector(`[data-aba="${next}"]`).focus();
  });

  // "Baixar história": um arquivo Word com todos os capítulos.
  async function downloadStory(button) {
    const s = story();
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Preparando o arquivo…";
    try {
      const { buildStoryDocx } = await import("../services/docx-write.js");
      const chapters = await db.getFullChapters(s.id);
      const blob = await buildStoryDocx({ ...s, layout: db.storyLayout(s) }, chapters);
      const name = (s.title || "historia").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "historia";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      toast("Não consegui preparar o arquivo. Confira a internet e tente de novo.");
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function removeStory() {
    const s = story();
    const ok = await confirmDialog({
      title: "Apagar esta história?",
      message: `"${s.title || "Sem título"}" e tudo o que está dentro dela (capítulos, personagens, mundo, playlist e quotes) serão apagados. Isso não pode ser desfeito.`,
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteStory(s.id);
      onDeleted();
    } catch (err) {
      toast(err.message);
    }
  }

  db.subscribeStories(() => storyId && !root.hidden && story() && render());

  return {
    show,
    // Desliga a música da história (ao voltar para a mesa ou sair do escritório).
    stopMusic() {
      playlist.stop();
      if ($(".aba-conteudo").firstElementChild === playlistEl) $(".aba-conteudo").replaceChildren();
    },
    get storyId() { return storyId; },
    book: () => $(".esc-aberto"),
  };
}
