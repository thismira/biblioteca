// Página de um personagem (#/historia/<id>/personagem/<id>): um caderno
// aberto. Esquerda: fotos, nome, papel, traits e "Sobre". Direita: quotes
// do personagem (carrossel, com o capítulo), playlist e frases das músicas.
// Tudo salva na hora (db.updateCharacter).

import * as db from "../data/db.js";
import { createCategoryPicker } from "../ui/category-picker.js";
import { createQuotes } from "../ui/quotes.js";
import { createPlaylist } from "../ui/playlist.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { pickPortrait } from "./photos.js";

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
          <div class="ficha-miniaturas"></div>
          <button class="link" type="button" data-acao="foto">+ Adicionar foto</button>
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
        <h2 class="aba-titulo">Quotes</h2>
        <div class="ficha-quotes"></div>
        <h2 class="aba-titulo">Playlist</h2>
        <div class="ficha-playlist"></div>
        <h2 class="aba-titulo">Frases das músicas</h2>
        <ul class="letras"></ul>
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

  // ---------- Fotos ----------

  async function renderPhotos() {
    const c = character();
    const main = $(".ficha-foto");
    const thumbs = $(".ficha-miniaturas");
    const paths = c.photos.map((p) => p.path);
    const id = characterId;
    let urls = {};
    try {
      urls = await db.getPhotoUrls(paths);
    } catch (err) {
      console.error(err);
    }
    if (id !== characterId) return; // trocou de personagem enquanto carregava
    if (!paths.length) {
      main.innerHTML = `<span class="polaroid-inicial"></span>`;
      main.firstChild.textContent = (c.name || "?").trim().charAt(0).toUpperCase();
    } else if (main.querySelector("img")?.dataset.path !== paths[0]) {
      const img = document.createElement("img");
      img.alt = `Foto de ${c.name || "personagem"}`;
      img.dataset.path = paths[0];
      if (urls[paths[0]]) img.src = urls[paths[0]];
      main.replaceChildren(img);
    }
    thumbs.replaceChildren(...paths.map((path, i) => {
      const fig = document.createElement("div");
      fig.className = "ficha-mini";
      fig.dataset.path = path;
      fig.innerHTML = `
        <img alt="">
        <span class="ficha-mini-acoes">
          ${i > 0 ? `<button type="button" data-acao="capa" title="Usar na polaroid" aria-label="Usar esta foto na polaroid">★</button>` : ""}
          <button type="button" data-acao="apagar-foto" title="Apagar foto" aria-label="Apagar esta foto">×</button>
        </span>`;
      if (urls[path]) fig.querySelector("img").src = urls[path];
      fig.classList.toggle("capa", i === 0);
      return fig;
    }));
    thumbs.hidden = paths.length < 2;
  }

  async function addPhoto() {
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
      await db.addCharacterPhoto(storyId, characterId, photo);
      sending.textContent = "";
    } catch (err) {
      console.error(err);
      sending.textContent = "Não consegui enviar a foto. Confira a internet e tente de novo.";
    }
  }

  async function removePhoto(path) {
    const ok = await confirmDialog({
      title: "Apagar esta foto?",
      message: "A foto será apagada da nuvem. Isso não pode ser desfeito.",
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    db.removeCharacterPhoto(storyId, characterId, path).catch((err) => toast(err.message));
  }

  function makeCover(path) {
    const photos = character().photos;
    const chosen = photos.find((p) => p.path === path);
    save({ photos: [chosen, ...photos.filter((p) => p !== chosen)] }).catch(() => {});
  }

  // ---------- Frases das músicas ----------

  function renderLyrics() {
    const list = $(".letras");
    const lyrics = character().lyrics;
    list.replaceChildren(...lyrics.map((l) => {
      const li = document.createElement("li");
      li.className = "letra";
      li.dataset.id = l.id;
      if (l.id === editingLyric) {
        li.classList.add("editando");
        li.innerHTML = `
          <textarea rows="2" aria-label="Frase da música"></textarea>
          <div class="letra-linha">
            <input data-campo="song" maxlength="80" placeholder="Música" aria-label="Música">
            <input data-campo="artist" maxlength="80" placeholder="Artista" aria-label="Artista">
            <button class="botao" type="button" data-acao="salvar-letra">Salvar</button>
            <button class="botao secundario" type="button" data-acao="cancelar-letra">Cancelar</button>
          </div>`;
        li.querySelector("textarea").value = l.text;
        li.querySelector('[data-campo="song"]').value = l.song;
        li.querySelector('[data-campo="artist"]').value = l.artist;
        return li;
      }
      li.innerHTML = `
        <blockquote></blockquote>
        <div class="letra-rodape">
          <span class="letra-musica"></span>
          <span class="letra-acoes">
            <button class="link" type="button" data-acao="editar-letra">editar</button>
            <button class="link" type="button" data-acao="apagar-letra">apagar</button>
          </span>
        </div>`;
      li.querySelector("blockquote").textContent = l.text;
      li.querySelector(".letra-musica").textContent = [l.song, l.artist].filter(Boolean).join(" – ");
      return li;
    }));
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
    } catch {
      // aviso já mostrado
    }
  });

  $(".letras").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    const li = event.target.closest(".letra");
    if (!action || !li) return;
    const lyrics = character().lyrics;
    const lyric = lyrics.find((l) => l.id === li.dataset.id);
    if (action === "editar-letra") {
      editingLyric = lyric.id;
      renderLyrics();
      $(".letra.editando textarea").focus();
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
      renderLyrics();
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
    renderPhotos();
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
      $(".ficha-enviando").textContent = "";
      $(".ficha-foto").replaceChildren();
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
      message: `"${c.name || "Sem nome"}" e tudo dele (fotos, quotes, playlist e frases das músicas) serão apagados. Isso não pode ser desfeito.`,
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
    if (event.target.closest(".ficha-quotes, .ficha-playlist, .letras, .letra-nova")) return;
    const el = event.target.closest("[data-acao]");
    if (!el || !characterId) return;
    const action = el.dataset.acao;
    if (action === "voltar") onBack(storyId);
    else if (action === "foto") addPhoto();
    else if (action === "apagar-foto") removePhoto(el.closest("[data-path]").dataset.path);
    else if (action === "capa") makeCover(el.closest("[data-path]").dataset.path);
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
