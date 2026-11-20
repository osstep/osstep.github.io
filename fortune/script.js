/**
 * Слоты фортуны — статическое SPA (GitHub Pages)
 * Секции: состояние, барабаны, анимации, история, участники, фон, модалки
 */

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// ---------------------------------------------------------------------------
// Состояние
// ---------------------------------------------------------------------------

/** @type {{ id: string, name: string, photo: string | null, sectorBg: string | null, sectorImage: string | null }[]} */
let participants = [];

/** id победителей по порядку */
let winnerIds = [];
let championId = null;
const championTitle = "Пидр дня";
let fanfareAudio = null;

let isSpinning = false;
let topupShown = false;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const el = {
  bgCanvas: document.getElementById("bg-canvas"),
  reels: document.querySelectorAll(".slot-reel"),
  topup: document.getElementById("topup"),
  lever: document.getElementById("slot-lever"),
  confettiCanvas: document.getElementById("confetti-canvas"),
  appShake: document.getElementById("app-shake"),
  btnSpin: document.getElementById("btn-spin"),
  btnReset: document.getElementById("btn-reset"),
  btnEdit: document.getElementById("btn-edit"),
  btnClearHistory: document.getElementById("btn-clear-history"),
  wheelHint: document.getElementById("wheel-hint"),
  historyList: document.getElementById("history-list"),
  historyEmpty: document.getElementById("history-empty"),
  winnerOverlay: document.getElementById("winner-overlay"),
  winnerCard: document.getElementById("winner-card"),
  winnerClose: document.getElementById("winner-close"),
  winnerPlace: document.getElementById("winner-place"),
  winnerName: document.getElementById("winner-name"),
  winnerAvatar: document.getElementById("winner-avatar"),
  winnerAvatarFallback: document.getElementById("winner-avatar-fallback"),
  modalParticipants: document.getElementById("modal-participants"),
  modalClose: document.getElementById("modal-close"),
  participantList: document.getElementById("participant-list"),
  btnAddParticipant: document.getElementById("btn-add-participant"),
};

// ---------------------------------------------------------------------------
// Участники: вычисляемые списки
// ---------------------------------------------------------------------------

function getParticipant(id) {
  return participants.find((p) => p.id === id);
}

function eligibleParticipants() {
  const set = new Set(winnerIds);
  return participants.filter((p) => !set.has(p.id));
}

// ---------------------------------------------------------------------------
// Фон: частицы + притяжение к курсору
// ---------------------------------------------------------------------------

const bg = {
  ctx: null,
  w: 0,
  h: 0,
  particles: [],
  mouse: { x: 0, y: 0, active: false },
  ripple: [],
};

function initBackground() {
  bg.ctx = el.bgCanvas.getContext("2d");
  resizeBackground();
  const n = Math.min(140, Math.floor((bg.w * bg.h) / 12000));
  bg.particles = [];
  for (let i = 0; i < n; i++) {
    bg.particles.push({
      x: Math.random() * bg.w,
      y: Math.random() * bg.h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 0.6 + Math.random() * 2.2,
      hue: 240 + Math.random() * 80,
    });
  }
}

function resizeBackground() {
  bg.w = window.innerWidth;
  bg.h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.bgCanvas.width = bg.w * dpr;
  el.bgCanvas.height = bg.h * dpr;
  el.bgCanvas.style.width = `${bg.w}px`;
  el.bgCanvas.style.height = `${bg.h}px`;
  if (bg.ctx) bg.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bgStep() {
  const ctx = bg.ctx;
  if (!ctx) return;
  ctx.fillStyle = "#07080f";
  ctx.fillRect(0, 0, bg.w, bg.h);

  const g = ctx.createRadialGradient(
    bg.mouse.x,
    bg.mouse.y,
    0,
    bg.mouse.x,
    bg.mouse.y,
    Math.max(bg.w, bg.h) * 0.45
  );
  g.addColorStop(0, "rgba(124, 92, 255, 0.14)");
  g.addColorStop(0.35, "rgba(0, 229, 200, 0.05)");
  g.addColorStop(1, "rgba(7, 8, 15, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, bg.w, bg.h);

  const mx = bg.mouse.x;
  const my = bg.mouse.y;
  const attract = bg.mouse.active ? 0.018 : 0.006;

  for (const p of bg.particles) {
    const dx = mx - p.x;
    const dy = my - p.y;
    const d = Math.hypot(dx, dy) + 0.001;
    const f = attract * (bg.mouse.active ? 4200 : 1800) / (d * d);
    p.vx += (dx / d) * f * 0.02;
    p.vy += (dy / d) * f * 0.02;
    p.vx += (Math.random() - 0.5) * 0.02;
    p.vy += (Math.random() - 0.5) * 0.02;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -20) p.x = bg.w + 20;
    if (p.x > bg.w + 20) p.x = -20;
    if (p.y < -20) p.y = bg.h + 20;
    if (p.y > bg.h + 20) p.y = -20;
  }

  for (const p of bg.particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fillStyle = `hsla(${p.hue}, 70%, 62%, 0.35)`;
    ctx.fill();
  }

  const t = performance.now() * 0.00015;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "rgba(124, 92, 255, 0.5)";
  ctx.lineWidth = 1;
  const step = 48;
  for (let x = 0; x < bg.w; x += step) {
    const wob = Math.sin(x * 0.01 + t * 40) * 6;
    ctx.beginPath();
    ctx.moveTo(x + wob, 0);
    ctx.lineTo(x - wob * 0.5, bg.h);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = bg.ripple.length - 1; i >= 0; i--) {
    const r = bg.ripple[i];
    r.age += 1;
    const a = 1 - r.age / 50;
    if (a <= 0) {
      bg.ripple.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.age * 5, 0, TAU);
    ctx.strokeStyle = `rgba(0, 229, 200, ${a * 0.25})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  requestAnimationFrame(bgStep);
}

window.addEventListener(
  "mousemove",
  (e) => {
    bg.mouse.x = e.clientX;
    bg.mouse.y = e.clientY;
    bg.mouse.active = true;
  },
  { passive: true }
);
window.addEventListener("mouseleave", () => {
  bg.mouse.active = false;
});
window.addEventListener(
  "click",
  (e) => {
    bg.ripple.push({ x: e.clientX, y: e.clientY, age: 0 });
  },
  { passive: true }
);

// ---------------------------------------------------------------------------
// Слот-машина
// ---------------------------------------------------------------------------

const sectorColors = [
  ["#4a2fa8", "#7c5cff"],
  ["#006b5c", "#00e5c8"],
  ["#8a1a4a", "#ff4d8d"],
  ["#2a4a8a", "#4d9fff"],
  ["#6a4a00", "#ffc14d"],
  ["#3a6a3a", "#6dff8a"],
];

const slotSymbols = ["♦", "★", "♠", "♥", "♣", "7"];

function slotCell(person) {
  const cell = document.createElement("div");
  cell.className = "slot-cell";
  if (!person) {
    cell.textContent = "—";
    return cell;
  }
  const index = participants.indexOf(person);
  cell.style.setProperty("--ink", person.sectorBg || sectorColors[index % sectorColors.length][1]);
  if (person.sectorImage) cell.style.backgroundImage = `linear-gradient(#fff8, #fffc), url("${person.sectorImage}")`;
  const symbol = document.createElement(person.photo ? "img" : "b");
  if (person.photo) {
    symbol.src = person.photo;
    symbol.alt = "";
  } else {
    symbol.textContent = slotSymbols[index % slotSymbols.length];
  }
  const name = document.createElement("span");
  name.textContent = person.name || "Без имени";
  cell.append(symbol, name);
  return cell;
}

function renderReels() {
  if (isSpinning) return;
  const pool = eligibleParticipants();
  el.reels.forEach((reel, column) => {
    const cells = [0, 1, 2].map(row => slotCell(pool[(row + column) % pool.length]));
    reel.replaceChildren(...cells);
  });
}

async function rollReel(reel, column, pool, winner) {
  const strip = document.createElement("div");
  strip.append(...reel.children);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = reduced ? 0 : 12 + column * 5;
  for (let i = 0; i < steps; i++) {
    strip.append(slotCell(pool[(column + i + 3) % pool.length]));
  }
  const index = pool.indexOf(winner);
  for (const offset of [-1, 0, 1]) {
    strip.append(slotCell(pool[(index + offset + pool.length) % pool.length]));
  }
  reel.replaceChildren(strip);
  if (!reduced) {
    const animation = strip.animate([
      { transform: "translateY(0)" },
      { transform: `translateY(calc(-100% + 100% * 3 / ${strip.childElementCount}))` },
    ], { duration: 1700 + column * 500, easing: "cubic-bezier(.28,.02,.22,1)" });
    await animation.finished;
  }
  reel.replaceChildren(...Array.from(strip.children).slice(-3));
}

async function startSpin() {
  if (el.topup.open || !el.winnerOverlay.hidden || !el.modalParticipants.hidden) return;
  const elig = eligibleParticipants();
  if (isSpinning || elig.length < 1) return;

  if (!topupShown) {
    el.topup.showModal();
    topupShown = true;
    return;
  }

  if (championId === null) {
    // Браузер разрешает включить звук во время нажатия на кнопку.
    try {
      fanfareAudio ??= new AudioContext();
      fanfareAudio.resume().catch(() => {});
    } catch {
      // Розыгрыш работает и без Web Audio.
    }
  }
  isSpinning = true;
  updateUI();
  const winner = elig[Math.floor(Math.random() * elig.length)];
  el.lever.classList.add("pulled");
  window.setTimeout(() => el.lever.classList.remove("pulled"), 300);
  await Promise.all(Array.from(el.reels, (reel, i) => rollReel(reel, i, elig, winner)));
  await new Promise(resolve => setTimeout(resolve, 320));
  if (championId === null) {
    championId = winner.id;
    playFanfare();
  }
  winnerIds.push(winner.id);
  isSpinning = false;
  triggerWinEffects();
  showWinnerCard(winner.id, winnerIds.length);
  renderHistory();
  updateUI();
}

// ---------------------------------------------------------------------------
// Победитель: оверлей, конфетти, shake
// ---------------------------------------------------------------------------

let confetti = [];

function triggerWinEffects() {
  el.appShake.classList.remove("shake");
  void el.appShake.offsetWidth;
  el.appShake.classList.add("shake");
  setTimeout(() => el.appShake.classList.remove("shake"), 600);

  spawnConfetti();
}

function spawnConfetti() {
  const c = el.confettiCanvas;
  const ctx = c.getContext("2d");
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  confetti = [];
  const colors = ["#7c5cff", "#00e5c8", "#ff4d8d", "#ffc14d", "#ffffff"];
  const cx = w / 2;
  const cy = h * 0.38;
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * TAU;
    const sp = 6 + Math.random() * 14;
    confetti.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 4,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: colors[i % colors.length],
      life: 1,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of confetti) {
      p.life -= 0.008;
      if (p.life <= 0) continue;
      alive = true;
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(tick);
}

function playFanfare() {
  if (fanfareAudio?.state !== "running") return;
  const start = fanfareAudio.currentTime;
  const notes = [[392, 0, 0.16], [523.25, 0.18, 0.16], [659.25, 0.36, 0.18],
    [523.25, 0.58, 0.64], [659.25, 0.58, 0.64], [783.99, 0.58, 0.64]];
  for (const [frequency, offset, duration] of notes) {
    const tone = fanfareAudio.createOscillator();
    const volume = fanfareAudio.createGain();
    const time = start + offset;
    tone.type = "sawtooth";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, time);
    volume.gain.linearRampToValueAtTime(0.055, time + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.001, time + duration);
    tone.connect(volume).connect(fanfareAudio.destination);
    tone.start(time);
    tone.stop(time + duration);
  }
}

function showWinnerCard(winnerId, place) {
  const p = getParticipant(winnerId);
  if (!p) return;
  const isChampion = winnerId === championId;
  el.winnerCard.classList.toggle("winner-champion", isChampion);
  el.winnerPlace.textContent = isChampion ? championTitle : `${place} место`;
  el.winnerName.textContent = p.name || "Без имени";
  if (p.photo) {
    el.winnerAvatar.src = p.photo;
    el.winnerAvatar.hidden = false;
    el.winnerAvatar.alt = p.name;
  } else {
    el.winnerAvatar.hidden = true;
    el.winnerAvatar.removeAttribute("src");
  }
  const initial = (p.name || "?").charAt(0).toUpperCase();
  el.winnerAvatarFallback.textContent = initial;

  el.winnerOverlay.hidden = false;
  el.winnerOverlay.setAttribute("aria-hidden", "false");
}

function hideWinnerCard() {
  el.winnerOverlay.hidden = true;
  el.winnerOverlay.setAttribute("aria-hidden", "true");
  renderReels();
}

// ---------------------------------------------------------------------------
// История
// ---------------------------------------------------------------------------

function renderHistory() {
  el.historyList.innerHTML = "";
  const empty = winnerIds.length === 0;
  el.historyEmpty.hidden = !empty;
  if (empty) return;

  winnerIds.forEach((id, i) => {
    const p = getParticipant(id);
    if (!p) return;
    const li = document.createElement("li");
    li.className = "history-item";
    const isChampion = id === championId;
    li.classList.toggle("history-champion", isChampion);
    li.style.animationDelay = `${i * 0.04}s`;

    const place = document.createElement("div");
    place.className = "history-item-body";
    const placeLabel = document.createElement("div");
    placeLabel.className = "history-item-place";
    placeLabel.textContent = isChampion ? `1 место · ${championTitle}` : `${i + 1} место`;
    const nameEl = document.createElement("div");
    nameEl.className = "history-item-name";
    nameEl.textContent = p.name || "Без имени";
    place.append(placeLabel, nameEl);

    if (p.photo) {
      const img = document.createElement("img");
      img.className = "history-item-avatar";
      img.src = p.photo;
      img.alt = "";
      li.append(img, place);
    } else {
      const ph = document.createElement("div");
      ph.className = "history-item-avatar placeholder";
      ph.textContent = (p.name || "?").charAt(0).toUpperCase();
      li.append(ph, place);
    }

    el.historyList.appendChild(li);
  });
}

function clearHistory() {
  winnerIds = [];
  championId = null;
  renderHistory();
  renderReels();
  updateUI();
}

// ---------------------------------------------------------------------------
// Сброс: участники остаются, история очищается
// ---------------------------------------------------------------------------

function resetRound() {
  if (isSpinning || !el.winnerOverlay.hidden) return;
  winnerIds = [];
  championId = null;
  renderHistory();
  renderReels();
  updateUI();
}

// ---------------------------------------------------------------------------
// UI состояние кнопок и подсказка
// ---------------------------------------------------------------------------

function updateUI() {
  const elig = eligibleParticipants();
  el.btnSpin.disabled = isSpinning || elig.length < 1;
  el.lever.disabled = el.btnSpin.disabled;
  el.btnEdit.disabled = isSpinning;
  el.btnReset.disabled = isSpinning;
  el.btnClearHistory.disabled = isSpinning || winnerIds.length === 0;

  if (elig.length === 0) {
    el.wheelHint.textContent =
      "Все участники уже выпали — сбросьте раунд или добавьте новых.";
  } else if (isSpinning) {
    el.wheelHint.textContent = "Барабаны крутятся…";
  } else if (elig.length === 1) {
    el.wheelHint.textContent =
      "Один участник в розыгрыше — крутите для шоу; победитель всё равно будет он. Дальше сбросьте раунд или добавьте людей.";
  } else {
    el.wheelHint.textContent =
      "Потяните ручку справа или нажмите пробел.";
  }
}

// ---------------------------------------------------------------------------
// Модалка участников
// ---------------------------------------------------------------------------

function openParticipantsModal() {
  if (isSpinning || !el.winnerOverlay.hidden) return;
  el.modalParticipants.hidden = false;
  el.modalParticipants.setAttribute("aria-hidden", "false");
  renderParticipantRows();
}

function closeParticipantsModal() {
  el.modalParticipants.hidden = true;
  el.modalParticipants.setAttribute("aria-hidden", "true");
  syncNamesFromInputs();
  renderReels();
  renderHistory();
  updateUI();
}

function renderParticipantRows() {
  el.participantList.innerHTML = "";
  participants.forEach((p, index) => {
    const li = document.createElement("li");
    li.className = "participant-row";
    li.dataset.id = p.id;
    li.draggable = true;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⋮⋮";
    handle.title = "Перетащить";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = p.name;
    nameInput.placeholder = "Имя";
    nameInput.dataset.id = p.id;

    const colorWrap = document.createElement("div");
    colorWrap.className = "sector-color-wrap";
    const paletteOuter = sectorColors[index % sectorColors.length][1];
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "sector-color-input";
    colorInput.value = p.sectorBg || paletteOuter;
    colorInput.addEventListener("input", () => {
      p.sectorBg = colorInput.value;
      renderReels();
    });
    colorInput.disabled = Boolean(p.sectorImage);
    colorInput.title = p.sectorImage
      ? "Цвет отключён: активна картинка фона карточки"
      : "Цвет фона карточки (если нет картинки)";
    const autoColorBtn = document.createElement("button");
    autoColorBtn.type = "button";
    autoColorBtn.className = "mini-btn sector-auto";
    autoColorBtn.textContent = "Авто";
    autoColorBtn.title = "Цвет по палитре для позиции в списке";
    autoColorBtn.addEventListener("click", () => {
      p.sectorBg = null;
      colorInput.value = sectorColors[index % sectorColors.length][1];
      colorInput.disabled = Boolean(p.sectorImage);
      renderReels();
    });
    colorWrap.append(colorInput, autoColorBtn);

    const thumb = document.createElement(p.photo ? "img" : "div");
    if (p.photo) {
      thumb.className = "participant-thumb";
      thumb.src = p.photo;
      thumb.alt = "";
    } else {
      thumb.className = "participant-thumb placeholder";
      thumb.textContent = "фото";
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const sectorFileLabel = document.createElement("label");
    sectorFileLabel.className = "mini-btn";
    sectorFileLabel.textContent = p.sectorImage ? "Фон ✓" : "Фон";
    sectorFileLabel.title = "Картинка фона карточки на барабане";
    const sectorFile = document.createElement("input");
    sectorFile.type = "file";
    sectorFile.accept = "image/*";
    sectorFile.hidden = true;
    sectorFile.addEventListener("change", (ev) => {
      const f = ev.target.files?.[0];
      if (!f || !f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        p.sectorImage = typeof reader.result === "string" ? reader.result : null;
        renderParticipantRows();
        renderReels();
      };
      reader.readAsDataURL(f);
      ev.target.value = "";
    });
    sectorFileLabel.appendChild(sectorFile);

    const clearSectorBtn = document.createElement("button");
    clearSectorBtn.type = "button";
    clearSectorBtn.className = "mini-btn";
    clearSectorBtn.textContent = "◌";
    clearSectorBtn.title = "Убрать картинку фона карточки";
    clearSectorBtn.hidden = !p.sectorImage;
    clearSectorBtn.addEventListener("click", () => {
      p.sectorImage = null;
      renderParticipantRows();
      renderReels();
    });

    const fileLabel = document.createElement("label");
    fileLabel.className = "mini-btn";
    fileLabel.textContent = "Фото";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    file.addEventListener("change", (ev) => {
      const f = ev.target.files?.[0];
      if (!f || !f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        p.photo = typeof reader.result === "string" ? reader.result : null;
        renderParticipantRows();
        renderReels();
      };
      reader.readAsDataURL(f);
      ev.target.value = "";
    });
    fileLabel.appendChild(file);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini-btn danger";
    del.textContent = "×";
    del.addEventListener("click", () => {
      participants = participants.filter((x) => x.id !== p.id);
      winnerIds = winnerIds.filter((wid) => wid !== p.id);
      renderParticipantRows();
      renderHistory();
      renderReels();
      updateUI();
    });

    actions.append(sectorFileLabel, clearSectorBtn, fileLabel, del);

    li.append(handle, nameInput, colorWrap, thumb, actions);

    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(index));
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = index;
      if (Number.isNaN(from) || from === to) return;
      const [moved] = participants.splice(from, 1);
      participants.splice(to, 0, moved);
      renderParticipantRows();
      renderReels();
    });

    el.participantList.appendChild(li);
  });
}

function syncNamesFromInputs() {
  el.participantList.querySelectorAll('input[type="text"]').forEach((inp) => {
    const id = inp.dataset.id;
    const p = getParticipant(id);
    if (p) p.name = inp.value.trim() || "Участник";
  });
}

function addParticipant() {
  participants.push({
    id: uid(),
    name: `Участник ${participants.length + 1}`,
    photo: null,
    sectorBg: null,
    sectorImage: null,
  });
  renderParticipantRows();
  renderReels();
  updateUI();
}

// ---------------------------------------------------------------------------
// События
// ---------------------------------------------------------------------------

let leverStartY = null;
el.lever.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  leverStartY = event.clientY;
  el.lever.setPointerCapture(event.pointerId);
});
el.lever.addEventListener("pointermove", (event) => {
  if (event.isPrimary && leverStartY !== null && event.clientY - leverStartY >= 16) {
    leverStartY = null;
    startSpin();
  }
});
el.lever.addEventListener("lostpointercapture", () => { leverStartY = null; });
el.lever.addEventListener("click", startSpin);
el.btnSpin.addEventListener("click", startSpin);
el.btnReset.addEventListener("click", resetRound);
el.btnEdit.addEventListener("click", openParticipantsModal);
el.btnClearHistory.addEventListener("click", clearHistory);
el.winnerClose.addEventListener("click", hideWinnerCard);
el.modalClose.addEventListener("click", closeParticipantsModal);
el.btnAddParticipant.addEventListener("click", addParticipant);

document.querySelectorAll("[data-close-modal]").forEach((node) => {
  node.addEventListener("click", closeParticipantsModal);
});

el.winnerOverlay.addEventListener("click", (e) => {
  if (e.target.classList.contains("winner-backdrop")) hideWinnerCard();
});

// ---------------------------------------------------------------------------
// Горячие клавиши
// ---------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (el.topup.open || e.repeat) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const k = e.key.toLowerCase();
  if (e.code === "Space") {
    e.preventDefault();
    startSpin();
  } else if (k === "r") {
    resetRound();
  } else if (k === "e") {
    openParticipantsModal();
  } else if (k === "x") {
    if (!el.winnerOverlay.hidden) hideWinnerCard();
    else closeParticipantsModal();
  } else if (k === "s") {
    if (!el.winnerOverlay.hidden) hideWinnerCard();
  }
});

// ---------------------------------------------------------------------------
// Инициализация
// ---------------------------------------------------------------------------

function seedParticipants() {
  if (participants.length > 0) return;
  participants = [
    { id: uid(), name: "Юля", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Серёга", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Рома", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Дима", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Лёша", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Стёпа", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Марина", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Андрей", photo: null, sectorBg: null, sectorImage: null },
    { id: uid(), name: "Тимур", photo: null, sectorBg: null, sectorImage: null },
  ];
}

function init() {
  seedParticipants();
  initBackground();
  requestAnimationFrame(bgStep);
  renderReels();
  renderHistory();
  updateUI();
}

window.addEventListener("resize", () => {
  resizeBackground();
});

init();
