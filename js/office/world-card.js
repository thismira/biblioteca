// Janela de uma ficha do mundo: título, imagem opcional e texto (negrito,
// itálico, listas; colar passa pela limpeza de sanitize.js). Salva
// sozinha 800 ms depois que ela para de digitar e ao fechar. Ficha nova que
// ficar totalmente vazia é apagada ao fechar (não sobra ficha em branco).

import * as db from "../data/db.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { sanitizeHtml, sanitizeElement, textToHtml } from "./sanitize.js";
import { pickImages, prepareAlbumPhoto } from "./photos.js";

const SAVE_DELAY = 800;

export function openWorldCard(storyId, sectionId, cardId, { isNew = false } = {}) {
  const card = () => db.getWorldCard(storyId, sectionId, cardId);
  const section = db.getStory(storyId).world.find((s) => s.id === sectionId);
  if (!card()) return;

  const dialog = document.createElement("dialog");
  dialog.className = "janela-ficha";
  dialog.innerHTML = `
    <div class="janela">
      <div class="fm-topo">
        <span class="fm-secao"></span>
        <button class="fm-fechar" type="button" data-acao="fechar" aria-label="Fechar">×</button>
      </div>
      <input class="fm-titulo" maxlength="100" aria-label="Título da ficha" placeholder="Nome (ex.: Taverna do Corvo)">
      <div class="fm-imagem"></div>
      <div class="fm-ferramentas" role="toolbar" aria-label="Formatação">
        <button type="button" data-cmd="bold" aria-label="Negrito" title="Negrito (⌘B)"><b>N</b></button>
        <button type="button" data-cmd="italic" aria-label="Itálico" title="Itálico (⌘I)"><i>I</i></button>
        <button type="button" data-cmd="insertUnorderedList" aria-label="Lista" title="Lista">•</button>
      </div>
      <div class="fm-texto" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto da ficha"
        spellcheck="true" lang="pt-BR" data-placeholder="Descreva: como é, quem vive aqui, o que acontece, segredos…"></div>
      <div class="acoes">
        <button class="link perigo" type="button" data-acao="apagar-ficha">Apagar ficha</button>
        <span class="fm-status" aria-live="polite"></span>
        <button class="botao" type="button" data-acao="fechar">Pronto</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  const $ = (sel) => dialog.querySelector(sel);
  const title = $(".fm-titulo");
  const text = $(".fm-texto");
  const status = $(".fm-status");
  $(".fm-secao").textContent = section?.name || "";
  title.value = card().title;
  text.innerHTML = sanitizeHtml(card().html) || "<p><br></p>";
  let timer = null;
  let dirty = false;
  let deleted = false;

  const markEmpty = () => text.classList.toggle("folha-vazia", !text.textContent.trim());
  markEmpty();

  // ---------- Salvar ----------

  async function save() {
    clearTimeout(timer);
    if (!dirty || deleted || !card()) return;
    dirty = false;
    status.textContent = "Salvando…";
    try {
      await db.updateWorldCard(storyId, sectionId, cardId, { title: title.value.trim(), html: sanitizeElement(text) });
      status.textContent = "Salvo";
    } catch (err) {
      dirty = true;
      status.textContent = "Não salvou — tente de novo";
      toast(err.message);
    }
  }
  const changed = () => {
    dirty = true;
    status.textContent = "";
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  };
  title.addEventListener("input", changed);
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      text.focus();
    }
  });
  text.addEventListener("input", () => {
    if (!text.firstElementChild) text.innerHTML = "<p><br></p>";
    markEmpty();
    changed();
  });
  text.addEventListener("paste", (event) => {
    event.preventDefault();
    const data = event.clipboardData;
    let clean = data.getData("text/html") ? sanitizeHtml(data.getData("text/html")) : textToHtml(data.getData("text/plain"));
    const single = clean.match(/^<p>(.*)<\/p>$/s);
    if (single && !single[1].includes("<p>")) clean = single[1];
    if (clean) document.execCommand("insertHTML", false, clean);
  });

  // Barra: apertar não tira o cursor do texto.
  $(".fm-ferramentas").addEventListener("pointerdown", (e) => e.target.closest("button") && e.preventDefault());
  $(".fm-ferramentas").addEventListener("click", (e) => {
    const cmd = e.target.closest("[data-cmd]")?.dataset.cmd;
    if (!cmd) return;
    if (!text.contains(getSelection().anchorNode)) text.focus();
    document.execCommand(cmd);
  });

  // ---------- Imagem ----------

  async function renderImage() {
    const box = $(".fm-imagem");
    const image = card()?.image;
    if (!image) {
      box.innerHTML = `<button class="link" type="button" data-acao="imagem">+ Imagem (mapa, retrato, inspiração…)</button>`;
      return;
    }
    box.innerHTML = `
      <img alt="">
      <span class="fm-imagem-acoes">
        <button class="link" type="button" data-acao="imagem">trocar imagem</button>
        <button class="link" type="button" data-acao="tirar-imagem">tirar imagem</button>
      </span>`;
    const img = box.querySelector("img");
    img.style.aspectRatio = `${image.w} / ${image.h}`;
    const urls = await db.getPhotoUrls([image.path]).catch(() => ({}));
    if (urls[image.path]) img.src = urls[image.path];
  }

  async function chooseImage() {
    const [file] = await pickImages();
    if (!file) return;
    status.textContent = "Enviando a imagem…";
    try {
      await db.setWorldCardImage(storyId, sectionId, cardId, await prepareAlbumPhoto(file));
      status.textContent = "Salvo";
      renderImage();
    } catch (err) {
      console.error(err);
      status.textContent = "A imagem não foi enviada";
      toast(err.message);
    }
  }

  async function removeImage() {
    const ok = await confirmDialog({
      title: "Tirar a imagem?",
      message: "A imagem desta ficha será apagada da nuvem. Isso não pode ser desfeito.",
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    await db.removeWorldCardImage(storyId, sectionId, cardId).catch((err) => toast(err.message));
    renderImage();
  }

  // ---------- Fechar e apagar ----------

  async function removeCard() {
    const ok = await confirmDialog({
      title: "Apagar esta ficha?",
      message: `"${title.value.trim() || "Sem título"}" será apagada${card()?.image ? ", com a imagem" : ""}. Isso não pode ser desfeito.`,
      confirmText: "Sim, apagar",
      danger: true,
    });
    if (!ok) return;
    deleted = true;
    clearTimeout(timer);
    await db.deleteWorldCard(storyId, sectionId, cardId).catch((err) => toast(err.message));
    dialog.close();
  }

  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    if (action === "fechar") dialog.close();
    else if (action === "imagem") chooseImage();
    else if (action === "tirar-imagem") removeImage();
    else if (action === "apagar-ficha") removeCard();
  });

  dialog.addEventListener("close", async () => {
    dialog.remove();
    if (deleted) return;
    // Ficha nova que ficou em branco: some (não é dado dela).
    const empty = !title.value.trim() && !text.textContent.trim() && !card()?.image;
    if (isNew && empty) {
      clearTimeout(timer);
      db.deleteWorldCard(storyId, sectionId, cardId).catch(() => {});
      return;
    }
    await save();
  });

  renderImage();
  dialog.showModal();
  (isNew ? title : text).focus();
}
