// Lista de desejos: um cartão por livro, com capa, link de busca na Amazon UK,
// preço visto + data e o botão "Comprei!" para mover para a estante.
//
// Os cartões são reaproveitados entre um desenho e outro (como as lombadas):
// assim, ao digitar o preço, o campo não perde o foco quando a tela atualiza.

import { amazonUrl } from "../services/amazon.js";
import { LANGUAGES } from "../services/openlibrary.js";
import { setCoverImage } from "./cover-image.js";
import { spineColor } from "./shelf.js";
import { readableTextColor } from "../utils/color.js";

const today = () => new Date().toISOString().slice(0, 10);

export function createWishlist(container, { onOpen, onBought, onRemove, save }) {
  const elements = new Map(); // id do livro -> cartão
  const covers = new Map();   // id do livro -> botão da capa (para animações)

  function paintCover(button, book) {
    const key = `${book.coverUrl}|${spineColor(book)}|${book.title}`;
    if (button.dataset.chave === key) return; // nada mudou: não recarrega a imagem
    button.dataset.chave = key;
    const generated = () => {
      const color = spineColor(book);
      button.style.setProperty("--cor", color);
      button.style.setProperty("--cor-texto", readableTextColor(color));
      button.innerHTML = `<span class="capa-gerada"><strong></strong></span>`;
      button.querySelector("strong").textContent = book.title;
    };
    if (book.coverUrl) {
      button.innerHTML = `<img alt="">`;
      setCoverImage(button.querySelector("img"), book.coverUrl, { onFail: generated });
    } else {
      generated();
    }
  }

  function createCard(book) {
    const card = document.createElement("article");
    card.className = "desejo";
    card.dataset.id = book.id;
    card.innerHTML = `
      <button class="desejo-capa" type="button"></button>
      <div class="desejo-info">
        <h3></h3>
        <p class="desejo-autor"></p>
        <p class="desejo-edicao"></p>
        <a class="botao secundario desejo-amazon" target="_blank" rel="noopener noreferrer">Ver na Amazon UK ↗</a>
        <div class="desejo-preco">
          <label>Preço que vi
            <span class="desejo-moeda"><span>£</span><input type="text" inputmode="decimal" placeholder="0.00" data-campo="wishPrice" autocomplete="off"></span>
          </label>
          <label>em <input type="date" data-campo="wishPriceDate"></label>
        </div>
        <div class="desejo-acoes">
          <button class="botao" type="button" data-acao="comprei">📚 Comprei! Mover para a estante</button>
          <button class="link" type="button" data-acao="remover">remover</button>
        </div>
      </div>`;
    const cover = card.querySelector(".desejo-capa");
    cover.addEventListener("click", () => onOpen(card.dataset.id, cover));
    covers.set(book.id, cover);

    // Preço e data salvam sozinhos; escrever um preço preenche a data com hoje.
    const price = card.querySelector('[data-campo="wishPrice"]');
    const date = card.querySelector('[data-campo="wishPriceDate"]');
    price.addEventListener("change", () => {
      const changes = { wishPrice: price.value.trim() };
      if (changes.wishPrice && !date.value) {
        date.value = today();
        changes.wishPriceDate = date.value;
      }
      save(card.dataset.id, changes);
    });
    date.addEventListener("change", () => save(card.dataset.id, { wishPriceDate: date.value }));

    card.querySelector('[data-acao="comprei"]').addEventListener("click", () => onBought(card.dataset.id, cover));
    card.querySelector('[data-acao="remover"]').addEventListener("click", () => onRemove(card.dataset.id));
    return card;
  }

  function updateCard(card, book) {
    paintCover(card.querySelector(".desejo-capa"), book);
    card.querySelector(".desejo-capa").setAttribute("aria-label", `Abrir ${book.title}`);
    card.querySelector("h3").textContent = book.title;
    card.querySelector(".desejo-autor").textContent = book.author;
    const ed = book.edition;
    const edition = [
      ed && [ed.publisher, ed.year].filter(Boolean).join(", "),
      ed && LANGUAGES[ed.lang],
      book.pages && `${book.pages} páginas`,
    ].filter(Boolean).join(" · ");
    card.querySelector(".desejo-edicao").textContent = edition;
    card.querySelector(".desejo-amazon").href = amazonUrl(book);
    card.querySelector(".desejo-amazon").title = "Buscar por título e autor na amazon.co.uk";
    // Não sobrescreve um campo que ela está editando.
    for (const input of card.querySelectorAll("[data-campo]")) {
      if (document.activeElement !== input) input.value = book[input.dataset.campo] || "";
    }
  }

  return {
    render(books) {
      const ids = new Set(books.map((b) => b.id));
      for (const [id, card] of elements) {
        if (!ids.has(id)) {
          card.remove();
          elements.delete(id);
          covers.delete(id);
        }
      }
      const cards = books.map((book) => {
        let card = elements.get(book.id);
        if (!card) {
          card = createCard(book);
          elements.set(book.id, card);
        }
        updateCard(card, book);
        return card;
      });
      // Só recoloca os cartões se a ordem mudou (recolocar tira o foco do campo).
      const same = container.children.length === cards.length && cards.every((c, i) => container.children[i] === c);
      if (!same) container.replaceChildren(...cards);
    },
    elements,
    covers,
  };
}
