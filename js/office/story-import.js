// "Trazer do Google Docs": explica como baixar o .docx, lê o arquivo
// (services/docx.js, tudo no navegador) e mostra uma PRÉVIA editável antes
// de criar qualquer coisa:
//   - jeito de dividir (qual nível de título é história e qual é capítulo);
//   - caixinhas para escolher o que trazer, títulos editáveis;
//   - "↑ juntar" (capítulo ao anterior, história à de cima) e
//     "✂ virar história" (corta a história ali);
//   - história com o mesmo nome de uma que já existe: não trazer, juntar
//     (capítulos no fim da existente) ou trazer como cópia.
// Nada que já existe é apagado ou sobrescrito.

import * as db from "../data/db.js";
import { readDocx } from "../services/docx.js";
import { sanitizeHtml, countWords } from "./sanitize.js";
import { nextCover } from "./notebook.js";
import { plain } from "../ui/search.js";

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (x) => x.toLocaleString("pt-BR");
const plural = (x, one, many) => `${n(x)} ${x === 1 ? one : many}`;
const sameTitle = (a, b) => plain(a).trim() === plain(b).trim();

// Jeitos de dividir, a partir dos níveis de título que o documento usa.
function divisionModes(levels, guessed) {
  const name = (l) => (guessed ? `Destaque ${l}` : l === 0 ? "Título" : `Título ${l}`);
  const [a, b, c] = levels;
  const modes = [];
  if (b != null) modes.push({ story: a, chapter: b, label: `${name(a)} = história · ${name(b)} = capítulo` });
  if (c != null) modes.push({ story: b, chapter: c, label: `${name(b)} = história · ${name(c)} = capítulo` });
  if (a != null) {
    modes.push({ story: a, chapter: null, label: `${name(a)} = história (cada uma com 1 capítulo)` });
    modes.push({ story: null, chapter: a, label: `Uma história só · ${name(a)} = capítulo` });
  }
  modes.push({ story: null, chapter: null, label: "Tudo numa história só, sem divisão" });
  return modes;
}

// Monta histórias e capítulos com o jeito de dividir escolhido.
function structure(nodes, mode, fileTitle) {
  const stories = [];
  let story = null;
  let chapter = null;
  const newStory = (title) => {
    story = { title, include: true, dup: "pular", chapters: [] };
    stories.push(story);
    chapter = null;
  };
  const newChapter = (title) => {
    if (!story) newStory(fileTitle);
    chapter = { title, include: true, parts: [], text: "" };
    story.chapters.push(chapter);
  };
  for (const node of nodes) {
    if (node.kind === "heading" && node.level === mode.story) {
      newStory(node.text);
      continue;
    }
    if (node.kind === "heading" && node.level === mode.chapter) {
      newChapter(node.text);
      continue;
    }
    if (!story) newStory(fileTitle);
    if (!chapter) newChapter(mode.chapter == null ? "Capítulo 1" : "Início");
    // Títulos de outros níveis viram títulos de cena dentro do capítulo.
    chapter.parts.push(node.kind === "heading" ? `<h3>${escape(node.text)}</h3>` : node.html);
    chapter.text += " " + node.text;
  }
  for (const s of stories) {
    s.chapters = s.chapters.map((c) => finishChapter(c.title, c.parts.join(""), c.text, c.include));
  }
  // Texto solto antes do primeiro título (ex.: anotações): começa desmarcado
  // se for curtinho e houver outras histórias.
  if (stories.length > 1 && stories[0].title === fileTitle && words(stories[0]) < 30) stories[0].include = false;
  return stories;
}

function finishChapter(title, html, text, include = true) {
  const clean = sanitizeHtml(html);
  return {
    title,
    include,
    html: clean,
    words: countWords(text),
    snippet: text.replace(/\s+/g, " ").trim().slice(0, 150),
  };
}

const words = (story) => story.chapters.filter((c) => c.include).reduce((sum, c) => sum + c.words, 0);

// Abre a janela. Devolve a lista de histórias criadas/alteradas (ou []).
export function importFromDocs() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "janela-importar";
    dialog.innerHTML = `
      <div class="janela">
        <h2>Trazer do Google Docs</h2>
        <section class="imp-passo" data-passo="arquivo">
          <ol class="imp-instrucoes">
            <li>Abra o documento no <b>Google Docs</b>.</li>
            <li>Clique em <b>Arquivo → Fazer download → Microsoft Word (.docx)</b>.</li>
            <li>Escolha aqui o arquivo que foi baixado.</li>
          </ol>
          <p class="imp-nota">O arquivo é lido aqui mesmo, no seu navegador — não é enviado para lugar nenhum. Antes de trazer, você vê uma prévia e escolhe o que entra.</p>
          <p class="imp-erro" aria-live="polite"></p>
          <div class="acoes">
            <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
            <label class="botao imp-escolher">Escolher arquivo .docx
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
            </label>
          </div>
        </section>
        <section class="imp-passo" data-passo="previa" hidden>
          <div class="imp-dividir">
            <label for="imp-modo">Como dividir</label>
            <select id="imp-modo"></select>
          </div>
          <p class="imp-nota imp-deduzido" hidden>Não achei títulos com estilo no documento, então usei as linhas curtas em negrito ou com letra maior. Confira abaixo.</p>
          <p class="imp-nota imp-aviso-modo" hidden>Mudar o jeito de dividir desfaz as mudanças feitas na lista.</p>
          <ul class="imp-lista"></ul>
          <div class="acoes">
            <span class="imp-resumo"></span>
            <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
            <button class="botao" type="button" data-acao="trazer">Trazer</button>
          </div>
          <div class="imp-progresso" hidden><div class="imp-barra"><span></span></div><p></p></div>
        </section>
      </div>`;
    document.body.appendChild(dialog);
    const $ = (sel) => dialog.querySelector(sel);
    const list = $(".imp-lista");
    const modeSelect = $("#imp-modo");
    const existing = db.getStories();

    let doc = null;      // { nodes, levels, guessed }
    let modes = [];
    let stories = [];
    let fileTitle = "";
    let busy = false;

    const finish = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!busy) finish([]);
    });

    // ---------- Arquivo ----------

    $('input[type="file"]').addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      $(".imp-erro").textContent = "Lendo o arquivo…";
      try {
        doc = await readDocx(file);
      } catch (err) {
        console.error(err);
        $(".imp-erro").textContent = /docx/i.test(err.message) ? err.message : "Não consegui ler esse arquivo. Ele foi baixado do Google Docs como Microsoft Word (.docx)?";
        return;
      }
      if (!doc.nodes.length) {
        $(".imp-erro").textContent = "Esse documento parece estar vazio.";
        return;
      }
      fileTitle = file.name.replace(/\.docx$/i, "").trim() || "História importada";
      modes = divisionModes(doc.levels, doc.guessed);
      modeSelect.replaceChildren(...modes.map((m, i) => new Option(m.label, i)));
      $(".imp-deduzido").hidden = !doc.guessed;
      $('[data-passo="arquivo"]').hidden = true;
      $('[data-passo="previa"]').hidden = false;
      build(0);
    });

    function build(modeIndex) {
      stories = structure(doc.nodes, modes[modeIndex], fileTitle);
      $(".imp-aviso-modo").hidden = true;
      render();
    }

    modeSelect.addEventListener("change", () => build(Number(modeSelect.value)));

    // ---------- Prévia ----------

    const duplicateOf = (s) => existing.find((e) => sameTitle(e.title, s.title)) || null;

    function storyRow(s, i) {
      const li = document.createElement("li");
      li.className = "imp-historia";
      li.dataset.s = i;
      li.innerHTML = `
        <div class="imp-linha">
          <input type="checkbox" data-campo="incluir" aria-label="Trazer esta história">
          <input class="imp-titulo" data-campo="titulo" maxlength="80" aria-label="Título da história">
          <span class="imp-info"></span>
          ${i > 0 ? `<button class="link" type="button" data-acao="juntar-historia" title="Os capítulos desta história passam para a de cima">↑ juntar à de cima</button>` : ""}
        </div>
        <div class="imp-dup" hidden>
          <span>Já existe uma história com esse nome.</span>
          <select data-campo="dup" aria-label="O que fazer com a história repetida">
            <option value="pular">Não trazer</option>
            <option value="juntar">Juntar: capítulos no fim da que já existe</option>
            <option value="copia">Trazer como uma cópia</option>
          </select>
        </div>
        <ol class="imp-capitulos"></ol>`;
      $$(li, '[data-campo="incluir"]').checked = s.include;
      $$(li, ".imp-titulo").value = s.title;
      const dup = duplicateOf(s);
      $$(li, ".imp-dup").hidden = !dup;
      $$(li, '[data-campo="dup"]').value = s.dup;
      li.classList.toggle("imp-fora", !s.include || (dup && s.dup === "pular"));
      $$(li, ".imp-capitulos").append(...s.chapters.map((c, j) => chapterRow(c, j)));
      updateInfo(li, s);
      return li;
    }

    function chapterRow(c, j) {
      const li = document.createElement("li");
      li.className = "imp-capitulo";
      li.dataset.c = j;
      li.innerHTML = `
        <div class="imp-linha">
          <input type="checkbox" data-campo="incluir-cap" aria-label="Trazer este capítulo">
          <input class="imp-cap-titulo" data-campo="titulo-cap" maxlength="80" aria-label="Título do capítulo">
          <span class="imp-palavras"></span>
          ${j > 0 ? `<button class="link" type="button" data-acao="juntar-cap" title="O texto deste capítulo passa para o fim do anterior">↑ juntar</button>
          <button class="link" type="button" data-acao="cortar" title="Daqui para baixo vira uma história separada">✂ virar história</button>` : ""}
        </div>
        <p class="imp-trecho"></p>`;
      $$(li, '[data-campo="incluir-cap"]').checked = c.include;
      $$(li, ".imp-cap-titulo").value = c.title;
      $$(li, ".imp-palavras").textContent = plural(c.words, "palavra", "palavras");
      $$(li, ".imp-trecho").textContent = c.snippet ? `“${c.snippet}${c.snippet.length >= 150 ? "…" : ""}”` : "(sem texto)";
      li.classList.toggle("imp-fora", !c.include);
      return li;
    }

    const $$ = (el, sel) => el.querySelector(sel);

    function updateInfo(li, s) {
      const count = s.chapters.filter((c) => c.include).length;
      $$(li, ".imp-info").textContent = `${plural(count, "capítulo", "capítulos")} · ${plural(words(s), "palavra", "palavras")}`;
    }

    // O que vai ser feito, com as escolhas atuais.
    function plan() {
      const create = [];
      const append = [];
      for (const s of stories) {
        if (!s.include) continue;
        const dup = duplicateOf(s);
        if (dup && s.dup === "pular") continue;
        const chapters = s.chapters.filter((c) => c.include).map((c) => ({ title: c.title.trim() || "Sem título", html: c.html, words: c.words }));
        if (dup && s.dup === "juntar") append.push({ story: dup, chapters });
        else create.push({ title: s.title.trim() || "Sem título", chapters });
      }
      return { create, append };
    }

    function renderSummary() {
      const { create, append } = plan();
      const all = [...create, ...append];
      const chapters = all.reduce((sum, s) => sum + s.chapters.length, 0);
      const total = all.reduce((sum, s) => sum + s.chapters.reduce((a, c) => a + c.words, 0), 0);
      const parts = [];
      if (create.length) parts.push(plural(create.length, "história nova", "histórias novas"));
      if (append.length) parts.push(`${plural(append.length, "história", "histórias")} com capítulos a mais`);
      $(".imp-resumo").textContent = all.length
        ? `${parts.join(" e ")} · ${plural(chapters, "capítulo", "capítulos")} · ${plural(total, "palavra", "palavras")}`
        : "Nada marcado para trazer.";
      const button = $('[data-acao="trazer"]');
      button.disabled = !all.length;
      button.textContent = create.length === 1 && !append.length ? "Trazer 1 história" : create.length && !append.length ? `Trazer ${create.length} histórias` : "Trazer";
    }

    function render() {
      const scroll = list.scrollTop;
      list.replaceChildren(...stories.map((s, i) => storyRow(s, i)));
      list.scrollTop = scroll;
      renderSummary();
    }

    // Digitar num título: muda só o dado (sem redesenhar, o cursor não pula).
    list.addEventListener("input", (event) => {
      const el = event.target;
      const s = stories[el.closest("[data-s]")?.dataset.s];
      if (!s) return;
      if (el.dataset.campo === "titulo") {
        s.title = el.value;
        const li = el.closest(".imp-historia");
        const dup = duplicateOf(s);
        $$(li, ".imp-dup").hidden = !dup;
        li.classList.toggle("imp-fora", !s.include || (dup && s.dup === "pular"));
        renderSummary();
      } else if (el.dataset.campo === "titulo-cap") {
        s.chapters[el.closest("[data-c]").dataset.c].title = el.value;
      }
    });

    list.addEventListener("change", (event) => {
      const el = event.target;
      const li = el.closest(".imp-historia");
      const s = stories[li?.dataset.s];
      if (!s) return;
      if (el.dataset.campo === "incluir") s.include = el.checked;
      else if (el.dataset.campo === "dup") s.dup = el.value;
      else if (el.dataset.campo === "incluir-cap") {
        const c = s.chapters[el.closest("[data-c]").dataset.c];
        c.include = el.checked;
        el.closest(".imp-capitulo").classList.toggle("imp-fora", !c.include);
        updateInfo(li, s);
        renderSummary();
        return;
      } else return;
      const dup = duplicateOf(s);
      li.classList.toggle("imp-fora", !s.include || (dup && s.dup === "pular"));
      renderSummary();
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acao]");
      if (!button) return;
      const i = Number(button.closest("[data-s]").dataset.s);
      const s = stories[i];
      const j = Number(button.closest("[data-c]")?.dataset.c);
      if (button.dataset.acao === "juntar-historia") {
        stories[i - 1].chapters.push(...s.chapters);
        stories.splice(i, 1);
      } else if (button.dataset.acao === "juntar-cap") {
        // O título do capítulo juntado vira um título de cena.
        const prev = s.chapters[j - 1];
        const c = s.chapters[j];
        s.chapters.splice(j - 1, 2, {
          title: prev.title,
          include: prev.include || c.include,
          html: sanitizeHtml(`${prev.html}<h3>${escape(c.title)}</h3>${c.html}`),
          words: prev.words + c.words,
          snippet: prev.snippet || c.snippet,
        });
      } else if (button.dataset.acao === "cortar") {
        const moved = s.chapters.splice(j);
        stories.splice(i + 1, 0, { title: moved[0].title, include: true, dup: "pular", chapters: moved });
      } else return;
      $(".imp-aviso-modo").hidden = false;
      render();
    });

    // ---------- Trazer ----------

    dialog.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-acao]")?.dataset.acao;
      if (action === "cancelar" && !busy) finish([]);
      if (action !== "trazer" || busy) return;
      const { create, append } = plan();
      if (!create.length && !append.length) return;
      busy = true;
      dialog.querySelectorAll('[data-passo="previa"] .acoes').forEach((a) => (a.hidden = true));
      const progress = $(".imp-progresso");
      progress.hidden = false;
      const total = create.length + append.length;
      const show = (done) => {
        progress.querySelector("span").style.width = `${Math.round((done / total) * 100)}%`;
        progress.querySelector("p").textContent = `Trazendo… ${done} de ${total}`;
      };
      show(0);
      // Cores diferentes para cada caderno novo.
      const pool = [...db.getStories()];
      for (const s of create) {
        s.color = nextCover(pool);
        pool.push({ color: s.color });
      }
      const touched = [];
      try {
        touched.push(...(await db.importStories(create, (done) => show(done))));
        for (const [k, a] of append.entries()) {
          await db.appendChapters(a.story.id, a.chapters);
          touched.push(a.story);
          show(create.length + k + 1);
        }
      } catch (err) {
        console.error(err);
        busy = false;
        progress.querySelector("p").textContent = touched.length
          ? `Parei no meio: ${plural(touched.length, "história foi trazida", "histórias foram trazidas")}, o resto não. ${err.message}`
          : `Não consegui trazer. ${err.message}`;
        dialog.querySelectorAll('[data-passo="previa"] .acoes').forEach((a) => (a.hidden = false));
        return;
      }
      busy = false;
      finish(touched);
    });

    dialog.showModal();
  });
}
