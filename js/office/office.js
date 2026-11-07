// O escritório (M’s Workspace): a sala onde ela guarda e escreve as próprias
// histórias. Fica numa tela só dele — a biblioteca some e a mesa aparece.
//
// Endereços: #/escritorio (a mesa). Os próximos (#/historia/…) também
// passam por aqui. O roteador de main.js só pergunta `isOfficeHash()` e
// chama `enterOffice()` / `leaveOffice()`.

import { done, reducedMotion } from "../ui/fly-book.js";
import { toast } from "../ui/dialogs.js";

const root = document.getElementById("escritorio");
// O que pertence à biblioteca (some enquanto o escritório está aberto).
const library = [document.querySelector(".topo"), document.getElementById("app")];

let open = false;
let enteredByClick = false; // veio pelo botão? então "← Biblioteca" = voltar
let libraryScroll = 0;      // a biblioteca volta para onde estava

export const isOfficeHash = (hash) => /^#\/(escritorio|historia)(\/|$)/.test(hash);
export const isOfficeOpen = () => open;

// Botão "Go to workspace".
export function goToOffice() {
  enteredByClick = true;
  location.hash = "#/escritorio";
}

function backToLibrary() {
  if (enteredByClick) history.back();
  else location.hash = "#/";
}

// ---------- Transição: a sala desliza para o lado e a outra entra ----------
// dir = 1 (indo para o escritório, à direita) ou -1 (voltando).
// `onSwap` roda no instante da troca (ex.: acertar a rolagem da página).
async function slide(fromEls, toEls, dir, onSwap) {
  const quick = reducedMotion();
  if (!quick) {
    await Promise.all(fromEls.map((el) => done(el.animate(
      [{ transform: "none", opacity: 1 }, { transform: `translateX(${-dir * 6}%)`, opacity: 0 }],
      { duration: 260, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
    ))));
  }
  fromEls.forEach((el) => {
    el.hidden = true;
    el.getAnimations().forEach((a) => a.cancel());
  });
  toEls.forEach((el) => (el.hidden = false));
  onSwap?.();
  if (quick) return;
  await Promise.all(toEls.map((el) => done(el.animate(
    [{ transform: `translateX(${dir * 6}%)`, opacity: 0 }, { transform: "none", opacity: 1 }],
    { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
  ))));
}

export async function enterOffice() {
  if (open) return;
  open = true;
  libraryScroll = window.scrollY;
  renderDesk();
  await slide(library, [root], 1, () => {
    document.body.classList.add("no-escritorio");
    window.scrollTo(0, 0);
  });
}

export async function leaveOffice() {
  if (!open) return;
  open = false;
  enteredByClick = false;
  await slide([root], library, -1, () => {
    document.body.classList.remove("no-escritorio");
    window.scrollTo(0, libraryScroll);
  });
}

// ---------- A mesa ----------

const DESK = `
  <div class="esc-luz" aria-hidden="true"></div>
  <div class="esc-caixilho" aria-hidden="true"></div>
  <header class="esc-barra">
    <button class="etiqueta-papel" type="button" data-acao="biblioteca">← Biblioteca</button>
    <div class="esc-titulo"><span class="washi" aria-hidden="true"></span><h1>M’s Workspace</h1><small>onde as histórias nascem</small></div>
    <button class="etiqueta-papel dir" type="button" data-acao="importar">Trazer do Google Docs</button>
  </header>
  <div class="esc-cadernos"></div>
  <div class="esc-obj esc-xicara" aria-hidden="true"><span class="pires"></span><span class="asa"></span><span class="boca"></span><span class="cafe"></span><span class="coracao"></span></div>
  <div class="esc-obj esc-caneta" aria-hidden="true"><span class="corpo"></span><span class="clip"></span><span class="anel"></span><span class="bico"></span></div>
  <div class="esc-obj esc-oculos" aria-hidden="true"><i></i><i></i><b></b></div>
  <div class="esc-obj esc-clipe" style="left:210px;bottom:60px;--r:24deg" aria-hidden="true"></div>
  <div class="esc-obj esc-clipe" style="left:240px;bottom:46px;--r:-12deg" aria-hidden="true"></div>`;

function renderDesk() {
  if (!root.firstElementChild) root.innerHTML = DESK;
  const desk = root.querySelector(".esc-cadernos");
  desk.innerHTML = `
    <button class="caderno caderno-novo" type="button" data-acao="nova" style="--r:4deg">
      <span class="caderno-folhas"></span><span class="caderno-capa"></span>
      <span class="caderno-mais"><span>+</span>Nova história</span>
    </button>`;
  // Mesa vazia: um bilhete de boas-vindas embaixo do caderno em branco.
  if (!root.querySelector(".esc-bilhete")) {
    desk.insertAdjacentHTML("afterend", `
      <p class="esc-bilhete"><span class="washi" aria-hidden="true"></span>Sua mesa está pronta ✨ Comece uma história nova ou traga as suas do Google Docs.</p>`);
  }
}

root.addEventListener("click", (event) => {
  const action = event.target.closest("[data-acao]")?.dataset.acao;
  if (action === "biblioteca") backToLibrary();
  else if (action === "nova" || action === "importar") toast("Isso chega na próxima etapa ✨");
});
