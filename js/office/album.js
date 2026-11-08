// Álbum de fotos (mural): cada foto no formato dela; "+ Adicionar fotos"
// escolhe várias de uma vez (sem recorte); clicar abre o visor (foto grande,
// setas/teclado/arrastar, "Apagar" com confirmação).
// Usado pelo personagem (com "★ Usar como capa") e pelo mundo.
//
// Opções:
//   getPhotos()              → [{ path, w, h }] (null = não mostrar nada)
//   add(list, onProgress)    → grava as fotos novas ({ blob, w, h })
//   remove(path)             → apaga uma foto
//   deleteMessage(path)      → texto da confirmação de apagar
//   cover: { is(path), use(path) }  (opcional: botão "★ Usar como capa")
//   emptyText                → texto quando não há fotos

import * as db from "../data/db.js";
import { confirmDialog, toast } from "../ui/dialogs.js";
import { pickImages, prepareAlbumPhoto } from "./photos.js";

export function createAlbum({ getPhotos, add, remove, deleteMessage, cover = null, emptyText }) {
  const el = document.createElement("div");
  el.className = "album-bloco";
  el.innerHTML = `
    <p class="album-vazio"></p>
    <div class="album"></div>
    <button class="link album-mais" type="button">+ Adicionar fotos</button>
    <p class="ficha-enviando album-enviando" aria-live="polite"></p>`;
  el.querySelector(".album-vazio").textContent = emptyText;
  const grid = el.querySelector(".album");
  const sending = el.querySelector(".album-enviando");
  let token = 0;

  async function render() {
    const photos = getPhotos() || [];
    const mine = ++token;
    el.querySelector(".album-vazio").hidden = photos.length > 0;
    let urls = {};
    try {
      urls = await db.getPhotoUrls(photos.map((p) => p.path));
    } catch (err) {
      console.error(err);
    }
    if (mine !== token) return; // outra pintura mais nova já começou
    // reaproveita as fotos que já estão na tela (não piscam)
    const old = new Map([...grid.children].map((b) => [b.dataset.path, b]));
    grid.replaceChildren(...(getPhotos() || []).map((p, i) => {
      let b = old.get(p.path);
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "album-foto";
        b.dataset.path = p.path;
        b.innerHTML = `<img alt="" loading="lazy"><span class="album-capa" title="É a capa">★</span>`;
        b.querySelector("img").style.aspectRatio = `${p.w} / ${p.h}`;
      }
      const img = b.querySelector("img");
      if (urls[p.path] && !img.src) img.src = urls[p.path];
      b.dataset.i = i;
      b.setAttribute("aria-label", `Abrir a foto ${i + 1} do álbum`);
      b.classList.toggle("e-capa", Boolean(cover?.is(p.path)));
      return b;
    }));
  }

  // Limpa ao trocar de personagem/história (o mural não mostra fotos de outro).
  function reset() {
    token++;
    grid.replaceChildren();
    sending.textContent = "";
  }

  async function addPhotos() {
    const files = await pickImages();
    if (!files.length) return;
    const photos = [];
    for (const file of files) {
      try {
        photos.push(await prepareAlbumPhoto(file));
      } catch (err) {
        toast(err.message);
      }
    }
    if (!photos.length) return;
    sending.textContent = `Enviando… 0 de ${photos.length}`;
    try {
      await add(photos, (done, total) => (sending.textContent = `Enviando… ${done} de ${total}`));
      sending.textContent = "";
    } catch (err) {
      console.error(err);
      sending.textContent = "Algumas fotos não foram enviadas. Confira a internet e tente de novo.";
    }
  }

  // Visor: a foto grande.
  function openViewer(start) {
    let index = start;
    const dialog = document.createElement("dialog");
    dialog.className = "album-visor";
    dialog.innerHTML = `
      <button class="visor-fechar" type="button" data-acao="fechar" aria-label="Fechar">×</button>
      <button class="visor-seta" type="button" data-ir="-1" aria-label="Foto anterior">‹</button>
      <figure class="visor-foto"><img alt=""></figure>
      <button class="visor-seta" type="button" data-ir="1" aria-label="Próxima foto">›</button>
      <div class="visor-rodape">
        <span class="visor-contagem" aria-live="polite"></span>
        ${cover ? `<button class="botao secundario" type="button" data-acao="visor-capa"></button>` : ""}
        <button class="botao perigo" type="button" data-acao="visor-apagar">Apagar</button>
      </div>`;
    document.body.appendChild(dialog);
    const img = dialog.querySelector("img");

    async function show() {
      const photos = getPhotos() || [];
      if (!photos.length) return dialog.close();
      index = (index + photos.length) % photos.length;
      const p = photos[index];
      dialog.querySelector(".visor-contagem").textContent = `${index + 1} de ${photos.length}`;
      dialog.querySelectorAll(".visor-seta").forEach((b) => (b.hidden = photos.length < 2));
      if (cover) {
        const isCover = cover.is(p.path);
        const button = dialog.querySelector('[data-acao="visor-capa"]');
        button.textContent = isCover ? "★ É a capa" : "★ Usar como capa";
        button.disabled = isCover;
      }
      img.dataset.path = p.path;
      img.style.aspectRatio = `${p.w} / ${p.h}`;
      img.removeAttribute("src");
      const urls = await db.getPhotoUrls([p.path]).catch(() => ({}));
      if (img.dataset.path === p.path && urls[p.path]) img.src = urls[p.path];
    }

    dialog.addEventListener("click", async (event) => {
      const step = event.target.closest("[data-ir]")?.dataset.ir;
      const action = event.target.closest("[data-acao]")?.dataset.acao;
      if (step) {
        index += Number(step);
        show();
      } else if (action === "fechar" || event.target === dialog) {
        dialog.close();
      } else if (action === "visor-capa") {
        await Promise.resolve(cover.use(img.dataset.path)).catch((err) => toast(err.message));
        show();
      } else if (action === "visor-apagar") {
        const path = img.dataset.path;
        const ok = await confirmDialog({
          title: "Apagar esta foto do álbum?",
          message: deleteMessage(path),
          confirmText: "Sim, apagar",
          danger: true,
        });
        if (!ok) return;
        await Promise.resolve(remove(path)).catch((err) => toast(err.message));
        show();
      }
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { index -= 1; show(); }
      if (event.key === "ArrowRight") { index += 1; show(); }
    });
    // arrastar para os lados (dedo ou mouse)
    let startX = null;
    img.addEventListener("pointerdown", (e) => (startX = e.clientX));
    img.addEventListener("pointerup", (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) {
        index += dx < 0 ? 1 : -1;
        show();
      }
    });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
    show();
  }

  el.addEventListener("click", (event) => {
    const photo = event.target.closest(".album-foto");
    if (photo) return openViewer(Number(photo.dataset.i));
    if (event.target.closest(".album-mais")) addPhotos();
  });

  return { el, render, reset };
}
