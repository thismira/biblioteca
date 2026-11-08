// Trechos favoritos de um livro, com o número da página.
// Fica dentro da página do livro; `getBook()` devolve o livro aberto e
// `save(changes)` grava as mudanças.
// No escritório (história e personagens) usa `chapters()` — lista
// [{ id, title }] — e cada trecho guarda o capítulo (`chapterId`) no lugar
// da página. `photo: false` tira o botão de fotografar. Ids únicos: pode
// haver mais de um na mesma tela.
//
// Os trechos aparecem num carrossel (carousel.js): um por vez, com setas,
// bolinhas, arrastar com o dedo (pointer events) e setas do teclado.

import { confirmDialog } from "./dialogs.js";
import { createCarousel } from "./carousel.js";
import { pickAndCrop } from "./photo-crop.js";
import { recognizeText } from "../services/ocr.js";

// Confiança da leitura (0–100): abaixo de MIN não preenche; abaixo de GOOD avisa.
const MIN_CONFIDENCE = 45;
const GOOD_CONFIDENCE = 75;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Em ordem de página (ou de capítulo), como no livro; sem página vão para o fim.
function sorted(quotes, position) {
  return [...quotes].sort(
    (a, b) => position(a) - position(b) || (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

let count = 0;

export function createQuotes(container, {
  getBook,
  save,
  chapters = null,
  photo = true,
  emptyText = "Nenhum trecho guardado ainda. Aquela frase que você sublinhou mora aqui. ✨",
  placeholder = "Copie aqui o trecho que você amou…",
}) {
  const uid = ++count;
  const byChapter = Boolean(chapters);
  // posição para ordenar: página, ou a ordem do capítulo no manuscrito
  const position = (q) => {
    if (!byChapter) return q.page ?? Infinity;
    const i = chapters().findIndex((c) => c.id === q.chapterId);
    return i < 0 ? Infinity : i;
  };
  const chapterTitle = (id) => {
    const list = chapters();
    const i = list.findIndex((c) => c.id === id);
    return i < 0 ? "" : `${i + 1}. ${list[i].title || "Sem título"}`;
  };
  const sourceField = (id) => byChapter
    ? `<label for="${id}">Capítulo</label><select id="${id}" class="quote-capitulo"></select>`
    : `<label for="${id}">Página</label><input id="${id}" type="number" min="1" inputmode="numeric">`;
  container.innerHTML = `
    <p class="quotes-vazio"></p>
    <form class="quote-novo">
      <label for="quote-texto-${uid}">Novo trecho</label>
      <textarea id="quote-texto-${uid}" required></textarea>
      <div class="quote-linha">
        ${sourceField(`quote-pagina-${uid}`)}
        <button class="botao" type="submit">Guardar trecho</button>
        ${photo ? `<button class="botao secundario" type="button" data-acao="fotografar">📷 Fotografar trecho</button>` : ""}
      </div>
      <p class="quote-leitura" aria-live="polite"></p>
    </form>`;

  let editingId = null; // trecho em edição (só um por vez)
  const carousel = createCarousel({
    label: "Trechos favoritos",
    prev: "Trecho anterior",
    next: "Próximo trecho",
    item: "Trecho",
    busy: () => Boolean(editingId),
  });
  container.prepend(carousel.el);
  const form = container.querySelector(".quote-novo");
  const textInput = form.querySelector("textarea");
  const pageInput = form.querySelector("input, select");
  const photoButton = form.querySelector('[data-acao="fotografar"]');
  container.querySelector(".quotes-vazio").textContent = emptyText;
  textInput.placeholder = placeholder;

  // Opções de capítulo (o manuscrito pode ter mudado).
  function fillChapters(select, selected = "") {
    select.replaceChildren(new Option("Sem capítulo", ""), ...chapters().map((c, i) => new Option(`${i + 1}. ${c.title || "Sem título"}`, c.id)));
    select.value = chapters().some((c) => c.id === selected) ? selected : "";
  }
  const readingStatus = form.querySelector(".quote-leitura");

  // Página digitada -> número dentro do livro, ou null se vazia.
  function readPage(value) {
    if (value === "" || byChapter) return null;
    const pages = getBook().pages;
    return Math.max(1, Math.min(Number(value), pages || Infinity));
  }

  // Desenha os trechos. `showId`: vai direto para esse trecho.
  function render({ showId = null } = {}) {
    const quotes = sorted(getBook()?.quotes || [], position);
    container.querySelector(".quotes-vazio").hidden = quotes.length > 0;
    carousel.el.hidden = quotes.length === 0;
    if (byChapter) fillChapters(pageInput, pageInput.value);
    else pageInput.max = getBook()?.pages || "";
    carousel.set(quotes.map((q) => {
      const li = document.createElement("li");
      li.className = "quote-slide";
      li.dataset.id = q.id;
      li.appendChild(q.id === editingId ? editCard(q) : card(q));
      return li;
    }), { showId });
  }

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
    const source = byChapter ? chapterTitle(q.chapterId) : q.page ? `p. ${q.page}` : "";
    li.querySelector(".quote-pagina").textContent = source ? `— ${source}` : "";
    return li;
  }

  function editCard(q) {
    const li = document.createElement("div");
    li.className = "quote editando";
    li.innerHTML = `
      <textarea aria-label="Texto do trecho"></textarea>
      <div class="quote-linha">
        ${byChapter ? `<label>Capítulo <select class="quote-capitulo"></select></label>` : `<label>Página <input type="number" min="1" inputmode="numeric"></label>`}
        <button class="botao" type="button" data-acao="salvar">Salvar</button>
        <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
      </div>`;
    li.querySelector("textarea").value = q.text;
    if (byChapter) fillChapters(li.querySelector("select"), q.chapterId);
    else {
      li.querySelector("input").value = q.page ?? "";
      li.querySelector("input").max = getBook().pages || "";
    }
    return li;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;
    const quote = byChapter
      ? { id: newId(), text, chapterId: pageInput.value || null, createdAt: new Date().toISOString() }
      : { id: newId(), text, page: readPage(pageInput.value), createdAt: new Date().toISOString() };
    await save({ quotes: [...(getBook().quotes || []), quote] });
    textInput.value = "";
    pageInput.value = "";
    readingStatus.textContent = "";
    // Vai até o trecho novo, deslizando, e dá um brilho nele.
    render();
    const slides = carousel.slides();
    const position = slides.findIndex((li) => li.dataset.id === quote.id);
    carousel.goTo(position);
    slides[position]?.querySelector(".quote").classList.add("novo");
  });

  // Foto do trecho: ela recorta o trecho na foto e o site lê o texto.
  photoButton?.addEventListener("click", async () => {
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

  carousel.el.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    const li = event.target.closest(".quote-slide");
    if (!action || !li) return;
    const quotes = getBook().quotes || [];
    const quote = quotes.find((q) => q.id === li.dataset.id);

    if (action === "editar") {
      editingId = quote.id;
      render();
      carousel.el.querySelector(".editando textarea").focus();
    } else if (action === "cancelar") {
      editingId = null;
      render();
    } else if (action === "salvar") {
      const text = li.querySelector("textarea").value.trim();
      if (!text) return;
      const changes = byChapter
        ? { text, chapterId: li.querySelector("select").value || null }
        : { text, page: readPage(li.querySelector("input").value) };
      editingId = null;
      await save({ quotes: quotes.map((q) => (q.id === quote.id ? { ...q, ...changes } : q)) });
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
      carousel.reset();
      textInput.value = "";
      pageInput.value = "";
      readingStatus.textContent = "";
      render();
    },
  };
}
