// Um caderno visto de cima (uma história). Usado na mesa e na página da
// história. Cor, inclinação e cor da fitinha são fixas para cada história.

import { STORY_STATUSES } from "../data/db.js";

// Capas de tecido: [cor da capa, cor do elástico].
export const COVERS = [
  ["#D9A5B3", "#7B4354"], // rosa antigo
  ["#B7C7AB", "#5C6E52"], // sálvia
  ["#C9BBDB", "#5E4F78"], // lavanda
  ["#EAD9A9", "#8A6A2C"], // manteiga
  ["#AFC3D3", "#4C6276"], // azul empoeirado
  ["#E6B8A2", "#8A4E36"], // pêssego
  ["#A9C9C1", "#476B62"], // menta
  ["#E3B5C9", "#7A3F5B"], // malva
];
const RIBBONS = ["#C9A14A", "#E7A0B2", "#9E4A65", "#F4EBDD"];

export const statusLabel = (status) => STORY_STATUSES.find(([v]) => v === status)?.[1] || "";

// Número estável a partir do id (a mesma história cai sempre igual).
function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// A cor menos usada, para cada caderno novo sair diferente.
export function nextCover(stories) {
  const uses = COVERS.map(([c]) => stories.filter((s) => s.color === c).length);
  return COVERS[uses.indexOf(Math.min(...uses))][0];
}

const words = (n) => (n ? `${n.toLocaleString("pt-BR")} palavra${n === 1 ? "" : "s"}` : "começando");

// Cria (ou atualiza) o botão-caderno de uma história.
export function paintNotebook(el, story) {
  const cover = COVERS.find(([c]) => c === story.color) || COVERS[hash(story.id) % COVERS.length];
  const h = hash(story.id);
  el.className = "caderno";
  el.type = "button";
  el.dataset.id = story.id;
  el.dataset.status = story.status;
  el.style.setProperty("--cor", story.color || cover[0]);
  el.style.setProperty("--el", cover[1]);
  el.style.setProperty("--fita", RIBBONS[h % RIBBONS.length]);
  el.style.setProperty("--r", `${(h % 11) - 5.5}deg`); // de -5,5° a 4,5°
  const title = story.title || "Sem título";
  el.setAttribute("aria-label", `${title} — ${statusLabel(story.status)}, ${words(story.words)}`);
  el.innerHTML = `
    <span class="caderno-folhas"></span>
    <span class="caderno-capa">
      <span class="caderno-elastico"></span><span class="caderno-fitinha"></span>
      <span class="caderno-etiqueta"><b></b><small></small></span>
    </span>
    <span class="caderno-status"></span>`;
  el.querySelector("b").textContent = title;
  // Título longo: a letra diminui (nada é cortado, como nas lombadas).
  if (title.length > 26) el.dataset.longo = title.length > 48 ? "2" : "1";
  else delete el.dataset.longo;
  el.querySelector("small").textContent = words(story.words);
  el.querySelector(".caderno-status").textContent = statusLabel(story.status);
  return el;
}
