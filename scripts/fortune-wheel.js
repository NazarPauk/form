const PRIZE_WEBHOOK_URL = 'https://hook.eu2.make.com/tru0i39wnyegjkfjkw2ae1xs5wt9mnne';
const CONTEXT_KEY = 'dolota_gift_context';
const VERIFIED_KEY = 'dolota_gift_verified';
const SPIN_HISTORY_KEY = 'dolota_gift_spin_history';

const wheelFace = document.getElementById('wheelFace');
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const spinBtn = document.getElementById('spinBtn');
const statusEl = document.getElementById('wheelStatus');
const phoneInfoEl = document.getElementById('phoneInfo');
const modal = document.getElementById('resultModal');
const overlay = document.getElementById('modalOverlay');
const modalText = document.getElementById('modalText');
const claimPrizeBtn = document.getElementById('claimPrizeBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

const pointerAngleDeg = -90;
const idleClass = 'idle-spin';
const colors = ['#10192d', '#142339', '#182d47', '#12263f', '#0f1c31'];
const placeholderPrizes = Array.from({ length: 5 }, () => ({ name: '', count: 1 }));

let context = null;
let currentSegments = [];
let isSpinning = false;
let hasCompletedSpin = false;
let selectedPrize = null;

function parseSessionItem(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    return null;
  }
}

function loadSpinHistory() {
  try {
    const raw = localStorage.getItem(SPIN_HISTORY_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

function saveSpinHistory(history) {
  try {
    localStorage.setItem(SPIN_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    /* noop */
  }
}

function updateStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('ok', 'err');
  if (type) statusEl.classList.add(type);
}

function sanitizePrizeName(name, index) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || `Подарунок ${index + 1}`;
}

function parsePrizeResponse(data) {
  const prizes = [];
  for (let i = 1; i <= 5; i += 1) {
    const nameKey = `приз_${i}_назва`;
    const countKey = `приз_${i}_кількість`;
    const rawName = data ? data[nameKey] : null;
    const rawCount = data ? data[countKey] : null;
    const name = sanitizePrizeName(rawName, i - 1);
    const count = Number(rawCount);
    prizes.push({ name, count: Number.isFinite(count) ? Math.max(0, count) : 0 });
  }
  return prizes;
}

function computeSegments(prizeItems) {
  if (!prizeItems || !prizeItems.length) return [];
  const totalCount = prizeItems.reduce((sum, item) => sum + (item.count || 0), 0);
  const baseShare = totalCount > 0 ? null : 1 / prizeItems.length;
  let currentAngle = -Math.PI / 2;
  return prizeItems.map((item, index) => {
    const share = totalCount > 0 ? (item.count || 0) / totalCount : baseShare;
    const segmentAngle = share * Math.PI * 2;
    const startAngle = currentAngle;
    let endAngle = startAngle + segmentAngle;
    if (index === prizeItems.length - 1) {
      endAngle = -Math.PI / 2 + Math.PI * 2;
    }
    currentAngle = endAngle;
    return {
      ...item,
      probability: share,
      startAngle,
      endAngle,
      centerAngle: startAngle + (endAngle - startAngle) / 2,
    };
  });
}

function wrapText(ctxRef, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    if (ctxRef.measureText(tentative).width <= maxWidth) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawWheel(segments) {
  if (!ctx || !canvas) return;
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 6;
  ctx.clearRect(0, 0, size, size);
  segments.forEach((segment, index) => {
    const start = segment.startAngle;
    const end = segment.endAngle;
    if (!(end > start)) return;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.stroke();

    const angle = start + (end - start) / 2;
    const textRadius = radius * 0.6;
    ctx.save();
    ctx.translate(center + Math.cos(angle) * textRadius, center + Math.sin(angle) * textRadius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '600 18px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, segment.name, 140);
    const lineHeight = 20;
    const offset = ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, 0, idx * lineHeight - offset);
    });
    ctx.restore();
  });
}

function weightedChoice(segments) {
  if (!segments || !segments.length) return null;
  const total = segments.reduce((sum, seg) => sum + (seg.count || 0), 0);
  if (total <= 0) {
    const index = Math.floor(Math.random() * segments.length);
    return segments[index];
  }
  let threshold = Math.random() * total;
  for (const seg of segments) {
    threshold -= seg.count || 0;
    if (threshold <= 0) return seg;
  }
  return segments[segments.length - 1];
}

async function callPrizeWebhook(body) {
  const response = await fetch(PRIZE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function stopIdleAnimation() {
  if (!wheelFace) return;
  wheelFace.classList.remove(idleClass);
  wheelFace.style.animation = 'none';
  // force reflow to apply transition later
  void wheelFace.offsetWidth;
}

function resetWheel() {
  if (!wheelFace) return;
  wheelFace.classList.remove('spinning');
  wheelFace.style.transition = 'none';
  wheelFace.style.transform = 'rotate(0deg)';
  wheelFace.offsetWidth; // force reflow
  wheelFace.classList.add(idleClass);
  wheelFace.style.animation = '';
  currentSegments = computeSegments(placeholderPrizes);
  drawWheel(currentSegments);
}

function openModal(message) {
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  if (modalText) modalText.textContent = message;
  if (claimPrizeBtn) {
    claimPrizeBtn.disabled = false;
    claimPrizeBtn.focus({ preventScroll: true });
  }
}

function closeModal() {
  if (modal) modal.classList.add('hidden');
  if (overlay) overlay.classList.add('hidden');
}

function handleSpinHistory(phoneKey, status) {
  const history = loadSpinHistory();
  history[phoneKey] = status;
  saveSpinHistory(history);
}

async function startSpin() {
  if (isSpinning || hasCompletedSpin || !context || !wheelFace) return;
  isSpinning = true;
  updateStatus('Отримуємо перелік призів…');
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.textContent = 'Очікуйте…';
  }
  try {
    const requestPayload = {
      призи: 'пошук',
      leadId: context.leadId || null,
      phone: context.phoneDisplay || null,
    };
    const response = await callPrizeWebhook(requestPayload);
    const prizeData = parsePrizeResponse(response || {});
    currentSegments = computeSegments(prizeData);
    if (!currentSegments.length) {
      throw new Error('no_segments');
    }
    drawWheel(currentSegments);
    selectedPrize = weightedChoice(currentSegments);
    if (!selectedPrize) {
      throw new Error('no_prize');
    }
    updateStatus('Запускаємо колесо…');
    stopIdleAnimation();
    const spins = 6;
    const centerDeg = (selectedPrize.centerAngle * 180) / Math.PI;
    let targetDeg = spins * 360 + (pointerAngleDeg - centerDeg);
    while (targetDeg < 0) {
      targetDeg += 360;
    }
    wheelFace.classList.add('spinning');
    requestAnimationFrame(() => {
      if (!wheelFace) return;
      wheelFace.style.transition = 'transform 5.5s cubic-bezier(0.17, 0.67, 0.32, 1.34)';
      wheelFace.style.transform = `rotate(${targetDeg}deg)`;
    });
    wheelFace.addEventListener(
      'transitionend',
      () => {
        wheelFace.style.transition = 'none';
        hasCompletedSpin = true;
        isSpinning = false;
        updateStatus(`Вітаємо! Ви отримали: ${selectedPrize.name}.`, 'ok');
        setTimeout(() => {
          openModal(`Ви виграли «${selectedPrize.name}». Натисніть, щоб отримати подарунок.`);
        }, 3000);
      },
      { once: true },
    );
  } catch (err) {
    updateStatus('Не вдалося отримати дані про призи. Спробуйте ще раз пізніше.', 'err');
    if (spinBtn) {
      spinBtn.disabled = false;
      spinBtn.textContent = 'Крутити колесо';
    }
    if (wheelFace) {
      wheelFace.classList.add(idleClass);
      wheelFace.style.animation = '';
    }
    isSpinning = false;
  }
}

async function claimPrize(phoneKey) {
  if (!selectedPrize || !context) return;
  try {
    if (claimPrizeBtn) claimPrizeBtn.disabled = true;
    updateStatus('Перевіряємо наявність подарунку…');
    const payload = {
      приз: selectedPrize.name,
      leadId: context.leadId || null,
      phone: context.phoneDisplay || null,
    };
    const response = await callPrizeWebhook(payload);
    const statusValue = (() => {
      if (!response) return '';
      if (typeof response === 'string') return response;
      if (typeof response === 'object') {
        const val = response['статус'];
        return typeof val === 'string' ? val : '';
      }
      return '';
    })();
    const normalized = statusValue.trim().toLowerCase();
    if (normalized === 'наявний') {
      handleSpinHistory(phoneKey, 'complete');
      sessionStorage.removeItem(CONTEXT_KEY);
      sessionStorage.removeItem(VERIFIED_KEY);
      updateStatus(`Ваш подарунок «${selectedPrize.name}» очікує на вас у Telegram.`, 'ok');
      closeModal();
      const targetLink = context.telegramLink || 'https://t.me/dolota_pr_bot';
      setTimeout(() => {
        window.location.href = targetLink;
      }, 600);
    } else {
      updateStatus('На жаль, подарунки цього типу закінчилися. Спробуйте інший шанс!', 'err');
      closeModal();
      selectedPrize = null;
      hasCompletedSpin = false;
      isSpinning = false;
      if (spinBtn) {
        spinBtn.disabled = false;
        spinBtn.textContent = 'Крутити колесо';
      }
      if (claimPrizeBtn) {
        claimPrizeBtn.disabled = false;
      }
      resetWheel();
    }
  } catch (err) {
    updateStatus('Не вдалося підтвердити подарунок. Спробуйте ще раз.', 'err');
    if (claimPrizeBtn) claimPrizeBtn.disabled = false;
  }
}

function init() {
  context = parseSessionItem(VERIFIED_KEY);
  if (!context) {
    updateStatus('Спочатку підтвердьте номер телефону, щоб отримати доступ до колеса фортуни.', 'err');
    if (spinBtn) spinBtn.disabled = true;
    setTimeout(() => {
      window.location.href = 'confirm-phone.html';
    }, 1800);
    return;
  }
  const displayValue = context.phoneDisplay || (context.phoneDigits ? `+38${context.phoneDigits}` : '');
  if (phoneInfoEl) {
    phoneInfoEl.textContent = `Підтверджений номер: ${displayValue}`;
  }
  const phoneKey = context.phoneDigits || displayValue;
  const history = loadSpinHistory();
  if (history[phoneKey] === 'complete') {
    hasCompletedSpin = true;
    if (spinBtn) {
      spinBtn.disabled = true;
      spinBtn.textContent = 'Участь вже взята';
    }
    updateStatus('Цей номер вже використав свій шанс у розіграші.', 'ok');
  }
  currentSegments = computeSegments(placeholderPrizes);
  drawWheel(currentSegments);

  if (spinBtn) {
    spinBtn.addEventListener('click', () => startSpin());
  }
  if (claimPrizeBtn) {
    claimPrizeBtn.addEventListener('click', () => claimPrize(phoneKey));
  }
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      closeModal();
      if (!hasCompletedSpin) {
        if (spinBtn) spinBtn.disabled = false;
      }
    });
  }
  if (overlay) {
    overlay.addEventListener('click', closeModal);
  }
}

init();
