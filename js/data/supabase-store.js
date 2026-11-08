// Armazenamento na nuvem (Supabase), com as MESMAS funções do
// local-store.js — o db.js não precisa saber onde os dados ficam.
//
// Cada livro é uma linha da tabela `books` (o livro inteiro em `data`, JSON);
// as configurações são uma linha da tabela `settings`. As regras do banco
// (RLS, em supabase/schema.sql) garantem que cada pessoa só alcança as
// próprias linhas.

import { supabase, currentUserId } from "./supabase-client.js";

const CHUNK = 100; // livros por envio, ao gravar muitos de uma vez

// Erro do Supabase vira um Error com mensagem em português.
function check({ error }) {
  if (!error) return;
  console.error(error);
  const offline = /fetch|network/i.test(error.message || "");
  throw new Error(offline
    ? "Sem conexão com a internet — a mudança não foi salva."
    : "Não consegui salvar na nuvem. Tente de novo em instantes.");
}

async function userId() {
  const id = await currentUserId();
  if (!id) throw new Error("Você saiu da sua conta. Entre de novo para salvar.");
  return id;
}

// Gravações do MESMO livro (ou das configurações) vão em fila, uma de cada
// vez: assim uma gravação antiga nunca chega depois de uma mais nova.
const queues = new Map();
function enqueue(key, task) {
  const run = (queues.get(key) || Promise.resolve()).catch(() => {}).then(task);
  queues.set(key, run);
  run.finally(() => queues.get(key) === run && queues.delete(key)).catch(() => {});
  return run;
}

const row = (uid, book) => ({ user_id: uid, id: book.id, data: book, updated_at: new Date().toISOString() });

export async function loadBooks() {
  const books = [];
  // Busca em páginas de 1000 (limite padrão da API).
  for (let from = 0; ; from += 1000) {
    const res = await supabase.from("books").select("data").range(from, from + 999);
    check(res);
    books.push(...res.data.map((r) => r.data));
    if (res.data.length < 1000) return books;
  }
}

export async function putBook(book) {
  return enqueue(`livro:${book.id}`, async () => {
    const uid = await userId();
    check(await supabase.from("books").upsert(row(uid, book), { onConflict: "user_id,id" }));
  });
}

// Vários livros novos de uma vez (importação).
export async function putBooks(list) {
  const uid = await userId();
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((b) => row(uid, b));
    check(await supabase.from("books").upsert(rows, { onConflict: "user_id,id" }));
  }
}

export async function removeBook(id) {
  return enqueue(`livro:${id}`, async () => {
    const uid = await userId();
    check(await supabase.from("books").delete().eq("user_id", uid).eq("id", id));
  });
}

export async function loadSettings() {
  const res = await supabase.from("settings").select("data").maybeSingle();
  check(res);
  return res.data?.data || null;
}

export async function saveSettings(settings) {
  return enqueue("config", async () => {
    const uid = await userId();
    check(await supabase.from("settings").upsert(
      { user_id: uid, data: settings, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    ));
  });
}

// Substitui tudo (importar backup / "Substituir minha biblioteca").
// Grava os livros novos, apaga os que não estão na lista nova e salva as
// configurações. Se cair no meio, os livros novos já estão lá.
export async function replaceAll({ books, settings }) {
  const uid = await userId();
  await putBooks(books);
  const keep = new Set(books.map((b) => b.id));
  const res = await supabase.from("books").select("id");
  check(res);
  const remove = res.data.map((r) => r.id).filter((id) => !keep.has(id));
  for (let i = 0; i < remove.length; i += CHUNK) {
    check(await supabase.from("books").delete().eq("user_id", uid).in("id", remove.slice(i, i + CHUNK)));
  }
  await saveSettings(settings);
}

// ---------- Escritório: histórias ----------
// Cada história é uma linha da tabela `stories` (supabase/schema-escritorio.sql).
// Apagar uma história apaga também os capítulos dela (cascade no banco).

export async function loadStories() {
  const res = await supabase.from("stories").select("data");
  check(res);
  return res.data.map((r) => r.data);
}

export async function putStory(story) {
  return enqueue(`historia:${story.id}`, async () => {
    const uid = await userId();
    check(await supabase.from("stories").upsert(row(uid, story), { onConflict: "user_id,id" }));
  });
}

export async function removeStory(id) {
  return enqueue(`historia:${id}`, async () => {
    const uid = await userId();
    check(await supabase.from("stories").delete().eq("user_id", uid).eq("id", id));
  });
}

// ---------- Escritório: capítulos ----------
// O texto de cada capítulo é uma linha da tabela `chapters`. A lista do
// manuscrito pede só título e palavras (sem baixar os textos).

export async function loadChapterList(storyId) {
  const res = await supabase.from("chapters")
    .select("id, title:data->>title, words:data->words, updatedAt:data->>updatedAt")
    .eq("story_id", storyId);
  check(res);
  return res.data.map((r) => ({ id: r.id, title: r.title || "", words: Number(r.words) || 0, updatedAt: r.updatedAt || "" }));
}

export async function loadChapter(id) {
  const res = await supabase.from("chapters").select("data, updated_at").eq("id", id).maybeSingle();
  check(res);
  if (!res.data) return null;
  // `updatedAt` = a hora gravada no banco (usada para perceber outro aparelho).
  return { ...res.data.data, updatedAt: new Date(res.data.updated_at).toISOString() };
}

// Grava o capítulo. Com `expectedUpdatedAt`, só grava se ninguém (outro
// aparelho) salvou depois disso: devolve false quando houve conflito.
export async function putChapter(chapter, expectedUpdatedAt) {
  return enqueue(`capitulo:${chapter.id}`, async () => {
    const uid = await userId();
    if (!expectedUpdatedAt) {
      check(await supabase.from("chapters").upsert(
        { user_id: uid, id: chapter.id, story_id: chapter.storyId, data: chapter, updated_at: chapter.updatedAt },
        { onConflict: "user_id,id" }
      ));
      return true;
    }
    const res = await supabase.from("chapters")
      .update({ data: chapter, updated_at: chapter.updatedAt })
      .eq("user_id", uid)
      .eq("id", chapter.id)
      .eq("updated_at", new Date(expectedUpdatedAt).toISOString())
      .select("id");
    check(res);
    return res.data.length > 0;
  });
}

export async function removeChapter(id) {
  return enqueue(`capitulo:${id}`, async () => {
    const uid = await userId();
    check(await supabase.from("chapters").delete().eq("user_id", uid).eq("id", id));
  });
}

// Vários capítulos de uma vez (importação), em lotes de até ~800 KB.
export async function putChapters(list) {
  const uid = await userId();
  const rows = list.map((c) => ({ user_id: uid, id: c.id, story_id: c.storyId, data: c, updated_at: c.updatedAt }));
  let batch = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    check(await supabase.from("chapters").upsert(batch, { onConflict: "user_id,id" }));
    batch = [];
    size = 0;
  };
  for (const r of rows) {
    const s = (r.data.html || "").length + 500;
    if (size + s > 800000) await send();
    batch.push(r);
    size += s;
  }
  await send();
}

// ---------- Escritório: fotos (Storage) ----------
// Bucket PRIVADO `escritorio`; cada pessoa só alcança a própria pasta
// ("<id da pessoa>/…", regras em schema-escritorio.sql). Os caminhos
// guardados nas histórias não têm o id da pessoa: ele é somado aqui.
const BUCKET = "escritorio";
const fullPath = (uid, path) => `${uid}/${path}`;

export async function uploadPhoto(path, blob) {
  const uid = await userId();
  check(await supabase.storage.from(BUCKET).upload(fullPath(uid, path), blob, { contentType: blob.type || "image/jpeg", upsert: false }));
}

export async function removePhotos(paths) {
  if (!paths.length) return;
  const uid = await userId();
  check(await supabase.storage.from(BUCKET).remove(paths.map((p) => fullPath(uid, p))));
}

// Links temporários para mostrar as fotos: { caminho: link }.
export async function photoUrls(paths, seconds) {
  if (!paths.length) return {};
  const uid = await userId();
  const res = await supabase.storage.from(BUCKET).createSignedUrls(paths.map((p) => fullPath(uid, p)), seconds);
  check(res);
  return Object.fromEntries(res.data.map((d, i) => [paths[i], d.signedUrl]).filter(([, url]) => url));
}
