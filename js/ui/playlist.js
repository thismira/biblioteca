// Playlist do livro: ela cola um link do Spotify e o player aparece
// embutido. Fica dentro da página do livro.

import { parseSpotify, isShortLink } from "../services/spotify.js";
import { confirmDialog } from "./dialogs.js";

export function createPlaylist(container, { getBook, save }) {
  container.innerHTML = `
    <div class="playlist-player"></div>
    <div class="playlist-acoes">
      <button class="link" type="button" data-acao="trocar">trocar link</button>
      <button class="link" type="button" data-acao="remover">remover</button>
    </div>
    <form class="playlist-form">
      <label for="playlist-link">Link do Spotify</label>
      <div class="playlist-linha">
        <input id="playlist-link" type="text" inputmode="url" autocomplete="off" placeholder="https://open.spotify.com/playlist/…">
        <button class="botao" type="submit">Salvar</button>
      </div>
      <p class="playlist-erro" aria-live="polite"></p>
      <p class="dica-playlist">No Spotify: toque em ••• → Compartilhar → Copiar link. Vale playlist, álbum ou música.</p>
    </form>`;

  const player = container.querySelector(".playlist-player");
  const actions = container.querySelector(".playlist-acoes");
  const form = container.querySelector(".playlist-form");
  const input = form.querySelector("input");
  const error = form.querySelector(".playlist-erro");

  function showForm(value = "") {
    form.hidden = false;
    input.value = value;
    error.textContent = "";
  }

  // Só recria o player se o link mudou (recriar faz a música parar).
  function showPlayer(spotify) {
    const frame = player.querySelector("iframe");
    if (frame?.dataset.src === spotify.embedUrl) return;
    player.innerHTML = `<iframe title="Playlist do livro no Spotify" loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    const iframe = player.querySelector("iframe");
    iframe.dataset.src = spotify.embedUrl;
    iframe.height = spotify.height;
    iframe.src = spotify.embedUrl;
  }

  function render() {
    const spotify = parseSpotify(getBook()?.spotifyUrl);
    if (spotify) {
      showPlayer(spotify);
      form.hidden = true;
    } else {
      player.replaceChildren();
      showForm();
    }
    actions.hidden = !spotify;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const spotify = parseSpotify(text);
    if (!spotify) {
      error.textContent = isShortLink(text)
        ? "Esse é um link curto do Spotify, que não dá para abrir daqui. Abra o link, toque em ••• → Compartilhar → Copiar link e cole de novo."
        : "Esse link não parece ser do Spotify. Ele deve começar com https://open.spotify.com/…";
      return;
    }
    await save({ spotifyUrl: spotify.url });
    render();
  });

  actions.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    if (action === "trocar") {
      showForm(getBook().spotifyUrl);
      input.focus();
      input.select();
    } else if (action === "remover") {
      const ok = await confirmDialog({
        title: "Remover a playlist?",
        message: "O link do Spotify deste livro será apagado (a playlist continua existindo no Spotify).",
        confirmText: "Sim, remover",
        danger: true,
      });
      if (!ok) return;
      await save({ spotifyUrl: "" });
      render();
    }
  });

  return {
    render,
    // Desliga o player (ao fechar a página do livro, a música para).
    stop() {
      player.replaceChildren();
    },
  };
}
