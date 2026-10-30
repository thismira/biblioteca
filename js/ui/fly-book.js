// Ferramentas da animação de "livro voando", usadas na página do livro
// (abrir/fechar) e quando um livro novo chega na estante.

import { spineColor } from "./shelf.js";
import { readableTextColor } from "../utils/color.js";
import { setCoverImage } from "./cover-image.js";

export const PERSPECTIVE = "perspective(900px)";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Posição/tamanho de um retângulo como estilos CSS.
export const px = (r) => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });

// Retângulo no meio do caminho entre `a` e `b` (t = 0 a 1).
export const lerp = (a, b, t) => ({
  left: a.left + (b.left - a.left) * t,
  top: a.top + (b.top - a.top) * t,
  width: a.width + (b.width - a.width) * t,
  height: a.height + (b.height - a.height) * t,
});

// Espera uma animação terminar, mas com tempo máximo: se o navegador não
// estiver desenhando (ex.: aba em segundo plano), a página não fica travada.
export function done(animation) {
  const timing = animation.effect.getComputedTiming();
  const limit = (timing.endTime || 0) + 150;
  return Promise.race([
    animation.finished.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, limit)),
  ]);
}

// "Capa" para voar: a imagem da capa ou, sem capa, um livro na cor da lombada.
export function coverFace(book) {
  const face = document.createElement("div");
  face.className = "detalhe-capa face";
  if (book.coverUrl) {
    const img = document.createElement("img");
    img.alt = "";
    setCoverImage(img, book.coverUrl);
    face.appendChild(img);
  } else {
    const color = spineColor(book);
    face.style.setProperty("--cor", color);
    face.style.setProperty("--cor-texto", readableTextColor(color));
    face.innerHTML = `<div class="capa-gerada"><strong></strong></div>`;
    face.querySelector("strong").textContent = book.title;
  }
  return face;
}

// Cópia de uma lombada para voar.
export function spineFace(spine) {
  const face = spine.cloneNode(true);
  face.removeAttribute("data-id");
  face.classList.add("face");
  face.tabIndex = -1;
  return face;
}

// Livro novo: a capa sai de `fromRect`, voa girando até o lugar da lombada,
// vira lombada no meio do giro e se encaixa com um pulinho e um brilho.
export async function flyIntoShelf(fromRect, book, spine) {
  spine.style.visibility = "hidden";
  const to = spine.getBoundingClientRect();
  const lifted = { left: to.left, top: to.top - 40, width: to.width, height: to.height };
  const mid = lerp(fromRect, lifted, 0.55);

  const flier = document.createElement("div");
  flier.className = "livro-voando";
  Object.assign(flier.style, px(fromRect));
  flier.appendChild(coverFace(book));
  document.body.appendChild(flier);

  await done(flier.animate(
    [{ ...px(fromRect), transform: `${PERSPECTIVE} rotateY(0deg)` }, { ...px(mid), transform: `${PERSPECTIVE} rotateY(90deg)` }],
    { duration: 380, easing: "ease-in", fill: "forwards" }
  ));
  flier.firstElementChild.replaceWith(spineFace(spine));
  await done(flier.animate(
    [{ ...px(mid), transform: `${PERSPECTIVE} rotateY(-90deg)` }, { ...px(lifted), transform: `${PERSPECTIVE} rotateY(0deg)` }],
    { duration: 380, easing: "ease-out", fill: "forwards" }
  ));
  // desce e se encaixa na prateleira
  await done(flier.animate(
    [px(lifted), px(to)],
    { duration: 280, easing: "cubic-bezier(.3,1.5,.5,1)", fill: "forwards" }
  ));

  flier.remove();
  spine.style.visibility = "";
  spine.classList.remove("chegou");
  void spine.offsetWidth; // reinicia a animação de brilho
  spine.classList.add("chegou");
}

// Livro novo quando ela está na sala: a capa voa da janela de cadastro e
// "entra" na miniatura da estante, que dá um brilho ao recebê-la.
export async function flyIntoCard(fromRect, book, card) {
  const to = card.getBoundingClientRect();
  const target = { left: to.left + to.width / 2 - 22, top: to.top + to.height * 0.3, width: 44, height: 66 };

  const flier = document.createElement("div");
  flier.className = "livro-voando";
  Object.assign(flier.style, px(fromRect));
  flier.appendChild(coverFace(book));
  document.body.appendChild(flier);

  await done(flier.animate(
    [
      { ...px(fromRect), transform: `${PERSPECTIVE} rotate(0deg)`, opacity: 1 },
      { ...px(target), transform: `${PERSPECTIVE} rotate(-8deg)`, opacity: 0.85 },
    ],
    { duration: 650, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }
  ));
  flier.remove();
  card.classList.remove("chegou");
  void card.offsetWidth; // reinicia a animação de brilho
  card.classList.add("chegou");
}
