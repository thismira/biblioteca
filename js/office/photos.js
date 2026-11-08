// Fotos do escritório (personagens). Capa: ela escolhe a foto, recorta (editor de
// recorte em formato retrato) e a foto é reduzida antes de ir para a nuvem.

import { pickAndCrop } from "../ui/photo-crop.js";

const MAX_SIDE = 900;   // px no lado maior (~100 KB em JPEG)
const QUALITY = 0.85;

// Devolve { blob, w, h } ou null se ela desistir.
export async function pickPortrait() {
  const canvas = await pickAndCrop({
    title: "Foto do personagem",
    hint: "Ajuste o retângulo em volta da parte da foto que você quer.",
    box: "retrato",
    maxSize: 1800,
  });
  if (!canvas) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(canvas.width, canvas.height));
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; // fundo branco (PNG transparente não vira preto)
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Não consegui preparar essa foto.");
  return { blob, w: out.width, h: out.height };
}

// ---------- Álbum: várias fotos de uma vez, sem recorte ----------

const ALBUM_SIDE = 1400; // px no lado maior (~200 KB): aparecem grandes no visor

// Abre o seletor de arquivos (pode escolher várias). Devolve File[].
export function pickImages() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("cancel", () => resolve([]));
    input.addEventListener("change", () => resolve([...input.files]));
    input.click();
  });
}

// Reduz uma foto para o álbum: { blob, w, h }.
export async function prepareAlbumPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Não consegui abrir "${file.name}".`));
      i.src = url;
    });
    const scale = Math.min(1, ALBUM_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error(`Não consegui preparar "${file.name}".`);
    return { blob, w: canvas.width, h: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
