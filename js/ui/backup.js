// Janela "Backup": exportar tudo num .json, importar um backup e importar
// livros do Goodreads (página salva ou planilha .csv).
//
// Substituir a biblioteca sempre pede confirmação e, antes, baixa sozinho um
// backup do que existe hoje (para dar para voltar atrás).

import * as db from "../data/db.js";
import { confirmDialog, alertDialog } from "./dialogs.js";
import { readGoodreadsFiles } from "../services/goodreads.js";
import { findBook, coverUrl, suggestCategories } from "../services/openlibrary.js";

const LOOKUPS_AT_ONCE = 4; // buscas simultâneas na Open Library (para não sobrecarregar)

let dialog, mainEl, goodreadsEl, progressEl;
let pending = null;  // livros lidos do Goodreads, esperando a escolha
let working = false; // importação em andamento (a janela não fecha)

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Data local (não UTC): à noite o toISOString() já daria o dia seguinte.
const today = () => new Date().toLocaleDateString("sv-SE"); // "2026-10-30"
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "data desconhecida");

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "janela-backup";
  dialog.innerHTML = `
    <div class="janela">
      <section class="backup-inicio">
        <h2>Backup</h2>
        <div class="backup-opcao">
          <div>
            <h3>Guardar uma cópia</h3>
            <p>Baixa um arquivo com tudo: livros, notas, resenhas, trechos, playlists, estantes e lista de desejos.</p>
          </div>
          <button class="botao" type="button" data-acao="exportar">⬇ Exportar backup</button>
        </div>
        <div class="backup-opcao">
          <div>
            <h3>Restaurar uma cópia</h3>
            <p>Abre um arquivo de backup e substitui a biblioteca atual (pergunta antes).</p>
          </div>
          <button class="botao secundario" type="button" data-acao="importar">⬆ Importar backup</button>
        </div>
        <div class="backup-opcao">
          <div>
            <h3>Trazer do Goodreads</h3>
            <p>Escolha a planilha exportada (<code>.csv</code>) ou as páginas da lista de livros salvas pelo navegador (pode escolher várias).</p>
          </div>
          <button class="botao secundario" type="button" data-acao="goodreads">📚 Importar do Goodreads</button>
        </div>
        <p class="backup-dica">Dica: guarde um backup de vez em quando — os livros ficam salvos só neste navegador.</p>
        <div class="acoes"><button class="botao secundario" type="button" data-acao="fechar">Fechar</button></div>
      </section>

      <section class="backup-goodreads" hidden>
        <h2>Livros do Goodreads</h2>
        <p class="backup-resumo"></p>
        <ul class="backup-numeros"></ul>
        <p class="backup-aviso"></p>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="voltar">Voltar</button>
          <button class="botao secundario" type="button" data-acao="juntar">Juntar com a atual</button>
          <button class="botao perigo" type="button" data-acao="substituir">Substituir minha biblioteca</button>
        </div>
      </section>

      <section class="backup-progresso" hidden>
        <h2>Importando…</h2>
        <p class="backup-etapa">Buscando capas na Open Library…</p>
        <div class="backup-barra"><span></span></div>
        <p class="backup-contagem"></p>
      </section>
    </div>`;
  document.body.appendChild(dialog);
  mainEl = dialog.querySelector(".backup-inicio");
  goodreadsEl = dialog.querySelector(".backup-goodreads");
  progressEl = dialog.querySelector(".backup-progresso");

  const on = (action, fn) => dialog.querySelectorAll(`[data-acao="${action}"]`).forEach((b) => b.addEventListener("click", fn));
  on("fechar", () => dialog.close());
  on("exportar", () => downloadBackup());
  on("importar", () => pickFiles(".json,application/json", false).then((files) => files[0] && importBackup(files[0])));
  on("goodreads", () => pickFiles(".csv,.html,.htm,text/csv,text/html", true).then((files) => files.length && readGoodreads(files)));
  on("voltar", () => show(mainEl));
  on("juntar", () => importGoodreads("juntar"));
  on("substituir", () => importGoodreads("substituir"));
  // Durante a importação a janela não fecha (Esc).
  dialog.addEventListener("cancel", (event) => working && event.preventDefault());
}

function show(section) {
  [mainEl, goodreadsEl, progressEl].forEach((el) => (el.hidden = el !== section));
}

export function openBackup() {
  if (!dialog) build();
  pending = null;
  show(mainEl);
  dialog.showModal();
}

function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...input.files]));
    input.click();
  });
}

// ---------- Exportar ----------

async function downloadBackup(suffix = "") {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-biblioteca-${today()}${suffix}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Antes de substituir: cópia automática do que existe hoje (se houver algo).
async function safetyBackup() {
  if (db.getBooks().length) await downloadBackup("-antes-de-substituir");
}

// ---------- Importar backup ----------

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return alertDialog({ title: "Arquivo inválido", message: "Esse arquivo não é um backup da biblioteca (não consegui ler o conteúdo)." });
  }
  if (data?.app !== "minha-biblioteca" || !Array.isArray(data.books)) {
    return alertDialog({ title: "Arquivo inválido", message: "Esse arquivo não parece um backup desta biblioteca. Use um arquivo baixado em \"Exportar backup\"." });
  }
  const shelves = data.settings?.shelves?.length || 0;
  const ok = await confirmDialog({
    title: "Substituir sua biblioteca?",
    message:
      `O backup tem ${plural(data.books.length, "livro", "livros")}` +
      `${shelves ? ` e ${plural(shelves, "estante", "estantes")}` : ""}, salvo em ${formatDate(data.exportedAt)}. ` +
      `Hoje você tem ${plural(db.getBooks().length, "livro", "livros")}, que serão trocados por ele. ` +
      "Antes, vou baixar uma cópia da biblioteca atual, por segurança.",
    confirmText: "Substituir",
    danger: true,
  });
  if (!ok) return;
  try {
    await safetyBackup();
    await db.importAll(data);
  } catch (err) {
    console.error(err);
    return alertDialog({ title: "Não deu certo", message: err.message || "Não consegui importar o backup. Nada foi alterado." });
  }
  dialog.close();
  location.hash = "#/";
  alertDialog({ title: "Backup restaurado", message: `Pronto! ${plural(data.books.length, "livro voltou", "livros voltaram")} para a biblioteca.` });
}

// ---------- Goodreads ----------

async function readGoodreads(files) {
  try {
    pending = await readGoodreadsFiles(files);
  } catch (err) {
    console.error(err);
    pending = [];
  }
  if (!pending.length) {
    return alertDialog({
      title: "Nenhum livro encontrado",
      message: "Não achei livros nesse arquivo. Use a planilha do Goodreads (.csv) ou a página da lista de livros salva com Cmd+S.",
    });
  }
  const count = (status) => pending.filter((b) => b.status === status).length;
  const rated = pending.filter((b) => b.rating).length;
  const reviews = pending.filter((b) => b.review).length;
  const kindle = pending.filter((b) => b.format === "kindle").length;
  goodreadsEl.querySelector(".backup-resumo").textContent =
    `Encontrei ${plural(pending.length, "livro", "livros")}${files.length > 1 ? ` em ${files.length} arquivos` : ""}:`;
  goodreadsEl.querySelector(".backup-numeros").innerHTML = [
    `<li><strong>${count("lido")}</strong> lidos</li>`,
    `<li><strong>${count("lendo")}</strong> lendo</li>`,
    `<li><strong>${count("quero ler")}</strong> quero ler</li>`,
    `<li><strong>${rated}</strong> com estrelas</li>`,
    reviews ? `<li><strong>${reviews}</strong> com resenha</li>` : "",
    kindle ? `<li><strong>${kindle}</strong> no Kindle</li>` : "",
  ].join("");
  const current = db.getBooks().length;
  goodreadsEl.querySelector(".backup-aviso").textContent = current
    ? `Você tem ${plural(current, "livro", "livros")} hoje. "Juntar" acrescenta os novos (pula os repetidos); "Substituir" apaga os atuais e fica só com os do Goodreads.`
    : "As capas vêm da Open Library e levam um ou dois minutos para chegar.";
  goodreadsEl.querySelector('[data-acao="juntar"]').hidden = !current;
  goodreadsEl.querySelector('[data-acao="substituir"]').textContent = current ? "Substituir minha biblioteca" : "Importar";
  show(goodreadsEl);
}

// Mesmo livro = mesmo ISBN ou mesmo título + autor (sem acentos/maiúsculas).
const plain = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sameKey = (b) => [b.isbn && `isbn:${b.isbn}`, `t:${plain(b.title)}|${plain(b.author)}`].filter(Boolean);

async function importGoodreads(mode) {
  const current = db.getBooks();
  let list = pending;
  if (mode === "juntar") {
    const known = new Set(current.flatMap(sameKey));
    list = pending.filter((b) => !sameKey(b).some((k) => known.has(k)));
    if (!list.length) return alertDialog({ title: "Nada novo", message: "Todos esses livros já estão na sua biblioteca." });
  } else if (current.length) {
    const ok = await confirmDialog({
      title: "Substituir sua biblioteca?",
      message:
        `Os ${plural(current.length, "livro atual", "livros atuais")} (com notas, trechos e estantes) serão apagados ` +
        `e ficarão só os ${plural(list.length, "livro", "livros")} do Goodreads. ` +
        "Antes, vou baixar uma cópia da biblioteca atual, por segurança.",
      confirmText: "Apagar e substituir",
      danger: true,
    });
    if (!ok) return;
  }

  working = true;
  show(progressEl);
  try {
    const books = await withCovers(list);
    if (mode === "substituir") {
      await safetyBackup();
      await db.importAll(goodreadsLibrary(books));
    } else {
      const added = await db.addBooks(books.map(({ shelves, ...book }) => book));
      await db.ensureCategories(books.flatMap((b) => b.categories));
      await addToShelves(books, added);
    }
    working = false;
    dialog.close();
    location.hash = "#/";
    const missing = books.filter((b) => !b.coverUrl).length;
    alertDialog({
      title: "Livros importados",
      message:
        `Pronto! ${plural(books.length, "livro chegou", "livros chegaram")} do Goodreads. ` +
        "As cores das lombadas vão aparecendo aos poucos, conforme as capas carregam." +
        (missing ? ` ${plural(missing, "livro ficou", "livros ficaram")} sem capa (cor provisória); dá para trocar a cor na página do livro.` : ""),
    });
  } catch (err) {
    working = false;
    console.error(err);
    show(goodreadsEl);
    alertDialog({ title: "Não deu certo", message: err.message || "Não consegui importar. Nada foi alterado." });
  }
}

// Busca capa, páginas e categorias de cada livro na Open Library, alguns
// por vez, atualizando a barra de progresso.
async function withCovers(list) {
  const bar = progressEl.querySelector(".backup-barra span");
  const label = progressEl.querySelector(".backup-contagem");
  let done = 0;
  const update = () => {
    bar.style.width = `${(done / list.length) * 100}%`;
    label.textContent = `${done} de ${list.length}`;
  };
  update();
  const result = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      const book = list[i];
      let found = null;
      try {
        found = await findBook(book);
      } catch (err) {
        console.warn("Sem dados da Open Library para", book.title, err);
      }
      result[i] = {
        ...book,
        coverUrl: found?.coverId ? coverUrl(found.coverId) : "",
        pages: book.pages || found?.pages || null,
        currentPage: book.status === "lido" ? book.pages || found?.pages || 0 : book.currentPage,
        categories: found ? suggestCategories(found.subjects) : [],
      };
      done++;
      update();
    }
  }
  await Promise.all(Array.from({ length: LOOKUPS_AT_ONCE }, worker));
  return result;
}

// Biblioteca nova só com os livros do Goodreads (para "Substituir").
function goodreadsLibrary(books) {
  const withIds = books.map(({ shelves, ...book }) => ({ ...book, id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2), shelves }));
  // Arrumação personalizada: na ordem em que ela adicionou no Goodreads.
  const byAdded = [...withIds].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const shelfNames = [...new Set(withIds.flatMap((b) => b.shelves))];
  const now = new Date().toISOString();
  return {
    books: withIds.map(({ shelves, ...book }) => book),
    settings: {
      customOrder: byAdded.map((b) => b.id),
      categories: [...new Set(withIds.flatMap((b) => b.categories))],
      shelves: shelfNames.map((name, i) => ({
        id: `gr-${i}-${Date.now().toString(36)}`,
        name,
        bookIds: byAdded.filter((b) => b.shelves.includes(name)).map((b) => b.id),
        createdAt: now,
      })),
    },
  };
}

// "Juntar": estantes do Goodreads (só na planilha .csv) viram estantes dela.
async function addToShelves(books, added) {
  const names = [...new Set(books.flatMap((b) => b.shelves))];
  for (const name of names) {
    const ids = added.filter((_, i) => books[i].shelves.includes(name)).map((b) => b.id);
    const existing = db.getShelves().find((s) => plain(s.name) === plain(name));
    if (existing) await db.setShelfBooks(existing.id, [...existing.bookIds, ...ids]);
    else await db.addShelf(name, ids);
  }
}
