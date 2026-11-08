// Aba "Personagens": um quadro de linho com polaroids presas por alfinetes.
// Cada polaroid: foto (ou a inicial), nome à mão, papel e até 3 traits.
// "+ Novo personagem" pede o nome e abre a página dele. Arrastar muda a
// ordem (drag.js em grade, `row: "auto"`).

import * as db from "../data/db.js";
import { enableDragAndDrop } from "../ui/drag.js";
import { promptDialog, toast } from "../ui/dialogs.js";

// Inclinação e cor do "papel" fixas para cada personagem.
function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const BACKS = ["#F3D3DB", "#DCE6D3", "#E2D9EF", "#F3E6C4", "#D6E2EC"];

export function createCharacterBoard({ onOpen }) {
  const el = document.createElement("div");
  el.className = "personagens";
  el.innerHTML = `
    <h2 class="aba-titulo">Personagens</h2>
    <div class="quadro">
      <div class="quadro-fotos" aria-label="Personagens"></div>
    </div>`;
  const board = el.querySelector(".quadro-fotos");
  const cards = new Map(); // id → polaroid (reaproveitadas: o arraste não perde o item)
  let storyId = null;

  const newCard = document.createElement("button");
  newCard.type = "button";
  newCard.className = "polaroid polaroid-novo";
  newCard.dataset.acao = "novo";
  newCard.innerHTML = `<span class="polaroid-foto"><span>+</span></span><span class="polaroid-nome">Novo personagem</span>`;

  function paint(card, c) {
    const h = hash(c.id);
    card.style.setProperty("--r", `${(h % 7) - 3}deg`);
    card.style.setProperty("--fundo", BACKS[h % BACKS.length]);
    card.setAttribute("aria-label", `${c.name || "Sem nome"}${c.role ? `, ${c.role}` : ""}`);
    card.querySelector(".polaroid-nome").textContent = c.name || "Sem nome";
    card.querySelector(".polaroid-papel").textContent = c.role;
    const traits = card.querySelector(".polaroid-traits");
    traits.replaceChildren(...c.traits.slice(0, 3).map((t) => Object.assign(document.createElement("span"), { textContent: t })));
    const photo = card.querySelector(".polaroid-foto");
    const path = c.cover?.path;
    if (!path) {
      photo.replaceChildren(Object.assign(document.createElement("span"), { className: "polaroid-inicial", textContent: (c.name || "?").trim().charAt(0).toUpperCase() }));
      return;
    }
    let img = photo.querySelector("img");
    if (img?.dataset.path === path) return;
    img = document.createElement("img");
    img.alt = "";
    img.dataset.path = path;
    img.decoding = "async";
    photo.replaceChildren(img);
    db.getPhotoUrls([path]).then((urls) => {
      if (urls[path] && img.dataset.path === path) img.src = urls[path];
    }).catch((err) => console.error(err));
  }

  function makeCard(id) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "polaroid";
    card.dataset.id = id;
    card.innerHTML = `
      <span class="polaroid-alfinete" aria-hidden="true"></span>
      <span class="polaroid-foto"></span>
      <span class="polaroid-nome"></span>
      <span class="polaroid-papel"></span>
      <span class="polaroid-traits"></span>`;
    return card;
  }

  function render() {
    if (!storyId || dragger.isDragging()) return;
    const story = db.getStory(storyId);
    if (!story) return;
    // pede os links de todas as fotos de uma vez
    db.getPhotoUrls(story.characters.map((c) => c.cover?.path).filter(Boolean)).catch(() => {});
    const seen = new Set();
    const items = story.characters.map((c) => {
      seen.add(c.id);
      if (!cards.has(c.id)) cards.set(c.id, makeCard(c.id));
      const card = cards.get(c.id);
      paint(card, c);
      return card;
    });
    for (const id of cards.keys()) if (!seen.has(id)) cards.delete(id);
    board.replaceChildren(...items, newCard);
  }

  function show(id) {
    if (id !== storyId) {
      storyId = id;
      cards.clear();
    }
    render();
  }

  async function createCharacter() {
    const name = await promptDialog({
      title: "Novo personagem",
      label: "Nome do personagem",
      placeholder: "Ex.: Clara Albuquerque",
      confirmText: "Criar",
      maxLength: 80,
    });
    if (!name) return;
    try {
      const character = await db.addCharacter(storyId, { name: name.trim().replace(/\s+/g, " ") });
      onOpen(storyId, character.id);
    } catch (err) {
      toast(err.message);
    }
  }

  board.addEventListener("click", (event) => {
    const card = event.target.closest(".polaroid");
    if (!card || !storyId) return;
    if (card.dataset.acao === "novo") createCharacter();
    else onOpen(storyId, card.dataset.id);
  });

  const dragger = enableDragAndDrop({
    container: board,
    item: ".polaroid[data-id]",
    row: "auto",
    ghostClass: "polaroid-fantasma",
    slotClass: "polaroid-vaga",
    canDrag: () => cards.size > 1,
    renderOrder: (ids) => board.replaceChildren(...ids.map((id) => cards.get(id)).filter(Boolean), newCard),
    onDrop: (id, prev, next, changed) => {
      if (!changed) return render();
      const ids = [...board.querySelectorAll(".polaroid[data-id]")].map((c) => c.dataset.id);
      db.moveCharacters(storyId, ids).catch((err) => {
        toast(err.message);
        render();
      });
    },
  });

  return { el, show, render };
}
