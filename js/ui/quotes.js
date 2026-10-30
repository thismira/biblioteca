// Trechos favoritos de um livro, com o número da página.
// Fica dentro da página do livro; `getBook()` devolve o livro aberto e
// `save(changes)` grava as mudanças.
//
// Os trechos aparecem num carrossel: um por vez, com setas, bolinhas,
// arrastar com o dedo (pointer events) e setas do teclado.

import { confirmDialog } from "./dialogs.js";
import { pickAndCrop } from "./photo-crop.js";
import { recognizeText } from "../services/ocr.js";

// Confiança da leitura (0–100): abaixo de MIN não preenche; abaixo de GOOD avisa.
const MIN_CONFIDENCE = 45;
const GOOD_CONFIDENCE = 75;
const SWIPE_DISTANCE = 50; // quanto arrastar (px) para passar de trecho
const MAX_DOTS = 12;       // com mais trechos que isso, só mostra "3 de 20"

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Em ordem de página, como no livro; trechos sem página vão para o fim.
function sorted(quotes) {
  return [...quotes].sort(
    (a, b) => (a.page ?? Infinity) - (b.page ?? Infinity) || (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

export function createQuotes(container, { getBook, save }) {
  container.innerHTML = `
    <div class="quotes-carrossel">
      <button class="carrossel-seta" type="button" data-ir="-1" aria-label="Trecho anterior">‹</button>
      <div class="carrossel-janela" tabindex="0" aria-roledescription="carrossel" aria-label="Trechos favoritos">
        <ul class="quotes-lista"></ul>
      </div>
      <button class="carrossel-seta" type="button" data-ir="1" aria-label="Próximo trecho">›</button>
      <div class="carrossel-rodape">
        <span class="carrossel-pontos"></span>
        <span class="carrossel-contagem" aria-live="polite"></span>
      </div>
    </div>
    <p class="quotes-vazio">Nenhum trecho guardado ainda. Aquela frase que você sublinhou mora aqui. ✨</p>
    <form class="quote-novo">
      <label for="quote-texto">Novo trecho</label>
      <textarea id="quote-texto" required placeholder="Copie aqui o trecho que você amou…"></textarea>
      <div class="quote-linha">
        <label for="quote-pagina">Página</label>
        <input id="quote-pagina" type="number" min="1" inputmode="numeric">
        <button class="botao" type="submit">Guardar trecho</button>
        <button class="botao secundario" type="button" data-acao="fotografar">📷 Fotografar trecho</button>
      </div>
      <p class="quote-leitura" aria-live="polite"></p>
    </form>`;

  const carousel = container.querySelector(".quotes-carrossel");
  const windowEl = container.querySelector(".carrossel-janela");
  const list = container.querySelector(".quotes-lista");
  const dotsEl = container.querySelector(".carrossel-pontos");
  const countEl = container.querySelector(".carrossel-contagem");
  const form = container.querySelector(".quote-novo");
  const textInput = form.querySelector("textarea");
  const pageInput = form.querySelector("input");
  const photoButton = form.querySelector('[data-acao="fotografar"]');
  const readingStatus = form.querySelector(".quote-leitura");
  let editingId = null; // trecho em edição (só um por vez)
  let index = 0;        // trecho que está aparecendo no carrossel
  let slides = [];

  // Página digitada -> número dentro do livro, ou null se vazia.
  function readPage(value) {
    if (value === "") return null;
    const pages = getBook().pages;
    return Math.max(1, Math.min(Number(value), pages || Infinity));
  }

  // Desenha os trechos. `showId`: vai direto para esse trecho.
  function render({ showId = null } = {}) {
    const quotes = sorted(getBook()?.quotes || []);
    container.querySelector(".quotes-vazio").hidden = quotes.length > 0;
    carousel.hidden = quotes.length === 0;
    pageInput.max = getBook()?.pages || "";
    const currentId = showId || slides[index]?.dataset.id;
    slides = quotes.map((q) => {
      const li = document.createElement("li");
      li.className = "quote-slide";
      li.dataset.id = q.id;
      li.appendChild(q.id === editingId ? editCard(q) : card(q));
      resizeWatcher.observe(li);
      return li;
    });
    list.replaceChildren(...slides);
    const found = quotes.findIndex((q) => q.id === currentId);
    index = found >= 0 ? found : Math.min(index, Math.max(0, quotes.length - 1));
    carousel.classList.toggle("um-so", quotes.length < 2);
    renderDots();
    move({ animate: false });
  }

  function renderDots() {
    const n = slides.length;
    dotsEl.replaceChildren(
      ...(n <= MAX_DOTS && n > 1
        ? slides.map((_, i) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "ponto";
            dot.dataset.para = i;
            dot.setAttribute("aria-label", `Trecho ${i + 1}`);
            return dot;
          })
        : [])
    );
  }

  // Mostra o trecho `index`, deslizando (ou não) até ele.
  function move({ animate = true, offset = 0 } = {}) {
    list.style.transition = animate ? "" : "none";
    list.style.transform = `translateX(calc(${-index * 100}% + ${offset}px))`;
    if (!animate) void list.offsetWidth; // aplica sem animar
    list.style.transition = "";
    slides.forEach((li, i) => {
      const active = i === index;
      li.inert = !active; // trechos escondidos não recebem foco
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

  // A caixa acompanha a altura do trecho que está aparecendo.
  function fitHeight() {
    const active = slides[index];
    if (active && active.offsetHeight) windowEl.style.height = active.offsetHeight + "px";
  }
  // Recalcula quando a altura muda (página aparecendo, edição, fonte carregando).
  const resizeWatcher = new ResizeObserver(fitHeight);

  carousel.addEventListener("click", (event) => {
    const step = event.target.closest("[data-ir]")?.dataset.ir;
    const dot = event.target.closest("[data-para]")?.dataset.para;
    if (step) goTo(index + Number(step));
    if (dot !== undefined) goTo(Number(dot));
  });

  windowEl.addEventListener("keydown", (event) => {
    if (editingId) return;
    if (event.key === "ArrowLeft") goTo(index - 1);
    if (event.key === "ArrowRight") goTo(index + 1);
  });

  // Arrastar para os lados (dedo ou mouse). Só vira arraste se o movimento
  // for mais para o lado do que para cima/baixo, para não atrapalhar a rolagem.
  let drag = null;
  windowEl.addEventListener("pointerdown", (event) => {
    if (editingId || slides.length < 2 || event.target.closest("button, textarea, input")) return;
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
      windowEl.setPointerCapture(drag.id);
    }
    move({ animate: false, offset: dx }); // o trecho acompanha o dedo
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

  function card(q) {
    const li = document.createElement("div");
    li.className = "quote";
    li.innerHTML = `
      <blockquote></blockquote>
      <div class="quote-rodape">
        <span class="quote-pagina"></span>
        <span class="quote-acoes">
          <button class="link" type="button" data-acao="editar">editar</button>
          <button class="link" type="button" data-acao="apagar">apagar</button>
        </span>
      </div>`;
    li.querySelector("blockquote").textContent = q.text;
    li.querySelector(".quote-pagina").textContent = q.page ? `— p. ${q.page}` : "";
    return li;
  }

  function editCard(q) {
    const li = document.createElement("div");
    li.className = "quote editando";
    li.innerHTML = `
      <textarea aria-label="Texto do trecho"></textarea>
      <div class="quote-linha">
        <label>Página <input type="number" min="1" inputmode="numeric"></label>
        <button class="botao" type="button" data-acao="salvar">Salvar</button>
        <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
      </div>`;
    li.querySelector("textarea").value = q.text;
    li.querySelector("input").value = q.page ?? "";
    li.querySelector("input").max = getBook().pages || "";
    return li;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;
    const quote = { id: newId(), text, page: readPage(pageInput.value), createdAt: new Date().toISOString() };
    await save({ quotes: [...(getBook().quotes || []), quote] });
    textInput.value = "";
    pageInput.value = "";
    readingStatus.textContent = "";
    // Vai até o trecho novo, deslizando, e dá um brilho nele.
    render();
    const position = slides.findIndex((li) => li.dataset.id === quote.id);
    goTo(position);
    slides[position]?.querySelector(".quote").classList.add("novo");
  });

  // Foto do trecho: ela recorta o trecho na foto e o site lê o texto.
  photoButton.addEventListener("click", async () => {
    const piece = await pickAndCrop({
      title: "Foto do trecho",
      hint: "Ajuste o retângulo em volta só do trecho que você quer guardar.",
      box: "trecho",
      maxSize: 2400, // mais resolução ajuda a ler letras pequenas
    });
    if (!piece) return;
    photoButton.disabled = true;
    try {
      const { text, confidence } = await recognizeText(piece, {
        onProgress: (message, progress) => {
          readingStatus.textContent = progress > 0 && progress < 1 ? `${message} ${Math.round(progress * 100)}%` : message;
        },
      });
      // Confiança baixa = foto ruim: melhor não colar letras sem sentido.
      if (!text || confidence < MIN_CONFIDENCE) {
        readingStatus.textContent = "Não consegui ler bem essa foto. Tente de novo com mais luz, com a página bem reta e mais de perto.";
        return;
      }
      // Se já havia texto no campo, o novo entra embaixo.
      textInput.value = textInput.value.trim() ? `${textInput.value.trim()}\n\n${text}` : text;
      readingStatus.textContent = confidence < GOOD_CONFIDENCE
        ? "Li o trecho, mas a foto estava difícil: confira o texto com atenção antes de guardar."
        : "Pronto! Confira o texto: o leitor às vezes troca uma letra ou outra.";
      textInput.focus();
    } catch (err) {
      console.error(err);
      readingStatus.textContent = err.message.startsWith("Não consegui")
        ? err.message
        : "Algo deu errado ao ler a foto. Tente de novo.";
    } finally {
      photoButton.disabled = false;
    }
  });

  list.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    const li = event.target.closest(".quote-slide");
    if (!action || !li) return;
    const quotes = getBook().quotes || [];
    const quote = quotes.find((q) => q.id === li.dataset.id);

    if (action === "editar") {
      editingId = quote.id;
      render();
      list.querySelector(".editando textarea").focus();
    } else if (action === "cancelar") {
      editingId = null;
      render();
    } else if (action === "salvar") {
      const text = li.querySelector("textarea").value.trim();
      if (!text) return;
      const page = readPage(li.querySelector("input").value);
      editingId = null;
      await save({ quotes: quotes.map((q) => (q.id === quote.id ? { ...q, text, page } : q)) });
      render({ showId: quote.id }); // se a página mudou, a ordem muda: segue o trecho
    } else if (action === "apagar") {
      const preview = quote.text.length > 80 ? quote.text.slice(0, 80) + "…" : quote.text;
      const ok = await confirmDialog({
        title: "Apagar este trecho?",
        message: `"${preview}" será apagado. Isso não pode ser desfeito.`,
        confirmText: "Sim, apagar",
        danger: true,
      });
      if (!ok) return;
      await save({ quotes: quotes.filter((q) => q.id !== quote.id) });
      render();
    }
  });

  return {
    render() {
      editingId = null;
      index = 0;
      slides = [];
      textInput.value = "";
      pageInput.value = "";
      readingStatus.textContent = "";
      render();
    },
  };
}
