// Página do livro: abre por cima da estante com o livro "saindo" da
// prateleira, girando e virando capa. Tudo o que ela muda é salvo na hora.

import * as db from "../data/db.js";
import { LANGUAGES } from "../services/openlibrary.js";
import { createCategoryPicker } from "./category-picker.js";
import { createStar } from "./favorite-star.js";
import { confirmDialog, alertDialog } from "./dialogs.js";
import { pickSpinePhoto } from "./spine-photo.js";
import { spineColor } from "./shelf.js";
import { readableTextColor } from "../utils/color.js";
import { PERSPECTIVE as P, px, lerp, done, reducedMotion, spineFace } from "./fly-book.js";
import { setCoverImage } from "./cover-image.js";
import { createQuotes } from "./quotes.js";
import { createPlaylist } from "./playlist.js";

const STATUSES = [["quero ler", "Quero ler"], ["lendo", "Lendo"], ["lido", "Lido"]];
const HISTORY_SIZE = 6; // quantas atualizações de página aparecem no histórico
const REVIEW_SAVE_DELAY = 600;

let dialog, panel, backdrop, star, bookId, quotes, playlist;
let origin = null;     // a lombada clicada (para a animação de volta)
let findSpine = null;  // acha a lombada de um livro na estante (quando a original sumiu)
let onRequestClose = null;
let busy = false;      // evita abrir/fechar duas vezes durante uma animação
let closeRequested = false; // pediram para fechar enquanto a página abria
let reviewTimer;

const today = () => new Date().toISOString().slice(0, 10);
const book = () => db.getBook(bookId);
const $ = (selector) => dialog.querySelector(selector);

// ---------- Montagem ----------

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "detalhe";
  dialog.setAttribute("aria-label", "Página do livro");
  dialog.innerHTML = `
    <div class="detalhe-fundo"></div>
    <article class="detalhe-painel">
      <button class="detalhe-fechar" type="button" aria-label="Fechar">×</button>
      <div class="detalhe-grade">
        <aside class="detalhe-lado">
          <div class="detalhe-capa"></div>
          <div class="detalhe-capa-acoes">
            <span class="lugar-estrela"></span>
            <div class="alternar" role="radiogroup" aria-label="Formato">
              <button type="button" role="radio" data-formato="fisico">Físico</button>
              <button type="button" role="radio" data-formato="kindle">Kindle</button>
            </div>
          </div>

          <section class="secao lombada-opcoes">
            <h3>Lombada</h3>
            <div class="lombada-linha">
              <div class="lombada-amostra" aria-hidden="true"></div>
              <div class="lombada-botoes">
                <label class="botao secundario escolher-cor">
                  🎨 Escolher cor <input type="color" aria-label="Cor da lombada">
                </label>
                <button class="link" type="button" data-acao="cor-capa">Usar a cor da capa</button>
                <button class="botao secundario" type="button" data-acao="foto">📷 Foto da lombada</button>
                <button class="link" type="button" data-acao="tirar-foto">Remover foto</button>
                <p class="dica-kindle">Livro do Kindle: a lombada usa a cor da capa (ou a que você escolher).</p>
              </div>
            </div>
          </section>
        </aside>

        <div class="detalhe-principal">
          <input class="detalhe-titulo" aria-label="Título" autocomplete="off">
          <input class="detalhe-autor" aria-label="Autor(a)" placeholder="Autor(a)" autocomplete="off">
          <p class="detalhe-meta"></p>

          <div class="alternar status-opcoes" role="radiogroup" aria-label="Status">
            ${STATUSES.map(([v, t]) => `<button type="button" role="radio" data-status="${v}">${t}</button>`).join("")}
          </div>

          <section class="secao progresso">
            <h3>Progresso</h3>
            <div class="barra-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100">
              <span class="barra-preenchida"></span>
            </div>
            <p class="progresso-resumo"></p>
            <p class="progresso-falta"></p>
            <p class="progresso-ultima"></p>
            <form class="progresso-atualizar">
              <label for="det-pagina">Estou na página</label>
              <input id="det-pagina" type="number" min="0" inputmode="numeric">
              <button class="botao" type="submit">Atualizar</button>
            </form>
            <form class="paginas-desconhecidas" hidden>
              <label for="det-total">Quantas páginas tem esse livro?</label>
              <input id="det-total" type="number" min="1" inputmode="numeric">
              <button class="botao secundario" type="submit">Salvar</button>
            </form>
            <div class="progresso-terminou" hidden>
              🎉 Você chegou à última página!
              <button class="botao" type="button" data-acao="marcar-lido">Marcar como lido</button>
            </div>
            <ol class="progresso-historico"></ol>
          </section>

          <section class="secao datas">
            <h3>Datas</h3>
            <div class="linha-campos">
              <div class="campo">
                <label for="det-inicio">Comecei em</label>
                <input id="det-inicio" type="date" data-campo="startDate">
              </div>
              <div class="campo">
                <label for="det-fim">Terminei em</label>
                <input id="det-fim" type="date" data-campo="endDate">
              </div>
            </div>
          </section>

          <section class="secao nota">
            <h3>Nota</h3>
            <div class="nota-estrelas" role="radiogroup" aria-label="Nota de 1 a 5">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-nota="${n}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}
            </div>
          </section>

          <section class="secao resenha">
            <h3>Resenha <small class="salvo" aria-live="polite"></small></h3>
            <textarea placeholder="O que você achou? Personagens, sentimentos, aquela cena…" aria-label="Resenha"></textarea>
          </section>

          <section class="secao trechos">
            <h3>Trechos favoritos</h3>
            <div class="detalhe-quotes"></div>
          </section>

          <section class="secao playlist">
            <h3>Playlist do livro</h3>
            <div class="detalhe-playlist"></div>
          </section>

          <section class="secao">
            <h3>Categorias</h3>
            <div class="detalhe-categorias"></div>
          </section>

          <section class="secao">
            <h3>Estantes</h3>
            <div class="detalhe-estantes"></div>
          </section>

          <footer class="detalhe-rodape">
            <button class="botao perigo" type="button" data-acao="excluir">Excluir livro</button>
          </footer>
        </div>
      </div>
    </article>`;
  document.body.appendChild(dialog);
  panel = $(".detalhe-painel");
  backdrop = $(".detalhe-fundo");

  star = createStar({ onToggle: (active) => save({ favorite: active }) });
  quotes = createQuotes($(".detalhe-quotes"), { getBook: book, save });
  playlist = createPlaylist($(".detalhe-playlist"), { getBook: book, save });
  $(".lugar-estrela").appendChild(star.element);

  // Fechar: botão ×, clique fora do painel ou tecla Esc.
  $(".detalhe-fechar").addEventListener("click", () => onRequestClose?.());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target === backdrop) onRequestClose?.();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    onRequestClose?.();
  });

  // Título e autor: salvam ao sair do campo (título vazio volta ao anterior).
  $(".detalhe-titulo").addEventListener("change", (e) => {
    const title = e.target.value.trim();
    if (title) save({ title });
    else e.target.value = book().title;
  });
  $(".detalhe-autor").addEventListener("change", (e) => save({ author: e.target.value.trim() }));

  $(".status-opcoes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]");
    if (b) setStatus(b.dataset.status);
  });
  $(".detalhe-capa-acoes .alternar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-formato]");
    if (b) save({ format: b.dataset.formato }).then(renderAll);
  });

  $(".progresso-atualizar").addEventListener("submit", updatePage);
  $(".paginas-desconhecidas").addEventListener("submit", (e) => {
    e.preventDefault();
    const pages = Number($("#det-total").value);
    if (pages > 0) save({ pages }).then(renderAll);
  });
  $('[data-acao="marcar-lido"]').addEventListener("click", () => setStatus("lido"));

  dialog.querySelectorAll("[data-campo]").forEach((input) =>
    input.addEventListener("change", () => save({ [input.dataset.campo]: input.value }))
  );

  setupRating();

  $(".resenha textarea").addEventListener("input", (e) => {
    clearTimeout(reviewTimer);
    $(".salvo").textContent = "";
    reviewTimer = setTimeout(async () => {
      await save({ review: e.target.value });
      $(".salvo").textContent = "salvo ✓";
    }, REVIEW_SAVE_DELAY);
  });

  // Lombada: cor à mão, voltar à cor da capa, foto.
  const colorInput = $(".escolher-cor input");
  colorInput.addEventListener("input", () => paintSample(colorInput.value)); // prévia ao vivo
  colorInput.addEventListener("change", () => save({ spineColorCustom: colorInput.value }).then(renderSpineOptions));
  $('[data-acao="cor-capa"]').addEventListener("click", () => save({ spineColorCustom: "" }).then(renderSpineOptions));
  $('[data-acao="foto"]').addEventListener("click", async () => {
    const photo = await pickSpinePhoto();
    if (photo) await save({ spinePhoto: photo.dataUrl, spinePhotoAspect: photo.aspect });
    renderSpineOptions();
  });
  $('[data-acao="tirar-foto"]').addEventListener("click", () =>
    save({ spinePhoto: "", spinePhotoAspect: null }).then(renderSpineOptions)
  );

  $('[data-acao="excluir"]').addEventListener("click", removeBook);
}

// Salva mudanças do livro aberto. Se der errado (ex.: sem espaço), avisa.
async function save(changes) {
  try {
    await db.updateBook(bookId, changes);
  } catch (err) {
    console.error(err);
    await alertDialog({
      title: "Não consegui salvar",
      message: `${err.message} Fotos de lombada ocupam espaço: tente remover alguma, ou faça um backup.`,
    });
  }
}

// ---------- Preencher a página ----------

function renderAll() {
  const b = book();
  if (!b) return;
  renderCover(b);
  star.set(b.favorite);
  dialog.querySelectorAll("[data-formato]").forEach((el) => el.setAttribute("aria-checked", String(b.format === el.dataset.formato)));
  $(".detalhe-titulo").value = b.title;
  $(".detalhe-autor").value = b.author;
  renderMeta(b);
  renderStatus(b);
  renderProgress(b);
  $("#det-inicio").value = b.startDate || "";
  $("#det-fim").value = b.endDate || "";
  renderRating(b.rating);
  $(".resenha textarea").value = b.review || "";
  $(".salvo").textContent = "";
  createCategoryPicker($(".detalhe-categorias"), {
    selected: b.categories,
    known: db.getAllCategories(),
    onChange: (categories) => save({ categories }).then(() => db.ensureCategories(categories)),
  });
  renderShelves(b);
  quotes.render();
  playlist.render();
  renderSpineOptions();
}

// Estantes criadas por ela em que o livro está (etiquetas). Escrever um nome
// novo cria a estante.
function renderShelves(b) {
  const shelves = db.getShelves();
  createCategoryPicker($(".detalhe-estantes"), {
    selected: shelves.filter((s) => s.bookIds.includes(b.id)).map((s) => s.name),
    known: shelves.map((s) => s.name),
    placeholder: "Criar estante e apertar Enter",
    emptyText: "Este livro ainda não está em nenhuma estante sua",
    onChange: async (names) => {
      const ids = [];
      for (const name of names) {
        const existing = db.getShelves().find((s) => s.name.toLowerCase() === name.toLowerCase());
        ids.push(existing ? existing.id : (await db.addShelf(name)).id);
      }
      await db.setBookShelves(b.id, ids);
    },
  });
}

function renderCover(b, { failed = false } = {}) {
  const box = $(".detalhe-capa");
  if (b.coverUrl && !failed) {
    box.innerHTML = `<img alt="Capa de ${escapeHtml(b.title)}">`;
    // Se a capa não vier mesmo depois das novas tentativas, mostra a capa gerada.
    setCoverImage(box.querySelector("img"), b.coverUrl, { onFail: () => renderCover(b, { failed: true }) });
    box.style.removeProperty("--cor");
  } else {
    // Sem capa: um "livro" na cor da lombada com o título.
    const color = spineColor(b);
    box.innerHTML = `<div class="capa-gerada"><strong></strong><span></span></div>`;
    box.querySelector("strong").textContent = b.title;
    box.querySelector("span").textContent = b.author;
    box.style.setProperty("--cor", color);
    box.style.setProperty("--cor-texto", readableTextColor(color));
  }
}

function renderMeta(b) {
  const parts = [];
  if (b.pages) parts.push(`${b.pages} páginas`);
  if (b.edition) {
    const ed = [b.edition.publisher, b.edition.year].filter(Boolean).join(", ");
    if (ed) parts.push(ed);
    if (LANGUAGES[b.edition.lang]) parts.push(LANGUAGES[b.edition.lang]);
  }
  $(".detalhe-meta").textContent = parts.join(" · ");
}

function renderStatus(b) {
  dialog.querySelectorAll("[data-status]").forEach((el) =>
    el.setAttribute("aria-checked", String(el.dataset.status === b.status))
  );
}

// "há 2 dias", "ontem", "hoje"
const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function since(iso) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86400000);
  return relative.format(-days, "day");
}
const shortDate = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

function renderProgress(b) {
  const pages = b.pages;
  const current = b.currentPage || 0;
  const pct = pages ? Math.min(100, Math.round((current / pages) * 100)) : 0;
  const bar = $(".barra-progresso");
  bar.setAttribute("aria-valuenow", String(pct));
  $(".barra-preenchida").style.width = pct + "%";

  $(".paginas-desconhecidas").hidden = Boolean(pages);
  const input = $("#det-pagina");
  input.max = pages || "";
  input.value = "";
  input.placeholder = String(current || "");

  if (!pages) {
    $(".progresso-resumo").textContent = current ? `Você está na página ${current}.` : "Ainda não começou.";
    $(".progresso-falta").textContent = "Informe o total de páginas para ver quanto falta.";
  } else if (b.status === "lido" || current >= pages) {
    $(".progresso-resumo").textContent = `Página ${pages} de ${pages} · 100% lido`;
    $(".progresso-falta").textContent = b.status === "lido" ? "Livro terminado! 📚" : "Nenhuma página faltando.";
  } else if (!current) {
    $(".progresso-resumo").textContent = `0 de ${pages} páginas`;
    $(".progresso-falta").textContent = "Ainda não começou. Quando começar, conte aqui em que página está.";
  } else {
    $(".progresso-resumo").textContent = `Página ${current} de ${pages} · ${pct}% lido`;
    $(".progresso-falta").textContent = `Faltam ${pages - current} páginas (${100 - pct}%) para terminar.`;
  }

  // Quantas páginas ela leu desde a atualização anterior.
  const log = b.progressLog || [];
  const last = log[log.length - 1];
  const previous = log[log.length - 2];
  const lastEl = $(".progresso-ultima");
  if (last && previous && last.page > previous.page) {
    lastEl.textContent = `Na última atualização (${since(last.date)}) você leu ${last.page - previous.page} páginas: da ${previous.page} até a ${last.page}.`;
  } else if (last) {
    lastEl.textContent = `Última atualização ${since(last.date)}: página ${last.page}.`;
  } else {
    lastEl.textContent = "";
  }

  $(".progresso-terminou").hidden = !(pages && current >= pages && b.status !== "lido");

  // Histórico: as atualizações mais recentes primeiro, com o quanto avançou.
  const items = log
    .map((entry, i) => ({ ...entry, delta: i > 0 ? entry.page - log[i - 1].page : null }))
    .slice(-HISTORY_SIZE)
    .reverse();
  $(".progresso-historico").innerHTML = items
    .map((e) => `<li><span>${shortDate(e.date)}</span> página ${e.page}${e.delta > 0 ? ` <em>+${e.delta}</em>` : e.delta === null ? " <em>início</em>" : ""}</li>`)
    .join("");
}

function setupRating() {
  const stars = [...dialog.querySelectorAll("[data-nota]")];
  const container = $(".nota-estrelas");
  stars.forEach((s) => {
    s.addEventListener("mouseenter", () => paintRating(Number(s.dataset.nota)));
    s.addEventListener("click", () => {
      const n = Number(s.dataset.nota);
      const rating = book().rating === n ? 0 : n; // clicar de novo na mesma estrela apaga
      save({ rating }).then(() => renderRating(rating));
    });
  });
  container.addEventListener("mouseleave", () => renderRating(book()?.rating || 0));
}

function paintRating(n) {
  dialog.querySelectorAll("[data-nota]").forEach((s) => s.classList.toggle("acesa", Number(s.dataset.nota) <= n));
}

function renderRating(n) {
  paintRating(n);
  dialog.querySelectorAll("[data-nota]").forEach((s) => s.setAttribute("aria-checked", String(Number(s.dataset.nota) === n)));
}

function paintSample(color) {
  const sample = $(".lombada-amostra");
  sample.style.backgroundColor = color;
}

function renderSpineOptions() {
  const b = book();
  if (!b) return;
  const sample = $(".lombada-amostra");
  const kindle = b.format === "kindle";
  sample.style.backgroundImage = b.spinePhoto && !kindle ? `url("${b.spinePhoto}")` : "";
  paintSample(spineColor(b));
  $(".escolher-cor input").value = spineColor(b).slice(0, 7);
  $('[data-acao="cor-capa"]').hidden = !b.spineColorCustom;
  $('[data-acao="cor-capa"]').textContent = b.coverUrl ? "Usar a cor da capa" : "Usar a cor automática";
  $('[data-acao="foto"]').hidden = kindle;
  $('[data-acao="foto"]').textContent = b.spinePhoto ? "📷 Trocar foto" : "📷 Foto da lombada";
  $('[data-acao="tirar-foto"]').hidden = kindle || !b.spinePhoto;
  $(".dica-kindle").hidden = !kindle;
}

// ---------- Ações ----------

async function setStatus(status) {
  const b = book();
  const changes = { status };
  if (status === "lendo" && !b.startDate) changes.startDate = today();
  if (status === "lido") {
    if (!b.endDate) changes.endDate = today();
    if (!b.startDate) changes.startDate = today();
    if (b.pages && (b.currentPage || 0) < b.pages) {
      changes.currentPage = b.pages;
      changes.progressLog = [...(b.progressLog || []), { date: new Date().toISOString(), page: b.pages }];
    }
  }
  await save(changes);
  renderAll();
}

async function updatePage(event) {
  event.preventDefault();
  const b = book();
  const input = $("#det-pagina");
  if (input.value === "") return;
  const page = Math.max(0, Math.min(Number(input.value), b.pages || Infinity));
  const changes = {
    currentPage: page,
    progressLog: [...(b.progressLog || []), { date: new Date().toISOString(), page }],
  };
  // Atualizar a página de um livro "quero ler" significa que ela começou.
  if (b.status === "quero ler" && page > 0) {
    changes.status = "lendo";
    if (!b.startDate) changes.startDate = today();
  }
  await save(changes);
  renderStatus(book());
  renderProgress(book());
  if (changes.startDate) $("#det-inicio").value = changes.startDate;
}

async function removeBook() {
  const b = book();
  const ok = await confirmDialog({
    title: "Excluir este livro?",
    message: `"${b.title}" e tudo o que você guardou sobre ele (progresso, datas, nota, resenha, trechos e playlist) serão apagados. Isso não pode ser desfeito.`,
    confirmText: "Sim, excluir",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!ok) return;
  origin = null; // a lombada vai sumir: fecha sem voltar para a estante
  await db.deleteBook(b.id);
  onRequestClose?.();
}

// ---------- Animação ----------
// O livro sai da prateleira, gira (a lombada fica de perfil) e do outro lado
// aparece a capa, que pousa no lugar dela. Para fechar, o caminho inverso.

const LIFT = 26;

function visibleRect(el) {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.bottom > 0 && r.top < window.innerHeight ? r : null;
}

function makeFlier(rect, content) {
  const flier = document.createElement("div");
  flier.className = "livro-voando";
  Object.assign(flier.style, px(rect));
  flier.appendChild(content);
  dialog.appendChild(flier);
  return flier;
}

function coverFace() {
  const face = $(".detalhe-capa").cloneNode(true);
  face.classList.add("face");
  face.style.visibility = "visible";
  return face;
}

async function flyOpen(spine) {
  const from = spine.getBoundingClientRect();
  const coverBox = $(".detalhe-capa");
  const to = coverBox.getBoundingClientRect();
  const lifted = { left: from.left, top: from.top - LIFT, width: from.width, height: from.height };
  const mid = lerp(lifted, to, 0.45);

  const face = spineFace(spine);
  const flier = makeFlier(from, face);
  spine.style.visibility = "hidden";
  coverBox.style.visibility = "hidden";

  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
  panel.animate(
    [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
    { duration: 420, delay: 200, easing: "ease-out", fill: "backwards" }
  );

  // 1. sai da prateleira
  await done(flier.animate(
    [{ transform: `${P} translateY(0)` }, { transform: `${P} translateY(-${LIFT}px) scale(1.05)` }],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  ));
  // 2. voa girando até ficar de perfil
  await done(flier.animate(
    [{ ...px(lifted), transform: `${P} scale(1.05) rotateY(0deg)` }, { ...px(mid), transform: `${P} rotateY(90deg)` }],
    { duration: 230, easing: "ease-in", fill: "forwards" }
  ));
  // 3. do outro lado aparece a capa, que pousa no lugar
  face.replaceWith(coverFace());
  await done(flier.animate(
    [{ ...px(mid), transform: `${P} rotateY(-90deg)` }, { ...px(to), transform: `${P} rotateY(0deg)` }],
    { duration: 330, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" }
  ));

  coverBox.style.visibility = "";
  flier.remove();
}

async function flyClose(spine) {
  const coverBox = $(".detalhe-capa");
  const from = coverBox.getBoundingClientRect();
  const target = spine.getBoundingClientRect();
  const lifted = { left: target.left, top: target.top - LIFT, width: target.width, height: target.height };
  const mid = lerp(from, lifted, 0.55);

  const flier = makeFlier(from, coverFace());
  coverBox.style.visibility = "hidden";
  spine.style.visibility = "hidden";

  panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: "ease-in", fill: "forwards" });
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "ease-in", fill: "forwards" });

  await done(flier.animate(
    [{ ...px(from), transform: `${P} rotateY(0deg)` }, { ...px(mid), transform: `${P} rotateY(90deg)` }],
    { duration: 260, easing: "ease-in", fill: "forwards" }
  ));
  flier.firstElementChild.replaceWith(spineFace(spine));
  await done(flier.animate(
    [{ ...px(mid), transform: `${P} rotateY(-90deg)` }, { ...px(lifted), transform: `${P} scale(1.05) rotateY(0deg)` }],
    { duration: 260, easing: "ease-out", fill: "forwards" }
  ));
  // encaixa de volta na prateleira
  await done(flier.animate(
    [{ ...px(lifted), transform: `${P} scale(1.05)` }, { ...px(target), transform: `${P} scale(1)` }],
    { duration: 200, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" }
  ));

  spine.style.visibility = "";
  flier.remove();
}

function fade(direction) {
  const frames = [{ opacity: 0 }, { opacity: 1 }];
  if (direction === "out") frames.reverse();
  const options = { duration: reducedMotion() ? 1 : 250, easing: "ease-out", fill: "forwards" };
  return Promise.all([done(backdrop.animate(frames, options)), done(panel.animate(frames, options))]);
}

// ---------- Abrir e fechar ----------

export function isBookDetailOpen() {
  return Boolean(dialog?.open);
}

export async function openBookDetail(id, { spine = null, find = null, requestClose } = {}) {
  if (!db.getBook(id) || busy) return false;
  if (!dialog) build();
  busy = true;
  bookId = id;
  origin = spine;
  findSpine = find;
  onRequestClose = requestClose;

  renderAll();
  dialog.showModal();
  dialog.scrollTop = 0;
  panel.getAnimations().forEach((a) => a.cancel());
  backdrop.getAnimations().forEach((a) => a.cancel());

  try {
    if (visibleRect(spine) && !reducedMotion()) await flyOpen(spine);
    else await fade("in");
  } finally {
    busy = false;
  }
  // Pediram para fechar no meio da abertura: fecha agora.
  if (closeRequested) {
    closeRequested = false;
    closeBookDetail();
  }
  return true;
}

export async function closeBookDetail() {
  if (!dialog?.open) return;
  if (busy) {
    closeRequested = true; // ainda abrindo: fecha assim que terminar
    return;
  }
  busy = true;
  clearTimeout(reviewTimer);
  // Se a lombada original sumiu (ex.: saiu dos favoritos), usa a da estante.
  const spine = origin?.isConnected ? origin : findSpine?.(bookId) || null;
  try {
    if (visibleRect(spine) && !reducedMotion()) await flyClose(spine);
    else await fade("out");
  } finally {
    if (origin) origin.style.visibility = "";
    if (spine) spine.style.visibility = "";
    playlist.stop(); // a música não continua tocando escondida
    dialog.close();
    origin = null;
    bookId = null;
    busy = false;
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
