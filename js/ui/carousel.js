// Carrossel: um item por vez, com setas, bolinhas, arrastar com o dedo
// (pointer events) e setas do teclado; do último volta ao primeiro; a
// altura acompanha o item que está aparecendo.
// Usado pelos trechos dos livros e, no escritório, pelos quotes e pelas
// frases das músicas. Os itens são <li> montados por quem usa (`set`).

const SWIPE_DISTANCE = 50; // quanto arrastar (px) para passar de item
const MAX_DOTS = 12;       // com mais itens que isso, só mostra "3 de 20"

// `busy()`: true enquanto um item está sendo editado (sem arrastar/teclado).
export function createCarousel({ label, prev, next, item, busy = () => false }) {
  const el = document.createElement("div");
  el.className = "quotes-carrossel";
  el.innerHTML = `
    <button class="carrossel-seta" type="button" data-ir="-1">‹</button>
    <div class="carrossel-janela" tabindex="0" aria-roledescription="carrossel">
      <ul class="quotes-lista"></ul>
    </div>
    <button class="carrossel-seta" type="button" data-ir="1">›</button>
    <div class="carrossel-rodape">
      <span class="carrossel-pontos"></span>
      <span class="carrossel-contagem" aria-live="polite"></span>
    </div>`;
  el.querySelector('[data-ir="-1"]').setAttribute("aria-label", prev);
  el.querySelector('[data-ir="1"]').setAttribute("aria-label", next);
  const windowEl = el.querySelector(".carrossel-janela");
  windowEl.setAttribute("aria-label", label);
  const list = el.querySelector(".quotes-lista");
  const dotsEl = el.querySelector(".carrossel-pontos");
  const countEl = el.querySelector(".carrossel-contagem");
  let index = 0;
  let slides = [];

  // A caixa acompanha a altura do item que está aparecendo.
  function fitHeight() {
    const active = slides[index];
    if (active && active.offsetHeight) windowEl.style.height = active.offsetHeight + "px";
  }
  // Recalcula quando a altura muda (página aparecendo, edição, fonte carregando).
  const resizeWatcher = new ResizeObserver(fitHeight);

  // Troca os itens. Continua no item que estava aparecendo (ou em `showId`).
  function set(newSlides, { showId = null } = {}) {
    const currentId = showId || slides[index]?.dataset.id;
    resizeWatcher.disconnect();
    slides = newSlides;
    slides.forEach((li) => resizeWatcher.observe(li));
    list.replaceChildren(...slides);
    const found = slides.findIndex((li) => li.dataset.id === currentId);
    index = found >= 0 ? found : Math.min(index, Math.max(0, slides.length - 1));
    el.classList.toggle("um-so", slides.length < 2);
    dotsEl.replaceChildren(
      ...(slides.length <= MAX_DOTS && slides.length > 1
        ? slides.map((_, i) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "ponto";
            dot.dataset.para = i;
            dot.setAttribute("aria-label", `${item} ${i + 1}`);
            return dot;
          })
        : [])
    );
    move({ animate: false });
  }

  // Mostra o item `index`, deslizando (ou não) até ele.
  function move({ animate = true, offset = 0 } = {}) {
    list.style.transition = animate ? "" : "none";
    list.style.transform = `translateX(calc(${-index * 100}% + ${offset}px))`;
    if (!animate) void list.offsetWidth; // aplica sem animar
    list.style.transition = "";
    slides.forEach((li, i) => {
      const active = i === index;
      li.inert = !active; // itens escondidos não recebem foco
      li.setAttribute("aria-hidden", String(!active));
    });
    dotsEl.querySelectorAll(".ponto").forEach((d, i) => d.setAttribute("aria-current", String(i === index)));
    countEl.textContent = slides.length > 1 ? `${index + 1} de ${slides.length}` : "";
    fitHeight();
  }

  function goTo(i) {
    if (!slides.length) return;
    index = (i + slides.length) % slides.length; // do último volta ao primeiro
    move();
  }

  el.addEventListener("click", (event) => {
    const step = event.target.closest("[data-ir]")?.dataset.ir;
    const dot = event.target.closest("[data-para]")?.dataset.para;
    if (step) goTo(index + Number(step));
    if (dot !== undefined) goTo(Number(dot));
  });

  windowEl.addEventListener("keydown", (event) => {
    if (busy()) return;
    if (event.key === "ArrowLeft") goTo(index - 1);
    if (event.key === "ArrowRight") goTo(index + 1);
  });

  // Arrastar para os lados (dedo ou mouse). Só vira arraste se o movimento
  // for mais para o lado do que para cima/baixo, para não atrapalhar a rolagem.
  let drag = null;
  windowEl.addEventListener("pointerdown", (event) => {
    if (busy() || slides.length < 2 || event.target.closest("button, textarea, input, select")) return;
    drag = { x: event.clientX, y: event.clientY, dragging: false, id: event.pointerId };
  });
  windowEl.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.dragging) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return (drag = null); // é rolagem
      if (Math.abs(dx) < 8) return;
      drag.dragging = true;
      // Continua recebendo o movimento mesmo se o dedo sair da caixa.
      // (Pode falhar se o toque já foi cancelado; o arraste segue assim mesmo.)
      try { windowEl.setPointerCapture(drag.id); } catch {}
    }
    move({ animate: false, offset: dx }); // o item acompanha o dedo
  });
  const endDrag = (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const wasDragging = drag.dragging;
    drag = null;
    if (!wasDragging) return;
    if (dx <= -SWIPE_DISTANCE) goTo(index + 1);
    else if (dx >= SWIPE_DISTANCE) goTo(index - 1);
    else move(); // pouco: volta para o lugar
  };
  windowEl.addEventListener("pointerup", endDrag);
  windowEl.addEventListener("pointercancel", endDrag);

  return {
    el,
    set,
    goTo,
    slides: () => slides,
    reset() {
      index = 0;
      slides = [];
    },
  };
}
