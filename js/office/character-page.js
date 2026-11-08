// Página de um personagem (#/historia/<id>/personagem/<id>): um caderno
// aberto. Esquerda: capa (a foto da polaroid), nome, papel, traits e
// "Sobre". Direita: álbum (várias fotos; clicar abre o visor), quotes
// (carrossel, com o capítulo), playlist e frases das músicas (carrossel).
// Tudo salva na hora (db.updateCharacter).

import * as db from "../data/db.js";
import { createCategoryPicker } from "../ui/category-picker.js";
import { createQuotes } from "../ui/quotes.js";
import { createPlaylist } from "../ui/playlist.js";
import { createCarousel } from "../ui/carousel.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { pickPortrait } from "./photos.js";
import { createAlbum } from "./album.js";

const ROLES = ["Protagonista", "Interesse amoroso", "Antagonista", "Coadjuvante", "Mentor(a)", "Família", "Amigo(a)", "Narrador(a)"];
const STARTER_TRAITS = ["Teimosa", "Leal", "Sonhadora", "Sarcástico", "Tímida", "Corajoso", "Misteriosa", "Gentil", "Orgulhoso", "Impulsiva"];
const ABOUT_DELAY = 800;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function createCharacterPage(root, { onBack, onDeleted }) {
  root.innerHTML = `
    <header class="esc-barra">
      <button class="etiqueta-papel" type="button" data-acao="voltar">← Personagens</button>
    </header>
    <div class="esc-aberto ficha">
      <section class="esc-pag esq" aria-label="Sobre o personagem">
        <div class="ficha-fotos">
          <div class="ficha-polaroid"><span class="polaroid-alfinete" aria-hidden="true"></span><div class="ficha-foto"></div></div>
          <div class="ficha-capa-acoes">
            <button class="link" type="button" data-acao="capa-trocar"></button>
            <button class="link" type="button" data-acao="capa-tirar">Tirar capa</button>
          </div>
          <p class="ficha-enviando" aria-live="polite"></p>
        </div>
        <textarea class="h-titulo ficha-nome" rows="1" maxlength="80" aria-label="Nome do personagem" placeholder="Nome"></textarea>
        <div class="linha-rot">Papel na história</div>
        <input class="ficha-papel" list="ficha-papeis" maxlength="40" placeholder="Protagonista, antagonista…" aria-label="Papel na história">
        <datalist id="ficha-papeis">${ROLES.map((r) => `<option value="${r}">`).join("")}</datalist>
        <div class="linha-rot">Traits</div>
        <div class="ficha-traits"></div>
        <div class="linha-rot">Sobre</div>
        <textarea class="h-sinopse ficha-sobre" rows="3" aria-label="Sobre o personagem" placeholder="Quem é essa pessoa? O que ela quer? Do que tem medo?"></textarea>
        <button class="link perigo h-apagar" type="button" data-acao="apagar-personagem">Apagar personagem</button>
      </section>
      <section class="esc-pag dir ficha-dir">
        <h2 class="aba-titulo">Álbum</h2>
        <div class="ficha-album"></div>
        <h2 class="aba-titulo">Quotes</h2>
        <div class="ficha-quotes"></div>
        <h2 class="aba-titulo">Playlist</h2>
        <div class="ficha-playlist"></div>
        <h2 class="aba-titulo">Frases das músicas</h2>
        <div class="letras"><p class="quotes-vazio letras-vazio">Nenhuma frase ainda. Aquele verso que é a cara dele(a) mora aqui. 🎵</p></div>
        <form class="letra-nova">
          <textarea required rows="2" aria-label="Frase da música" placeholder="Aquele verso que é a cara dele(a)…"></textarea>
          <div class="letra-linha">
            <input name="song" maxlength="80" placeholder="Música" aria-label="Música">
            <input name="artist" maxlength="80" placeholder="Artista" aria-label="Artista">
            <button class="botao" type="submit">Guardar frase</button>
          </div>
        </form>
      </section>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const nameInput = $(".ficha-nome");
  const roleInput = $(".ficha-papel");
  const about = $(".ficha-sobre");
  let storyId = null;
  let characterId = null;
  let aboutTimer = null;
  let editingLyric = null;

  const character = () => db.getCharacter(storyId, characterId);
  const save = (changes) => db.updateCharacter(storyId, characterId, changes).catch((err) => {
    toast(err.message);
    throw err;
  });

  // (os quotes e a playlist só precisam saber que terminou; o aviso de erro já aparece)
  const saveQuietly = (changes) => save(changes).catch(() => {});
  const quotes = createQuotes($(".ficha-quotes"), {
    getBook: character,
    save: saveQuietly,
    chapters: () => db.getChapters(storyId),
    photo: false,
    emptyText: "Nenhuma frase ainda. As falas que mostram quem esse personagem é moram aqui. ✨",
    placeholder: "Uma fala ou trecho da história que é a cara desse personagem…",
  });
  const playlist = createPlaylist($(".ficha-playlist"), {
    getBook: character,
    save: saveQuietly,
    frameTitle: "Playlist do personagem no Spotify",
    removeMessage: "O link do Spotify deste personagem será apagado (a playlist continua existindo no Spotify).",
  });

  function fit(field) {
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  }

  // ---------- Capa ----------

  const initial = () => (character()?.name || "?").trim().charAt(0).toUpperCase();
  const inAlbum = (path) => character().photos.some((p) => p.path === path);

  async function renderCover() {
    const c = character();
    const main = $(".ficha-foto");
    const id = characterId;
    $('[data-acao="capa-trocar"]').textContent = c.cover ? "Trocar capa" : "+ Foto de capa";
    $('[data-acao="capa-tirar"]').hidden = !c.cover;
    if (!c.cover) {
      main.innerHTML = `<span class="polaroid-inicial"></span>`;
      main.firstChild.textContent = initial();
      return;
    }
    if (main.querySelector("img")?.dataset.path === c.cover.path) return;
    const img = document.createElement("img");
    img.alt = `Foto de ${c.name || "personagem"}`;
    img.dataset.path = c.cover.path;
    main.replaceChildren(img);
    try {
      const urls = await db.getPhotoUrls([c.cover.path]);
      if (id === characterId && urls[c.cover.path]) img.src = urls[c.cover.path];
    } catch (err) {
      console.error(err);
    }
  }

  async function changeCover() {
    let photo;
    try {
      photo = await pickPortrait();
    } catch (err) {
      toast(err.message);
      return;
    }
    if (!photo) return;
    const sending = $(".ficha-enviando");
    sending.textContent = "Enviando a foto…";
    try {
      await db.setCharacterCover(storyId, characterId, photo);
      sending.textContent = "";
    } catch (err) {
      console.error(err);
      sending.textContent = "Não consegui enviar a foto. Confira a internet e tente de novo.";
    }
  }

  async function removeCover() {
    // Se a capa também está no álbum, ela continua lá: não precisa perguntar.
    if (!inAlbum(character().cover.path)) {
      const ok = await confirmDialog({
        title: "Tirar a foto de capa?",
        message: "Essa foto não está no álbum, então ela será apagada da nuvem. Isso não pode ser desfeito.",
        confirmText: "Sim, apagar",
        danger: true,
      });
      if (!ok) return;
    }
    db.removeCharacterCover(storyId, characterId).catch((err) => toast(err.message));
  }

  // ---------- Álbum (album.js) ----------

  const album = createAlbum({
    getPhotos: () => character()?.photos || [],
    add: (list, onProgress) => db.addAlbumPhotos(storyId, characterId, list, onProgress),
    remove: (path) => db.removeAlbumPhoto(storyId, characterId, path),
    deleteMessage: (path) => (character().cover?.path === path
      ? "A foto sai do álbum, mas continua como capa."
      : "A foto será apagada da nuvem. Isso não pode ser desfeito."),
    cover: {
      is: (path) => character()?.cover?.path === path,
      use: (path) => db.useAlbumPhotoAsCover(storyId, characterId, path),
    },
    emptyText: "Fotos que lembram esse personagem: rostos, roupas, lugares, cores… ✨",
  });
  $(".ficha-album").appendChild(album.el);

  // ---------- Frases das músicas ----------

  const lyricsCarousel = createCarousel({
    label: "Frases das músicas",
    prev: "Frase anterior",
    next: "Próxima frase",
    item: "Frase",
    busy: () => Boolean(editingLyric),
  });
  $(".letras").prepend(lyricsCarousel.el);

  function lyricCard(l) {
    const card = document.createElement("div");
    card.className = "letra";
    if (l.id === editingLyric) {
      card.classList.add("editando");
      card.innerHTML = `
        <textarea rows="2" aria-label="Frase da música"></textarea>
        <div class="letra-linha">
          <input data-campo="song" maxlength="80" placeholder="Música" aria-label="Música">
          <input data-campo="artist" maxlength="80" placeholder="Artista" aria-label="Artista">
          <button class="botao" type="button" data-acao="salvar-letra">Salvar</button>
          <button class="botao secundario" type="button" data-acao="cancelar-letra">Cancelar</button>
        </div>`;
      card.querySelector("textarea").value = l.text;
      card.querySelector('[data-campo="song"]').value = l.song;
      card.querySelector('[data-campo="artist"]').value = l.artist;
      return card;
    }
    card.innerHTML = `
      <blockquote></blockquote>
      <div class="letra-rodape">
        <span class="letra-musica"></span>
        <span class="letra-acoes">
          <button class="link" type="button" data-acao="editar-letra">editar</button>
          <button class="link" type="button" data-acao="apagar-letra">apagar</button>
        </span>
      </div>`;
    card.querySelector("blockquote").textContent = l.text;
    card.querySelector(".letra-musica").textContent = [l.song, l.artist].filter(Boolean).join(" – ");
    return card;
  }

  // `showId`: vai direto para essa frase (ex.: a que acabou de ser guardada).
  function renderLyrics({ showId = null } = {}) {
    const lyrics = character().lyrics;
    $(".letras-vazio").hidden = lyrics.length > 0;
    lyricsCarousel.el.hidden = lyrics.length === 0;
    lyricsCarousel.set(lyrics.map((l) => {
      const li = document.createElement("li");
      li.className = "quote-slide";
      li.dataset.id = l.id;
      li.appendChild(lyricCard(l));
      return li;
    }), { showId });
  }

  $(".letra-nova").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const text = form.querySelector("textarea").value.trim();
    if (!text) return;
    const lyric = {
      id: newId(), text, createdAt: new Date().toISOString(),
      song: form.elements.song.value.trim(), artist: form.elements.artist.value.trim(),
    };
    try {
      await save({ lyrics: [...character().lyrics, lyric] });
      form.reset();
      renderLyrics({ showId: lyric.id });
    } catch {
      // aviso já mostrado
    }
  });

  $(".letras").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    const li = event.target.closest(".quote-slide");
    if (!action || !li) return;
    const lyrics = character().lyrics;
    const lyric = lyrics.find((l) => l.id === li.dataset.id);
    if (action === "editar-letra") {
      editingLyric = lyric.id;
      renderLyrics();
      $(".letra.editando textarea")?.focus();
    } else if (action === "cancelar-letra") {
      editingLyric = null;
      renderLyrics();
    } else if (action === "salvar-letra") {
      const text = li.querySelector("textarea").value.trim();
      if (!text) return;
      editingLyric = null;
      save({
        lyrics: lyrics.map((l) => (l.id === lyric.id
          ? { ...l, text, song: li.querySelector('[data-campo="song"]').value.trim(), artist: li.querySelector('[data-campo="artist"]').value.trim() }
          : l)),
      }).catch(() => {});
      renderLyrics({ showId: lyric.id });
    } else if (action === "apagar-letra") {
      const preview = lyric.text.length > 80 ? lyric.text.slice(0, 80) + "…" : lyric.text;
      const ok = await confirmDialog({
        title: "Apagar esta frase?",
        message: `"${preview}" será apagada. Isso não pode ser desfeito.`,
        confirmText: "Sim, apagar",
        danger: true,
      });
      if (ok) save({ lyrics: character().lyrics.filter((l) => l.id !== lyric.id) }).catch(() => {});
    }
  });

  // ---------- Mostrar e editar ----------

  function render() {
    const c = character();
    if (!c) return;
    if (document.activeElement !== nameInput) {
      nameInput.value = c.name;
      fit(nameInput);
    }
    if (document.activeElement !== roleInput) roleInput.value = c.role;
    if (document.activeElement !== about && !aboutTimer) {
      about.value = c.about;
      fit(about);
    }
    renderCover();
    album.render();
    if (!editingLyric) renderLyrics();
  }

  function show(sId, cId) {
    const changed = sId !== storyId || cId !== characterId;
    storyId = sId;
    characterId = cId;
    if (!character()) return false;
    if (changed) {
      clearTimeout(aboutTimer);
      aboutTimer = null;
      editingLyric = null;
      root.querySelectorAll(".ficha-enviando").forEach((p) => (p.textContent = ""));
      $(".ficha-foto").replaceChildren();
      album.reset();
      lyricsCarousel.reset();
      createCategoryPicker($(".ficha-traits"), {
        selected: character().traits,
        known: db.getAllTraits(),
        suggestions: STARTER_TRAITS,
        placeholder: "Outro trait e Enter",
        emptyText: "Nenhum trait ainda",
        onChange: (traits) => save({ traits }).catch(() => {}),
      });
      quotes.render();
      playlist.render();
      // os capítulos aparecem no campo dos quotes
      db.loadChapters(sId).then(() => characterId === cId && quotes.render()).catch(() => {});
    }
    render();
    return true;
  }

  nameInput.addEventListener("input", () => fit(nameInput));
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameInput.blur();
    }
    if (e.key === "Escape") {
      nameInput.value = character().name;
      nameInput.blur();
    }
  });
  nameInput.addEventListener("change", () => {
    const name = nameInput.value.trim().replace(/\s+/g, " ");
    if (!name) nameInput.value = character().name;
    else if (name !== character().name) save({ name }).catch(() => {});
  });
  roleInput.addEventListener("change", () => {
    const role = roleInput.value.trim();
    if (role !== character().role) save({ role }).catch(() => {});
  });
  about.addEventListener("input", () => {
    fit(about);
    clearTimeout(aboutTimer);
    const ids = [storyId, characterId];
    aboutTimer = setTimeout(() => {
      aboutTimer = null;
      if (ids[0] === storyId && ids[1] === characterId) save({ about: about.value.trim() }).catch(() => {});
    }, ABOUT_DELAY);
  });
  about.addEventListener("blur", () => {
    clearTimeout(aboutTimer);
    aboutTimer = null;
    if (character() && about.value.trim() !== character().about) save({ about: about.value.trim() }).catch(() => {});
  });

  async function removeCharacter() {
    const c = character();
    const ok = await confirmDialog({
      title: "Apagar este personagem?",
      message: `"${c.name || "Sem nome"}" e tudo dele (capa, álbum, quotes, playlist e frases das músicas) serão apagados. Isso não pode ser desfeito.`,
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteCharacter(storyId, c.id);
      onDeleted(storyId);
    } catch (err) {
      toast(err.message);
    }
  }

  // Cliques da página (os quotes e a playlist cuidam dos próprios botões).
  root.addEventListener("click", (event) => {
    if (event.target.closest(".ficha-quotes, .ficha-playlist, .letras, .letra-nova, .ficha-album")) return;
    const el = event.target.closest("[data-acao]");
    if (!el || !characterId) return;
    const action = el.dataset.acao;
    if (action === "voltar") onBack(storyId);
    else if (action === "capa-trocar") changeCover();
    else if (action === "capa-tirar") removeCover();
    else if (action === "apagar-personagem") removeCharacter();
  });

  db.subscribeStories(() => !root.hidden && characterId && character() && render());

  return {
    show,
    stop: () => playlist.stop(),
    get characterId() { return characterId; },
    book: () => $(".esc-aberto"),
  };
}
