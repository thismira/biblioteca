// Os dois dragões (preto grande e dourado menor) que às vezes cruzam a mesa
// do escritório, da esquerda para a direita: chegam em faixas paralelas, se
// cruzam em "X" num pequeno mergulho, fazem um looping em que passam um pelo
// outro duas vezes (o dourado na frente, depois o preto) e saem juntos.
// Voo aprovado pelo dono no protótipo (rascunhos/dragoes/voo.html).
//
// RITMO (escolha do dono): uma vez ~4 s depois de a mesa aparecer ao entrar;
// depois, de 5 a 8 minutos (sorteado); no máximo 3 por visita ao escritório.
// Só na mesa (nunca no editor nem nas histórias), com a aba visível, sem
// janela aberta, se ela não mexeu em nada nos últimos segundos e se o
// aparelho não pede "reduzir movimento". Se não der na hora, espera e tenta
// de novo.
//
// Uso (office.js): createDragons(camada, { deskVisible }) →
// startVisit() ao entrar, deskShown() quando a mesa aparece, endVisit() ao
// sair. flyNow() faz um voo na hora (testes; um dia, um objeto clicável).

import { reducedMotion } from "../ui/fly-book.js";

const ENTRY_DELAY = 4000;                       // 1º voo, depois que a mesa aparece
const NEXT_MIN = 5 * 60_000, NEXT_MAX = 8 * 60_000;
const MAX_PER_VISIT = 3;
const DESK_SETTLE = 3000;   // a mesa acabou de aparecer: espera ela "assentar"
const IDLE = 4000;          // ela mexeu em algo há menos que isso: espera
const RETRY = 2500;         // não deu agora: tenta de novo daqui a pouco

// ---------------------------------------------------------------------------
// 1) O CAMINHO, num palco de 1600×900 (depois ajustado à tela).
//    O dragão é guiado pelo quanto ele VIRA a cada passo (curvatura em forma
//    de sino: cresce aos poucos e some aos poucos — sem trancos).
//    Preto: reto → mergulho (cruza a faixa do dourado) → looping subindo.
//    Dourado: o espelho do preto (looping descendo).
// ---------------------------------------------------------------------------
const MEIO = 450;
const EMBALO = 0.3;   // quanto o looping é mais rápido que o voo reto
const DURACAO = 10;   // segundos para atravessar

function caminhoPreto({ y0 = MEIO - 120, x1 = 330, mergulho = 0.5, L1 = 260, L2 = 1000 } = {}) {
  // cada ponto: [x, y, altura acima do início da volta, fase da volta (ou -1), embalo 0..1]
  const pts = [];
  let x = -380, y = y0, th = 0, yVolta = 0, feito = 0;
  const anda = (alt, u) => {
    x += Math.cos(th); y += Math.sin(th);
    const emb = Math.sin(Math.PI * Math.min(1, feito / (L1 + L2))) ** 2;
    pts.push([x, y, alt, u, emb]);
  };
  while (x < x1) anda(0, -1);
  const vira = (area, L, emVolta) => {
    const A = 2 * area / L;
    if (emVolta) yVolta = y;
    for (let i = 0; i < L; i++) {
      th += A * Math.sin(Math.PI * (i + 0.5) / L) ** 2;
      feito++;
      anda(emVolta ? yVolta - y : 0, emVolta ? -th : -1);
    }
  };
  vira(mergulho, L1, false);                  // mergulho: aponta um pouco para baixo
  vira(-(2 * Math.PI + mergulho), L2, true);   // looping: uma volta inteira, subindo
  th = 0;                                      // (−2π = a mesma direção, para a direita)
  while (x < 2000) anda(0, -1);                // saída reta, ao lado do outro
  return pts;
}
const espelho = (pts) => pts.map(([x, y, alt, u, emb]) => [x, 2 * MEIO - y, alt, u, emb]);

// Amostras a cada 2 px, com a direção (suavizada) e o instante (0..1).
function amostrar(raw, passo = 2) {
  const out = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    acc += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    if (acc >= passo) { out.push(raw[i]); acc -= passo; }
  }
  let prev = 0;
  const am = out.map((p, i) => {
    const a = out[Math.max(i - 6, 0)], b = out[Math.min(i + 6, out.length - 1)];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (ang - prev > Math.PI) ang -= 2 * Math.PI;   // sem pulo de 360°
    while (ang - prev < -Math.PI) ang += 2 * Math.PI;
    prev = ang;
    return { x: p[0], y: p[1], ang, sobe: -Math.sin(ang), u: p[3] };
  });
  // Velocidade: o mergulho dá embalo; no alto da volta perde um pouco.
  // O tempo de cada trecho usa a distância REAL (senão o voo "treme").
  let t = 0;
  am.forEach((s, i) => {
    const [, , alt, , emb] = out[i];
    const v = (1 + EMBALO * emb) * Math.sqrt(Math.max(0.45, 1 - alt / 420));
    const prox = am[i + 1];
    s.t = t;
    if (prox) t += Math.hypot(prox.x - s.x, prox.y - s.y) / v;
  });
  am.forEach((s) => (s.t /= t));
  return am;
}

// Calculado uma vez só, no primeiro voo.
let paths = null;
const getPaths = () => (paths ||= (() => {
  const preto = caminhoPreto();
  return [amostrar(preto), amostrar(espelho(preto))];
})());

// ---------------------------------------------------------------------------
// 2) OS DRAGÕES
// ---------------------------------------------------------------------------
const DRAGONS = [
  // larg = largura no palco de 1600; prof −1: na frente na 2ª passagem
  { svg: "img/dragoes/dragao-preto-lado.svg",   larg: 384, atraso: 0,   batida: 1.15, bob: 7, prof: -1 },
  { svg: "img/dragoes/dragao-dourado-lado.svg", larg: 264, atraso: 0.2, batida: 0.8,  bob: 5, prof: +1 },
];
const ORIGEM = { x: 0.56, y: 0.73 };  // o "centro" do dragão no desenho (peito/ombro)
const ASPECTO = 480 / 1000;           // altura/largura do desenho

// Acha o ponto do caminho no instante u (0..1); começa da última posição.
function noTempo(d, u) {
  const am = d.am;
  let i = Math.min(d.i, am.length - 2);
  while (i > 0 && am[i].t > u) i--;
  while (i < am.length - 2 && am[i + 1].t < u) i++;
  d.i = i;
  const a = am[i], b = am[i + 1];
  const k = Math.min(1, Math.max(0, (u - a.t) / ((b.t - a.t) || 1)));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, ang: a.ang + (b.ang - a.ang) * k, sobe: a.sobe, u: a.u };
}

const svgCache = new Map();
const loadSvg = (url) => {
  if (!svgCache.has(url)) {
    svgCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`dragão: ${r.status}`);
      return r.text();
    }).catch((err) => { svgCache.delete(url); throw err; }));
  }
  return svgCache.get(url);
};

// ---------------------------------------------------------------------------
// 3) O CONTROLE: o voo e o ritmo
// ---------------------------------------------------------------------------
export function createDragons(layer, { deskVisible }) {
  let visiting = false;
  let flights = 0;
  let timer = 0;
  let dueAt = 0;          // quando o próximo voo pode acontecer
  let deskShownAt = 0;
  let lastTouch = 0;
  let flying = null;      // { raf, els, ... } durante um voo

  const now = () => performance.now();

  // Qualquer mexida dela adia o voo (só conta enquanto está no escritório).
  const touched = () => (lastTouch = now());
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, touched, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) abort();
  });

  const canFly = () =>
    visiting && deskVisible() && !document.hidden && !reducedMotion() &&
    !document.querySelector("dialog[open]") &&
    now() - deskShownAt > DESK_SETTLE && now() - lastTouch > IDLE;

  function schedule(delay) {
    clearTimeout(timer);
    dueAt = now() + delay;
    timer = setTimeout(tick, delay);
  }

  function tick() {
    if (!visiting || flying || flights >= MAX_PER_VISIT) return;
    if (!canFly()) return schedule(RETRY);
    fly().catch((err) => console.warn("Os dragões não voaram:", err));
  }

  async function fly() {
    if (flying) return;
    flying = { raf: 0 };
    const mine = flying;
    let svgs;
    try {
      svgs = await Promise.all(DRAGONS.map((d) => loadSvg(d.svg)));
    } catch (err) {
      flying = null;
      throw err;
    }
    if (flying !== mine) return; // cancelado enquanto carregava
    const am = getPaths();
    const ds = DRAGONS.map((d, i) => {
      const el = document.createElement("div");
      el.className = "esc-dragao";
      el.innerHTML = svgs[i];
      layer.append(el);
      return {
        ...d, am: am[i], el, i: 0, fase: 0, plana: 0,
        asaFrente: el.querySelector(".dr-asa-frente"),
        asaTras: el.querySelector(".dr-asa-tras"),
      };
    });
    mine.els = ds.map((d) => d.el);
    layer.hidden = false;
    const t0 = now();
    let ultimo = t0;

    const quadro = (agora) => {
      if (flying !== mine) return;
      if (!deskVisible() || !visiting) return abort();
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      // O palco de 1600×900 vira a tela: centralizado, um pouco acima do
      // meio; no celular os dragões encolhem até um limite (o looping cabe).
      const W = layer.clientWidth, H = layer.clientHeight;
      const esc = Math.min(1.1, Math.max(0.4, W / 1600));
      const cx = W / 2, cy = H * 0.42;
      let ativo = false;
      for (const d of ds) {
        const u = Math.min(Math.max(((agora - t0) / 1000 - d.atraso) / DURACAO, 0), 1);
        if (u < 1) ativo = true;
        const s = noTempo(d, u);

        // Asas: subindo bate mais rápido; descendo plana (asas abertas).
        const alvoPlana = Math.min(1, Math.max(0, (-s.sobe - 0.25) / 0.4));
        d.plana += (alvoPlana - d.plana) * Math.min(1, dt * 3);
        const ritmo = (1 + 0.9 * Math.max(0, s.sobe)) * (1 - 0.65 * d.plana);
        d.fase += dt * ritmo * 2 * Math.PI / d.batida;
        const f = d.fase + 0.35 * Math.sin(d.fase);  // a batida para baixo é mais rápida
        const meio = 0.22 + 0.5 * d.plana, amp = 0.78 - 0.66 * d.plana;
        const asa = (fase) => (meio + amp * Math.cos(fase)).toFixed(3);
        d.asaFrente.style.transform = `scaleY(${asa(f)})`;
        d.asaTras.style.transform = `scaleY(${asa(f - 0.25)})`;

        // Corpo: sobe um pouquinho a cada batida e balança o nariz de leve.
        const bob = d.bob * amp * Math.sin(f) * esc;
        const ox = Math.sin(s.ang) * bob, oy = -Math.cos(s.ang) * bob;
        const incl = 0.035 * amp * Math.cos(f);

        // Profundidade no looping: quem passa na frente fica maior e por cima.
        const p = s.u < 0 ? 0 : d.prof * Math.sin(s.u);
        d.el.style.zIndex = p > 0 ? 3 : p < 0 ? 1 : (d.prof < 0 ? 2 : 1);

        const w = d.larg * esc, h = w * ASPECTO;
        const x = cx + (s.x - 800) * esc, y = cy + (s.y - MEIO) * esc;
        d.el.style.width = `${w}px`;
        d.el.style.transform =
          `translate(${x - w * ORIGEM.x + ox}px, ${y - h * ORIGEM.y + oy}px) ` +
          `rotate(${s.ang + incl}rad) scale(${(1 + 0.07 * p).toFixed(3)})`;
      }
      if (ativo) mine.raf = requestAnimationFrame(quadro);
      else finish(true);
    };
    mine.raf = requestAnimationFrame(quadro);
  }

  // Terminou (ou foi interrompido): limpa a camada e marca o próximo.
  function finish(completed) {
    if (!flying) return;
    cancelAnimationFrame(flying.raf);
    flying.els?.forEach((el) => el.remove());
    flying = null;
    layer.hidden = true;
    if (!visiting) return;
    if (completed) {
      flights++;
      if (flights < MAX_PER_VISIT) schedule(NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN));
    } else {
      schedule(RETRY); // interrompido no meio: não conta, tenta de novo depois
    }
  }
  const abort = () => finish(false);

  return {
    // Entrou no escritório (vindo da biblioteca): uma visita nova.
    startVisit() {
      visiting = true;
      flights = 0;
      dueAt = 0;
      clearTimeout(timer);
    },
    // A mesa apareceu: na 1ª vez da visita, marca o voo de entrada.
    deskShown() {
      deskShownAt = now();
      if (!visiting || flights >= MAX_PER_VISIT || flying) return;
      if (!dueAt) schedule(ENTRY_DELAY);
    },
    // Saiu do escritório: some tudo e para de contar.
    endVisit() {
      visiting = false;
      clearTimeout(timer);
      dueAt = 0;
      abort();
    },
    // Um voo agora mesmo (sem as regras do ritmo).
    flyNow: () => fly(),
    get state() {
      return { visiting, flights, flying: !!flying, nextIn: dueAt ? Math.max(0, Math.round(dueAt - now())) : null };
    },
  };
}
