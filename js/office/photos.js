// Fotos do escritório (personagens): ela escolhe a foto, recorta (editor de
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
