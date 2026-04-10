/**
 * Колесо фортуны — статическое SPA (GitHub Pages)
 * Секции: состояние, колесо, анимации, история, участники, фон, модалки
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

function parseHexColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.trim();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Пара [внутрь, наружу] радиального градиента сектора по выбранному hex */
function sectorPairFromHex(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return ["#4a2fa8", "#7c5cff"];
  const c0 = rgbToHex(rgb.r * 0.52 + 18, rgb.g * 0.52 + 18, rgb.b * 0.52 + 22);
  const c1 = rgbToHex(
    clamp(rgb.r + 42, 0, 255),
    clamp(rgb.g + 42, 0, 255),
    clamp(rgb.b + 42, 0, 255)
  );
  return [c0, c1];
}

function dimSectorPair(c0, c1) {
  const d0 = parseHexColor(c0);
  const d1 = parseHexColor(c1);
  if (!d0 || !d1) return ["#2a2d45", "#1a1c2e"];
  const tg = { r: 28, g: 30, b: 46 };
  const mix = (a, b, t) => a * (1 - t) + b * t;
  return [
    rgbToHex(mix(d0.r, tg.r, 0.58), mix(d0.g, tg.g, 0.58), mix(d0.b, tg.b, 0.58)),
    rgbToHex(mix(d1.r, tg.r, 0.58), mix(d1.g, tg.g, 0.58), mix(d1.b, tg.b, 0.58)),
  ];
}

function normalizeAngle(a) {
  let x = a;
  while (x < 0) x += TAU;
  while (x >= TAU) x -= TAU;
  return x;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// Индекс сектора под указателем (указатель сверху, -π/2)
function sectorIndexAtPointer(rotation, n) {
  if (n <= 0) return 0;
  const seg = TAU / n;
  const pointerLocal = normalizeAngle(-Math.PI / 2 - rotation);
  let t = pointerLocal + Math.PI / 2;
  if (t >= TAU) t -= TAU;
  const idx = Math.floor(t / seg);
  return clamp(idx, 0, n - 1);
}

function computeEndRotation(current, n, winnerIndex, minFullTurns) {
  const seg = TAU / n;
  const midLocal = -Math.PI / 2 + (winnerIndex + 0.5) * seg;
  const base = -Math.PI / 2 - midLocal;
  const full = TAU;
  let m = Math.floor((current - base) / full) + minFullTurns;
  let end = base + m * full;
  for (let guard = 0; guard < 2000; guard++) {
    if (sectorIndexAtPointer(end, n) === winnerIndex) return end;
    m++;
    end = base + m * full;
  }
  return end;
}

// ---------------------------------------------------------------------------
// Состояние
// ---------------------------------------------------------------------------

/** @type {{ id: string, name: string, photo: string | null, sectorBg: string | null, sectorImage: string | null }[]} */
let participants = [];

/** id победителей по порядку */
let winnerIds = [];

let wheelRotation = 0;
let isSpinning = false;
let spinStart = 0;
let spinDuration = 0;
let spinFrom = 0;
let spinTo = 0;
let pendingWinnerIndex = -1;
let pendingEligibleIds = [];

/** После остановки: подсветка сектора до закрытия карточки */
let lockedHighlightIndex = -1;
/** Пока открыта карточка победителя — рисуем полный круг (включая выпавшего) */
let wheelRenderIds = null;
let dissolvePhase = 0;
let rebuildFlash = 0;

let wheelDpr = 1;
let imageCache = new Map();
let sectorImageCache = new Map();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const el = {
  bgCanvas: document.getElementById("bg-canvas"),
  wheelCanvas: document.getElementById("wheel-canvas"),
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
// Колесо: Canvas
// ---------------------------------------------------------------------------

const wheel = {
  ctx: null,
  size: 720,
};

function resizeWheelCanvas() {
  const wrap = el.wheelCanvas.parentElement;
  const css = Math.min(wrap.clientWidth, 520);
  wheelDpr = Math.min(window.devicePixelRatio || 1, 2);
  wheel.size = Math.floor(css * wheelDpr);
  el.wheelCanvas.width = wheel.size;
  el.wheelCanvas.height = wheel.size;
  wheel.ctx = el.wheelCanvas.getContext("2d");
  drawWheel();
}

function loadParticipantImage(p) {
  if (!p.photo) return Promise.resolve(null);
  if (imageCache.has(p.id)) return Promise.resolve(imageCache.get(p.id));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(p.id, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = p.photo;
  });
}

function loadSectorBackgroundImage(p) {
  if (!p.sectorImage) return Promise.resolve(null);
  if (sectorImageCache.has(p.id)) return Promise.resolve(sectorImageCache.get(p.id));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      sectorImageCache.set(p.id, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = p.sectorImage;
  });
}

/** object-fit: cover в круге радиуса r от центра (0,0) */
function drawImageCoverInWheelSector(ctx, img, r) {
  const d = r * 2;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(d / iw, d / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
}

const sectorColors = [
  ["#4a2fa8", "#7c5cff"],
  ["#006b5c", "#00e5c8"],
  ["#8a1a4a", "#ff4d8d"],
  ["#2a4a8a", "#4d9fff"],
  ["#6a4a00", "#ffc14d"],
  ["#3a6a3a", "#6dff8a"],
];

function drawWheelIds() {
  if (wheelRenderIds && wheelRenderIds.length) return [...wheelRenderIds];
  if (pendingEligibleIds.length) return [...pendingEligibleIds];
  return eligibleParticipants().map((p) => p.id);
}

function drawWheel() {
  const ctx = wheel.ctx;
  if (!ctx) return;
  const ids = drawWheelIds();
  const n = ids.length;
  const W = wheel.size;
  const cx = W / 2;
  const cy = W / 2;
  const r = W * 0.42;
  const innerR = W * 0.08;

  ctx.clearRect(0, 0, W, W);

  const dissolveAlpha =
    dissolvePhase > 0 && dissolvePhase < 1 ? 1 - 0.35 * easeInOutQuad(dissolvePhase) : 1;
  const dissolveScale =
    dissolvePhase > 0 && dissolvePhase < 1 ? 1 - 0.06 * easeInOutQuad(dissolvePhase) : 1;

  ctx.save();
  ctx.globalAlpha = dissolveAlpha;
  ctx.translate(cx, cy);
  ctx.scale(dissolveScale, dissolveScale);
  ctx.rotate(wheelRotation);

  if (n === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, TAU);
    const g = ctx.createRadialGradient(0, 0, innerR, 0, 0, r);
    g.addColorStop(0, "rgba(40, 44, 70, 0.9)");
    g.addColorStop(1, "rgba(20, 22, 40, 0.95)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `${W * 0.045}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.rotate(-wheelRotation);
    ctx.fillText("Добавьте участников", 0, 0);
    ctx.restore();
    return;
  }

  const seg = TAU / n;

  for (let i = 0; i < n; i++) {
    const pid = ids[i];
    const p = getParticipant(pid);
    const name = p ? p.name : "?";
    const start = -Math.PI / 2 + i * seg;
    const end = start + seg;
    const slotDefault = sectorColors[i % sectorColors.length];
    const dimOthers =
      lockedHighlightIndex >= 0 && lockedHighlightIndex !== i && !isSpinning;
    let c0;
    let c1;
    if (p && p.sectorBg) {
      [c0, c1] = sectorPairFromHex(p.sectorBg);
    } else {
      [c0, c1] = slotDefault;
    }
    if (dimOthers) {
      [c0, c1] = dimSectorPair(c0, c1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, start, end);
    ctx.closePath();
    ctx.clip();

    const sectorImg = p && p.sectorImage ? sectorImageCache.get(p.id) : null;
    const sectorImgReady = sectorImg && sectorImg.complete && sectorImg.naturalWidth;

    if (sectorImgReady) {
      ctx.globalAlpha = dimOthers ? 0.38 : 1;
      drawImageCoverInWheelSector(ctx, sectorImg, r);
      ctx.globalAlpha = 1;
      const mx = Math.cos(start + seg / 2) * r * 0.28;
      const my = Math.sin(start + seg / 2) * r * 0.28;
      const vg = ctx.createRadialGradient(0, 0, innerR, mx, my, r);
      if (dimOthers) {
        vg.addColorStop(0, "rgba(18, 20, 32, 0.72)");
        vg.addColorStop(0.55, "rgba(14, 16, 26, 0.82)");
        vg.addColorStop(1, "rgba(10, 12, 20, 0.92)");
      } else {
        vg.addColorStop(0, "rgba(8, 10, 20, 0.28)");
        vg.addColorStop(0.5, "rgba(6, 8, 18, 0.42)");
        vg.addColorStop(1, "rgba(4, 6, 14, 0.62)");
      }
      ctx.fillStyle = vg;
      ctx.fill();
    } else {
      const mg = ctx.createRadialGradient(0, 0, innerR, Math.cos(start + seg / 2) * r * 0.3, Math.sin(start + seg / 2) * r * 0.3, r);
      mg.addColorStop(0, dimOthers ? "#2a2d45" : c0);
      mg.addColorStop(1, dimOthers ? "#1a1c2e" : c1);
      ctx.fillStyle = mg;
      ctx.fill();
    }

    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, start, end);
    ctx.closePath();
    ctx.strokeStyle = dimOthers ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.2)";
    ctx.lineWidth = W * 0.004;
    ctx.stroke();

    const mid = start + seg / 2;
    ctx.save();
    ctx.rotate(mid);
    ctx.translate(r * 0.62, 0);

    const img = p && p.photo ? imageCache.get(p.id) : null;
    const avR = W * 0.055;
    if (img && img.complete && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -avR * 0.1, avR, 0, TAU);
      ctx.clip();
      const s = (avR * 2) / Math.max(img.width, img.height);
      ctx.globalAlpha = dimOthers ? 0.35 : 1;
      ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2 - avR * 0.1, img.width * s, img.height * s);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(0, -avR * 0.1, avR, 0, TAU);
      ctx.fillStyle = dimOthers ? "rgba(60,64,90,0.6)" : "rgba(255,255,255,0.15)";
      ctx.fill();
      ctx.fillStyle = dimOthers ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)";
      ctx.font = `700 ${W * 0.04}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((name || "?").charAt(0).toUpperCase(), 0, -avR * 0.1);
    }

    ctx.fillStyle = dimOthers ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
    const fontSize = clamp(W * 0.028, 10, n > 10 ? 22 : 26);
    ctx.font = `600 ${fontSize}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxChars = n > 12 ? 8 : 14;
    const label = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
    ctx.fillText(label, 0, avR * 1.35);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, TAU);
  const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
  hub.addColorStop(0, "#1e2138");
  hub.addColorStop(1, "#12141f");
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.strokeStyle = "rgba(124, 92, 255, 0.5)";
  ctx.lineWidth = W * 0.008;
  ctx.stroke();

  ctx.restore();

  if (lockedHighlightIndex >= 0 && lockedHighlightIndex < n && !isSpinning) {
    ctx.save();
    ctx.globalAlpha = dissolveAlpha;
    ctx.translate(cx, cy);
    ctx.scale(dissolveScale, dissolveScale);
    ctx.rotate(wheelRotation);
    const hi = lockedHighlightIndex;
    const start = -Math.PI / 2 + hi * seg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r + W * 0.012, start, start + seg);
    ctx.closePath();
    ctx.strokeStyle = "rgba(0, 229, 200, 0.85)";
    ctx.lineWidth = W * 0.014;
    ctx.shadowColor = "rgba(0, 229, 200, 0.9)";
    ctx.shadowBlur = W * 0.04;
    ctx.stroke();
    ctx.restore();
  }

  if (rebuildFlash > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = rebuildFlash * 0.35;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, W);
    ctx.restore();
  }
}

async function prefetchEligibleImages() {
  const ids = eligibleParticipants().map((p) => p.id);
  await Promise.all(
    ids.flatMap((id) => {
      const p = getParticipant(id);
      return [loadParticipantImage(p), loadSectorBackgroundImage(p)];
    })
  );
}

// ---------------------------------------------------------------------------
// Вращение
// ---------------------------------------------------------------------------

function startSpin() {
  if (!el.winnerOverlay.hidden || !el.modalParticipants.hidden) return;
  const elig = eligibleParticipants();
  if (isSpinning || elig.length < 1) return;

  const ids = elig.map((p) => p.id);
  pendingEligibleIds = [...ids];
  const n = ids.length;
  const winnerIndex = Math.floor(Math.random() * n);

  prefetchEligibleImages().then(() => {
    lockedHighlightIndex = -1;
    spinFrom = wheelRotation;
    spinTo = computeEndRotation(wheelRotation, n, winnerIndex, 5 + Math.floor(Math.random() * 4));
    spinDuration = 4800 + Math.random() * 900;
    spinStart = performance.now();
    isSpinning = true;
    pendingWinnerIndex = winnerIndex;
    updateUI();
    spinFrame();
  });
}

function spinFrame(now = performance.now()) {
  if (!isSpinning) return;
  const t = clamp((now - spinStart) / spinDuration, 0, 1);
  const e = easeOutCubic(t);
  wheelRotation = spinFrom + (spinTo - spinFrom) * e;
  drawWheel();

  if (t < 1) {
    requestAnimationFrame(spinFrame);
  } else {
    isSpinning = false;
    wheelRotation = spinTo;
    const ids = pendingEligibleIds;
    const n = ids.length;
    const widx = clamp(pendingWinnerIndex, 0, n - 1);
    const winnerId = ids[widx];
    wheelRenderIds = [...ids];
    lockedHighlightIndex = widx;
    winnerIds.push(winnerId);
    pendingEligibleIds = [];
    pendingWinnerIndex = -1;
    drawWheel();
    triggerWinEffects();
    showWinnerCard(winnerId, winnerIds.length);
    renderHistory();
    updateUI();
  }
}

function startDissolveToRebuild() {
  dissolvePhase = 0;
  const start = performance.now();
  function step(now) {
    dissolvePhase = clamp((now - start) / 720, 0, 1);
    drawWheel();
    if (dissolvePhase < 1) requestAnimationFrame(step);
    else {
      dissolvePhase = 0;
      rebuildFlash = 1;
      const t0 = performance.now();
      function flash(now2) {
        rebuildFlash = 1 - easeOutCubic(clamp((now2 - t0) / 380, 0, 1));
        drawWheel();
        if (rebuildFlash > 0.02) requestAnimationFrame(flash);
        else {
          rebuildFlash = 0;
          drawWheel();
        }
      }
      requestAnimationFrame(flash);
    }
  }
  requestAnimationFrame(step);
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

function showWinnerCard(winnerId, place) {
  const p = getParticipant(winnerId);
  if (!p) return;
  el.winnerPlace.textContent = `${place} место`;
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
  el.winnerCard.animate(
    [
      { transform: "scale(0.9) translateY(20px)", opacity: 0 },
      { transform: "scale(1) translateY(0)", opacity: 1 },
    ],
    { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
  );
}

function hideWinnerCard() {
  el.winnerOverlay.hidden = true;
  el.winnerOverlay.setAttribute("aria-hidden", "true");
  wheelRenderIds = null;
  lockedHighlightIndex = -1;
  drawWheel();
  startDissolveToRebuild();
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
    li.style.animationDelay = `${i * 0.04}s`;

    const place = document.createElement("div");
    place.className = "history-item-body";
    const placeLabel = document.createElement("div");
    placeLabel.className = "history-item-place";
    placeLabel.textContent = `${i + 1} место`;
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
  wheelRenderIds = null;
  lockedHighlightIndex = -1;
  dissolvePhase = 0;
  rebuildFlash = 0;
  renderHistory();
  drawWheel();
  updateUI();
}

// ---------------------------------------------------------------------------
// Сброс: участники остаются, история очищается
// ---------------------------------------------------------------------------

function resetRound() {
  if (isSpinning) return;
  winnerIds = [];
  wheelRenderIds = null;
  lockedHighlightIndex = -1;
  dissolvePhase = 0;
  rebuildFlash = 0;
  wheelRotation = 0;
  renderHistory();
  drawWheel();
  updateUI();
}

// ---------------------------------------------------------------------------
// UI состояние кнопок и подсказка
// ---------------------------------------------------------------------------

function updateUI() {
  const elig = eligibleParticipants();
  el.btnSpin.disabled = isSpinning || elig.length < 1;
  el.btnReset.disabled = isSpinning;
  el.btnClearHistory.disabled = winnerIds.length === 0;

  if (elig.length === 0) {
    el.wheelHint.textContent =
      "Все участники уже выпали — сбросьте раунд или добавьте новых.";
  } else if (isSpinning) {
    el.wheelHint.textContent = "Колесо крутится…";
  } else if (elig.length === 1) {
    el.wheelHint.textContent =
      "Один участник в розыгрыше — крутите для шоу; победитель всё равно будет он. Дальше сбросьте раунд или добавьте людей.";
  } else {
    el.wheelHint.textContent =
      "Нажмите «Крутить» или пробел. Победитель исключится из следующего спина.";
  }
}

// ---------------------------------------------------------------------------
// Модалка участников
// ---------------------------------------------------------------------------

function openParticipantsModal() {
  el.modalParticipants.hidden = false;
  el.modalParticipants.setAttribute("aria-hidden", "false");
  renderParticipantRows();
}

function closeParticipantsModal() {
  el.modalParticipants.hidden = true;
  el.modalParticipants.setAttribute("aria-hidden", "true");
  syncNamesFromInputs();
  imageCache.clear();
  sectorImageCache.clear();
  prefetchEligibleImages().then(drawWheel);
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
      drawWheel();
    });
    colorInput.disabled = Boolean(p.sectorImage);
    colorInput.title = p.sectorImage
      ? "Цвет отключён: активна картинка фона сектора"
      : "Цвет фона сектора (если нет картинки)";
    const autoColorBtn = document.createElement("button");
    autoColorBtn.type = "button";
    autoColorBtn.className = "mini-btn sector-auto";
    autoColorBtn.textContent = "Авто";
    autoColorBtn.title = "Цвет по палитре для позиции в списке";
    autoColorBtn.addEventListener("click", () => {
      p.sectorBg = null;
      colorInput.value = sectorColors[index % sectorColors.length][1];
      colorInput.disabled = Boolean(p.sectorImage);
      drawWheel();
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
    sectorFileLabel.title = "Картинка фона сектора на колесе";
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
        sectorImageCache.delete(p.id);
        loadSectorBackgroundImage(p).then(() => {
          renderParticipantRows();
          drawWheel();
        });
      };
      reader.readAsDataURL(f);
      ev.target.value = "";
    });
    sectorFileLabel.appendChild(sectorFile);

    const clearSectorBtn = document.createElement("button");
    clearSectorBtn.type = "button";
    clearSectorBtn.className = "mini-btn";
    clearSectorBtn.textContent = "◌";
    clearSectorBtn.title = "Убрать картинку фона сектора";
    clearSectorBtn.hidden = !p.sectorImage;
    clearSectorBtn.addEventListener("click", () => {
      p.sectorImage = null;
      sectorImageCache.delete(p.id);
      renderParticipantRows();
      drawWheel();
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
        imageCache.delete(p.id);
        renderParticipantRows();
        drawWheel();
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
      imageCache.delete(p.id);
      sectorImageCache.delete(p.id);
      renderParticipantRows();
      renderHistory();
      drawWheel();
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
      drawWheel();
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
  drawWheel();
  updateUI();
}

// ---------------------------------------------------------------------------
// События
// ---------------------------------------------------------------------------

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
  ];
}

function init() {
  seedParticipants();
  initBackground();
  requestAnimationFrame(bgStep);
  resizeWheelCanvas();
  prefetchEligibleImages().then(drawWheel);
  renderHistory();
  updateUI();
}

window.addEventListener("resize", () => {
  resizeBackground();
  resizeWheelCanvas();
});

init();
