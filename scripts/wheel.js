const GIFTS = [
  { label: 'Знижка 10% на обладнання', color: '#ff7a18' },
  { label: 'Фірмовий худі DOLOTA', color: '#fbd786' },
  { label: 'Сертифікат на сервіс', color: '#c6ffdd' },
  { label: 'Набір сувенірів', color: '#6dd5fa' },
  { label: 'Безкоштовна доставка', color: '#f7797d' },
];

const WHEEL_WEBHOOK = 'https://hook.eu2.make.com/tru0i39wnyegjkfjkw2ae1xs5wt9mnne';
const TELEGRAM_BOT_URL = 'https://t.me/dolota_pr_bot';

const wheelEl = document.getElementById('wheel');
const spinBtn = document.getElementById('spinBtn');
const statusEl = document.getElementById('wheelStatus');
const resultEl = document.getElementById('result');
const modal = document.getElementById('prizeModal');
const modalText = document.getElementById('modalText');
const claimBtn = document.getElementById('claimBtn');
const closeModalBtn = document.getElementById('closeModal');

function parseParams() {
  const params = new URLSearchParams(location.search);
  const phone = params.get('phone') || '';
  const leadId = params.get('leadId') || '';
  const token = params.get('token') || '';
  const expected = phone && leadId ? btoa(`${phone}:${leadId}`) : '';
  if (!phone || !leadId || !token || token !== expected) {
    throw new Error('Відсутні дані для участі у розіграші.');
  }
  return { phone, leadId, token };
}

function restoreAccess() {
  try {
    const raw = sessionStorage.getItem('dolota_wheel_access');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.phone || !parsed.leadId) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = type ? `status ${type}` : 'status';
}

let ctx;
try {
  ctx = parseParams();
  const access = restoreAccess();
  if (!access || access.phone !== ctx.phone || access.leadId !== ctx.leadId) {
    throw new Error('Не знайдено підтвердження номера телефону.');
  }
} catch (err) {
  setStatus(err.message, 'err');
  if (spinBtn) spinBtn.disabled = true;
}

function buildWheelSegments() {
  if (!wheelEl) return;
  const segmentAngle = 360 / GIFTS.length;
  let gradientStops = '';
  GIFTS.forEach((gift, index) => {
    const start = index * segmentAngle;
    const end = start + segmentAngle;
    gradientStops += `${gift.color} ${start}deg ${end}deg`;
    if (index !== GIFTS.length - 1) gradientStops += ', ';
  });
  wheelEl.style.background = `conic-gradient(${gradientStops})`;
}

buildWheelSegments();

let isSpinning = false;
let currentRotation = 0;

function getSpinKey() {
  if (!ctx) return null;
  return `dolota_wheel_spin_${ctx.phone}`;
}

function hasSpunBefore() {
  const key = getSpinKey();
  if (!key) return false;
  try {
    return Boolean(localStorage.getItem(key));
  } catch (e) {
    return false;
  }
}

function markSpin(prize) {
  const key = getSpinKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ prize, ts: Date.now(), leadId: ctx.leadId }));
  } catch (e) {
    /* ignore */
  }
}

async function sendPrize(prize) {
  if (!ctx) return;
  try {
    await fetch(WHEEL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'wheel_spin',
        leadId: ctx.leadId,
        phone: `+38${ctx.phone}`,
        prize,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    /* noop */
  }
}

function openModal(prize) {
  if (!modal || !modalText || !claimBtn) return;
  modalText.textContent = `Ваш приз: ${prize}. Натисніть, щоб забрати його у чат-боті.`;
  claimBtn.href = `${TELEGRAM_BOT_URL}?start=${encodeURIComponent(ctx.leadId)}`;
  modal.hidden = false;
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    modal.hidden = true;
  });
}

function spinWheel() {
  if (!ctx) {
    setStatus('Дані доступу відсутні.', 'err');
    return;
  }
  if (hasSpunBefore()) {
    setStatus('Цей номер вже брав участь у розіграші.', 'err');
    return;
  }
  if (isSpinning) return;
  isSpinning = true;
  setStatus('Колесо обертається…');
  const segmentAngle = 360 / GIFTS.length;
  const selectedIndex = Math.floor(Math.random() * GIFTS.length);
  const targetAngle = 360 - (selectedIndex * segmentAngle + segmentAngle / 2);
  const spins = 5;
  currentRotation = spins * 360 + targetAngle;
  wheelEl.style.transform = `rotate(${currentRotation}deg)`;

  const onTransitionEnd = () => {
    wheelEl.removeEventListener('transitionend', onTransitionEnd);
    const prize = GIFTS[selectedIndex].label;
    setStatus('Вітаємо! Ви виграли приз.', 'ok');
    resultEl.textContent = `Ваш приз: ${prize}`;
    markSpin(prize);
    sendPrize(prize);
    if (spinBtn) spinBtn.disabled = true;
    setTimeout(() => openModal(prize), 3000);
  };

  wheelEl.addEventListener('transitionend', onTransitionEnd, { once: true });
}

if (spinBtn) {
  spinBtn.addEventListener('click', spinWheel);
  if (hasSpunBefore()) {
    spinBtn.disabled = true;
    setStatus('Цей номер вже брав участь у розіграші.', 'err');
  }
}
