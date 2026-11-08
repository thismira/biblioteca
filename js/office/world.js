// Aba "Mundo" (worldbuilding): seções como divisórias de um arquivo, cada
// uma com fichas (título, texto e imagem opcional). Seções sugeridas
// aparecem como "+ Lugares", "+ Magia & regras"… e só são criadas quando
// ela clica. Busca no título e no texto das fichas (sem acentos).
// Clicar numa ficha abre a janela da ficha (world-card.js).

import * as db from "../data/db.js";
import { confirmDialog, promptDialog, toast } from "../ui/dialogs.js";
import { plain } from "../ui/search.js";
import { openWorldCard } from "./world-card.js";

const plural = (n, one, many) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
// Texto de uma ficha sem as tags (para a busca e o resumo).
const textOf = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.replace(/\s+/g, " ").trim();
};

export function createWorld() {
  const el = document.createElement("div");
  el.className = "mundo";
  el.innerHTML = `
    <h2 class="aba-titulo">Mundo</h2>
    <input type="search" class="mundo-busca" placeholder="Procurar no mundo…" aria-label="Procurar nas fichas do mundo">
    <p class="mundo-resultado" aria-live="polite"></p>
    <div class="mundo-secoes"></div>
    <div class="mundo-sugestoes"></div>`;
  const list = el.querySelector(".mundo-secoes");
  const search = el.querySelector(".mundo-busca");
  const result = el.querySelector(".mundo-resultado");
  const suggestions = el.querySelector(".mundo-sugestoes");
  let storyId = null;
  const closed = new Set(); // seções fechadas (só na memória)

  const world = () => db.getStory(storyId)?.world || [];

  function cardButton(sectionId, card) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ficha-mundo-cartao";
    b.dataset.secao = sectionId;
    b.dataset.ficha = card.id;
    b.innerHTML = `<span class="fmc-texto"><b></b><span></span></span>`;
    b.querySelector("b").textContent = card.title || "Sem título";
    const summary = textOf(card.html);
    b.querySelector(".fmc-texto span").textContent = summary.length > 110 ? summary.slice(0, 110) + "…" : summary;
    if (card.image) {
      const img = document.createElement("img");
      img.alt = "";
      img.className = "fmc-imagem";
      img.dataset.path = card.image.path;
      b.prepend(img);
    }
    return b;
  }

  function render() {
    if (!storyId) return;
    const query = plain(search.value).trim();
    const words = query.split(/\s+/).filter(Boolean);
    const matches = (card) => !words.length || words.every((w) => plain(`${card.title} ${textOf(card.html)}`).includes(w));
    let found = 0;
    const sections = world().map((sec) => {
      const cards = sec.cards.filter(matches);
      found += cards.length;
      if (words.length && !cards.length) return null; // buscando: some a seção sem resultado
      const box = document.createElement("section");
      box.className = "mundo-secao";
      box.dataset.secao = sec.id;
      const open = words.length > 0 || !closed.has(sec.id);
      box.innerHTML = `
        <header class="ms-cabeca">
          <button class="ms-nome" type="button" data-acao="abrir-fechar" aria-expanded="${open}"><span class="ms-seta" aria-hidden="true">▸</span><span class="ms-titulo"></span> <small></small></button>
          <span class="ms-acoes">
            <button class="link" type="button" data-acao="renomear-secao">renomear</button>
            <button class="link" type="button" data-acao="apagar-secao">apagar</button>
          </span>
        </header>
        <div class="ms-fichas"${open ? "" : " hidden"}></div>`;
      box.querySelector(".ms-titulo").textContent = sec.name;
      box.querySelector("small").textContent = plural(sec.cards.length, "ficha", "fichas");
      const grid = box.querySelector(".ms-fichas");
      grid.append(...cards.map((c) => cardButton(sec.id, c)));
      if (!words.length) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "ficha-mundo-nova";
        add.dataset.acao = "nova-ficha";
        add.textContent = "+ Nova ficha";
        grid.appendChild(add);
      }
      return box;
    }).filter(Boolean);
    list.replaceChildren(...sections);
    result.textContent = words.length ? (found ? plural(found, "ficha encontrada", "fichas encontradas") : "Nada encontrado no mundo.") : "";
    search.hidden = !world().some((s) => s.cards.length);
    if (search.hidden && search.value) search.value = "";
    renderSuggestions(words.length > 0);
    loadImages();
  }

  // Sugestões que ainda não viraram seção + "Outra seção".
  function renderSuggestions(searching) {
    suggestions.hidden = searching;
    if (searching) return;
    const names = world().map((s) => plain(s.name));
    const missing = db.WORLD_SUGGESTIONS.filter((n) => !names.includes(plain(n)));
    suggestions.innerHTML = `<p class="ms-dica"></p>`;
    suggestions.querySelector(".ms-dica").textContent = world().length
      ? "Mais seções:"
      : "Comece por uma seção. Cada uma guarda fichas: lugares, regras da magia, povos, objetos…";
    for (const name of missing) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip sugerida ms-sugestao";
      b.dataset.acao = "criar-secao";
      b.dataset.nome = name;
      b.textContent = `+ ${name}`;
      suggestions.appendChild(b);
    }
    const other = document.createElement("button");
    other.type = "button";
    other.className = "chip sugerida ms-sugestao";
    other.dataset.acao = "outra-secao";
    other.textContent = "+ Outra seção";
    suggestions.appendChild(other);
  }

  async function loadImages() {
    const imgs = [...list.querySelectorAll("img[data-path]")];
    if (!imgs.length) return;
    try {
      const urls = await db.getPhotoUrls(imgs.map((i) => i.dataset.path));
      imgs.forEach((i) => urls[i.dataset.path] && (i.src = urls[i.dataset.path]));
    } catch (err) {
      console.error(err);
    }
  }

  function show(id) {
    if (id !== storyId) {
      storyId = id;
      search.value = "";
      closed.clear();
    }
    render();
  }

  const nameOk = (name, exceptId) =>
    world().some((s) => s.id !== exceptId && plain(s.name).trim() === plain(name).trim()) ? "Já existe uma seção com esse nome." : null;

  async function createSection(name) {
    if (!name) {
      name = await promptDialog({ title: "Nova seção", label: "Nome da seção", placeholder: "Ex.: Criaturas", confirmText: "Criar", validate: (n) => nameOk(n) });
      if (!name) return;
    }
    db.addWorldSection(storyId, name.trim()).catch((err) => toast(err.message));
  }

  async function renameSection(sectionId) {
    const sec = world().find((s) => s.id === sectionId);
    const name = await promptDialog({ title: "Renomear seção", label: "Nome da seção", value: sec.name, validate: (n) => nameOk(n, sectionId) });
    if (!name || name === sec.name) return;
    db.renameWorldSection(storyId, sectionId, name.trim()).catch((err) => toast(err.message));
  }

  async function removeSection(sectionId) {
    const sec = world().find((s) => s.id === sectionId);
    const ok = await confirmDialog({
      title: "Apagar esta seção?",
      message: sec.cards.length
        ? `"${sec.name}" e ${sec.cards.length === 1 ? "a ficha dentro dela (com a imagem, se tiver) também será apagada" : `as ${sec.cards.length} fichas dentro dela (com as imagens) também serão apagadas`}. Isso não pode ser desfeito.`
        : `A seção "${sec.name}" será apagada.`,
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (ok) db.deleteWorldSection(storyId, sectionId).catch((err) => toast(err.message));
  }

  async function newCard(sectionId) {
    try {
      const card = await db.addWorldCard(storyId, sectionId);
      openWorldCard(storyId, sectionId, card.id, { isNew: true });
    } catch (err) {
      toast(err.message);
    }
  }

  el.addEventListener("click", (event) => {
    const card = event.target.closest(".ficha-mundo-cartao");
    if (card) return openWorldCard(storyId, card.dataset.secao, card.dataset.ficha);
    const button = event.target.closest("[data-acao]");
    if (!button || !storyId) return;
    const sectionId = button.closest("[data-secao]")?.dataset.secao;
    const action = button.dataset.acao;
    if (action === "criar-secao") createSection(button.dataset.nome);
    else if (action === "outra-secao") createSection();
    else if (action === "renomear-secao") renameSection(sectionId);
    else if (action === "apagar-secao") removeSection(sectionId);
    else if (action === "nova-ficha") newCard(sectionId);
    else if (action === "abrir-fechar") {
      if (closed.has(sectionId)) closed.delete(sectionId);
      else closed.add(sectionId);
      render();
    }
  });

  let searchTimer = null;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 150);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      search.value = "";
      render();
    }
  });

  return { el, show, render };
}
