const MAX_WRONG = 6;
const HINTS = 2;
const HINT_COST = 5;
const ROWS = [
  ["q", "e", "r", "t", "y", "u", "i", "o", "p", "o‘"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "g‘"],
  ["z", "x", "v", "b", "n", "m", "sh", "ch"],
];
const PHYSICAL = { c: "ch", w: "sh" };
const HEART = '<svg class="heart" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.1 4.4 2.5.8-1.4 2.3-2.5 4.4-2.5 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21Z"/></svg>';

const $ = (selector) => document.querySelector(selector);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem("sozniTop:" + key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("sozniTop:" + key, JSON.stringify(value));
    } catch {}
  },
};

const stats = store.get("stats", { score: 0, streak: 0, best: 0, wins: 0, games: 0 });
let category = store.get("category", "all");
if (category !== "all" && !CATEGORIES[category]) category = "all";
let recent = [];
let game = null;

function tokens(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    const next = word[i + 1];
    if ((c === "o" || c === "g") && next === "‘") {
      out.push(c + "‘");
      i++;
    } else if ((c === "s" || c === "c") && next === "h") {
      out.push(c + "h");
      i++;
    } else {
      out.push(c);
    }
  }
  return out;
}

const upper = (letter) => letter.toUpperCase();
const pretty = (word) => tokens(word).map(upper).join("");

function haptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

let islandTimer;
function island(text, type = "ok") {
  const el = $("#island");
  $("#islandText").textContent = text;
  el.className = "island show " + type;
  clearTimeout(islandTimer);
  islandTimer = setTimeout(() => (el.className = "island"), 1700);
}

function renderStats(bump = []) {
  for (const key of ["score", "streak", "best"]) {
    const el = $("#" + key);
    el.textContent = stats[key];
    if (bump.includes(key)) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }
}

function saveStats() {
  store.set("stats", stats);
}

function pool() {
  const keys = category === "all" ? Object.keys(CATEGORIES) : [category];
  return keys.flatMap((key) => CATEGORIES[key].words.map(([word, hint]) => ({ word, hint, cat: key })));
}

/* ---------- categories ---------- */

function buildCategories() {
  const nav = $("#cats");
  const items = [["all", "Hammasi"], ...Object.entries(CATEGORIES).map(([key, c]) => [key, `${c.emoji} ${c.name}`])];
  for (const [key, label] of items) {
    const btn = document.createElement("button");
    btn.className = "seg";
    btn.dataset.cat = key;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (category === key) return;
      category = key;
      store.set("category", key);
      markCategory(true);
      haptic(8);
      newGame();
    });
    nav.appendChild(btn);
  }
  markCategory(false);
  addEventListener("resize", () => markCategory(false));
}

function markCategory(scroll) {
  const nav = $("#cats");
  const thumb = $("#thumb");
  let active;
  nav.querySelectorAll(".seg").forEach((btn) => {
    const on = btn.dataset.cat === category;
    btn.classList.toggle("active", on);
    if (on) active = btn;
  });
  if (!active) return;
  thumb.style.width = active.offsetWidth + "px";
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  if (scroll) active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

/* ---------- keyboard ---------- */

function buildKeyboard() {
  const board = $("#keyboard");
  for (const row of ROWS) {
    const line = document.createElement("div");
    line.className = "row";
    for (const letter of row) {
      const key = document.createElement("button");
      key.className = "key" + (letter.length > 1 ? " wide" : "");
      key.dataset.key = letter;
      key.textContent = upper(letter);
      key.setAttribute("aria-label", upper(letter));
      key.addEventListener("click", () => guess(letter));
      line.appendChild(key);
    }
    board.appendChild(line);
  }
}

const keyEl = (letter) => document.querySelector(`.key[data-key="${letter}"]`);

/* ---------- game ---------- */

function newGame() {
  closeSheets();
  const list = pool();
  let choices = list.filter((item) => !recent.includes(item.word));
  if (!choices.length) choices = list;
  const entry = choices[Math.floor(Math.random() * choices.length)];
  recent = [entry.word, ...recent].slice(0, Math.min(8, list.length - 1));
  game = { entry, letters: tokens(entry.word), guessed: new Set(), wrong: 0, hints: HINTS, over: false };

  const meta = CATEGORIES[entry.cat];
  $("#catBadge").textContent = `${meta.emoji} ${meta.name} · ${game.letters.length} harf`;
  $("#hint").textContent = entry.hint;
  $("#lives").innerHTML = HEART.repeat(MAX_WRONG);

  const word = $("#word");
  word.style.setProperty("--n", game.letters.length);
  word.innerHTML = game.letters
    .map((letter, i) => `<div class="tile" style="--i:${i}"><span class="ch">${upper(letter)}</span></div>`)
    .join("");

  document.querySelectorAll(".key").forEach((key) => key.classList.remove("hit", "miss", "pressed"));
  updateHint();
}

function updateHint() {
  $("#hintLeft").textContent = game.hints;
  $("#hintBtn").disabled = game.over || game.hints <= 0;
}

function reveal(index, delay, cls = "open") {
  setTimeout(() => $("#word").children[index].classList.add(cls), delay);
}

function guess(letter, fromHint = false) {
  if (!game || game.over || game.guessed.has(letter)) return;
  game.guessed.add(letter);
  const key = keyEl(letter);
  key.classList.add("pressed");
  const hits = game.letters.flatMap((t, i) => (t === letter ? [i] : []));

  if (hits.length) {
    key.classList.add("hit");
    hits.forEach((i, n) => reveal(i, n * 110));
    haptic(10);
    if (!fromHint) island(hits.length > 1 ? `Zo‘r! «${upper(letter)}» ${hits.length} marta bor` : `Zo‘r! «${upper(letter)}» bor`, "ok");
    if (game.letters.every((t) => game.guessed.has(t))) {
      game.over = true;
      setTimeout(win, hits.length * 110 + 450);
    }
  } else {
    key.classList.add("miss");
    game.wrong++;
    const hearts = $("#lives").children;
    hearts[MAX_WRONG - game.wrong].classList.add("lost");
    const board = $("#board");
    board.classList.remove("shake");
    void board.offsetWidth;
    board.classList.add("shake");
    haptic([30, 40, 30]);
    const left = MAX_WRONG - game.wrong;
    island(left ? `«${upper(letter)}» yo‘q · ${left} ta urinish qoldi` : `«${upper(letter)}» yo‘q`, "bad");
    if (game.wrong >= MAX_WRONG) {
      game.over = true;
      setTimeout(lose, 500);
    }
  }
  updateHint();
}

function useHint() {
  if (!game || game.over || game.hints <= 0) return;
  const hidden = [...new Set(game.letters.filter((t) => !game.guessed.has(t)))];
  if (!hidden.length) return;
  game.hints--;
  stats.score = Math.max(0, stats.score - HINT_COST);
  saveStats();
  renderStats(["score"]);
  island(`Yordam: −${HINT_COST} ball`, "info");
  guess(hidden[Math.floor(Math.random() * hidden.length)], true);
}

function win() {
  const points = 10 + (MAX_WRONG - game.wrong) * 2 + Math.min(stats.streak, 10) * 2;
  stats.score += points;
  stats.streak += 1;
  stats.best = Math.max(stats.best, stats.streak);
  stats.wins += 1;
  stats.games += 1;
  saveStats();
  renderStats(["score", "streak", "best"]);
  haptic([20, 60, 20, 60, 40]);
  confetti();
  openResult(true, points);
}

function lose() {
  game.letters.forEach((t, i) => {
    if (!game.guessed.has(t)) reveal(i, i * 70, "missed");
  });
  stats.streak = 0;
  stats.games += 1;
  saveStats();
  renderStats(["streak"]);
  setTimeout(() => openResult(false, 0), game.letters.length * 70 + 600);
}

/* ---------- sheets ---------- */

function openSheet(id) {
  $("#backdrop").classList.add("show");
  $(id).classList.add("open");
}

function closeSheets() {
  $("#backdrop").classList.remove("show");
  document.querySelectorAll(".sheet").forEach((sheet) => sheet.classList.remove("open"));
}

function openResult(won, points) {
  $("#resultEmoji").textContent = won ? (game.wrong === 0 ? "🏆" : "🎉") : "😕";
  $("#resultTitle").textContent = won ? (game.wrong === 0 ? "Bexato topdingiz!" : "Topdingiz!") : "Bu safar chiqmadi";
  $("#resultWord").textContent = pretty(game.entry.word);
  $("#resultHint").textContent = game.entry.hint;
  const chips = won
    ? [`+${points} ball`, `Xato: ${game.wrong}/${MAX_WRONG}`, `Seriya: ${stats.streak}`]
    : [`Xato: ${game.wrong}/${MAX_WRONG}`, "Seriya qaytadan boshlanadi"];
  $("#resultChips").innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join("");
  openSheet("#result");
}

/* ---------- confetti ---------- */

function confetti() {
  if (reduceMotion) return;
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#64d2ff", "#bf5af2", "#30d158", "#ffd60a", "#ff9f0a", "#ff375f", "#ffffff"];
  const parts = Array.from({ length: 160 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = 7 + Math.random() * 9;
    return {
      x: w / 2,
      y: h * 0.42,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() > 0.6,
    };
  });
  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}

/* ---------- events ---------- */

$("#hintBtn").addEventListener("click", useHint);
$("#newBtn").addEventListener("click", () => {
  if (game && !game.over && game.guessed.size > 0) {
    stats.streak = 0;
    saveStats();
    renderStats(["streak"]);
  }
  haptic(8);
  newGame();
});
$("#nextBtn").addEventListener("click", newGame);
$("#rulesBtn").addEventListener("click", () => openSheet("#rules"));
$("#rulesClose").addEventListener("click", closeSheets);
$("#backdrop").addEventListener("click", () => {
  if ($("#result").classList.contains("open")) newGame();
  else closeSheets();
});

addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "enter" && game?.over) {
    newGame();
    return;
  }
  if (key === "escape") {
    closeSheets();
    return;
  }
  const letter = PHYSICAL[key] || key;
  if (keyEl(letter)) guess(letter);
});

buildCategories();
buildKeyboard();
renderStats();
newGame();
if (!store.get("seenRules", false)) {
  store.set("seenRules", true);
  setTimeout(() => openSheet("#rules"), 700);
}
