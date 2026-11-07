// Página de uma história: um caderno aberto sobre a mesa.
// Esquerda: título, sinopse, gêneros, status, cor da capa e números.
// Direita: o conteúdo da aba escolhida nas divisórias da lateral.
// Tudo salva na hora (db.updateStory).

import * as db from "../data/db.js";
import { createCategoryPicker } from "../ui/category-picker.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { COVERS, paintNotebook } from "./notebook.js";

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

export function createStoryPage(root, { onBack, onDeleted }) {
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
        <button class="link perigo h-apagar" type="button" data-acao="apagar">Apagar história</button>
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

  // O conteúdo de cada aba chega nas próximas etapas.
  function renderTab() {
    renderTabs();
    const name = TABS.find(([v]) => v === tab)[1];
    $(".aba-conteudo").innerHTML = `<h2 class="aba-titulo"></h2><p class="aba-em-breve">Em construção ✨</p>`;
    $(".aba-titulo").textContent = name;
  }

  function show(id, tabName = "manuscrito") {
    const changed = id !== storyId;
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
    const el = event.target.closest("[data-acao], [data-status], [data-cor], [data-aba]");
    if (!el || !storyId) return;
    if (el.dataset.acao === "mesa") onBack();
    else if (el.dataset.acao === "apagar") removeStory();
    else if (el.dataset.status && el.closest(".selos")) save({ status: el.dataset.status });
    else if (el.dataset.cor) save({ color: el.dataset.cor });
    else if (el.dataset.aba) {
      tab = el.dataset.aba;
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
    get storyId() { return storyId; },
    book: () => $(".esc-aberto"),
  };
}
