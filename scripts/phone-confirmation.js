
const SMS_FLY_ENDPOINT = 'https://api.sms-fly.com/api/v2/handler';
const SMS_FLY_API_KEY = '0wYXQJWU5CzJpaKeHG4PkbwBh3kl9cs4';
const SMS_FLY_SENDER = 'DOLOTA';

const PHONE_PREFIX = '+38';

const form = document.getElementById('smsConfirmForm');
const phoneDisplay = document.getElementById('phoneDisplay');
const sendSmsBtn = document.getElementById('sendSmsBtn');
const statusEl = document.getElementById('status');
const codeEntry = document.getElementById('codeEntry');
const codeInput = document.getElementById('codeInput');
const confirmBtn = document.getElementById('confirmBtn');

function formatPhone(digits) {
  if (!digits) return '';
  const cleaned = String(digits).replace(/\D/g, '').slice(-10);
  return `${PHONE_PREFIX} ${cleaned.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')}`.trim();
}

function parseParams() {
  const params = new URLSearchParams(location.search);
  const phone = params.get('phone') || '';
  const leadId = params.get('leadId') || '';
  const token = params.get('token') || '';
  const expected = phone && leadId ? btoa(`${phone}:${leadId}`) : '';
  if (!phone || !leadId || !token || token !== expected) {
    throw new Error('Передано некоректні дані.');
  }
  return { phone, leadId, token };
}

let ctx;
try {
  ctx = parseParams();
  phoneDisplay.value = formatPhone(ctx.phone);
} catch (err) {
  if (statusEl) {
    statusEl.textContent = err.message;
    statusEl.className = 'status err';
  }
  if (sendSmsBtn) sendSmsBtn.disabled = true;
  if (confirmBtn) confirmBtn.disabled = true;
}

function setStatus(msg, type = '') {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.className = type ? `status ${type}` : 'status';
}

function buildSmsPayload(code) {
  if (!ctx) throw new Error('Контекст не ініціалізовано.');
  const phone = `38${ctx.phone}`;
  return {
    auth: { key: SMS_FLY_API_KEY },
    action: 'SENDMESSAGE',
    data: {
      channel: 'SMS',
      phone: [phone],
      sms: {
        source: SMS_FLY_SENDER,
        ttl: 0,
        text: `Ваш код підтвердження: ${code}`,
        flash: 0,
      },
    },
  };
}

async function sendSmsViaSmsFly(code) {
  const response = await fetch(SMS_FLY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSmsPayload(code)),
  });

  if (!response.ok) {
    throw new Error(`Помилка запиту: ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || payload.success !== 1) {
    const description = payload && payload.description ? `: ${payload.description}` : '';
    throw new Error(`SMS не надіслано${description}`);
  }
  return payload;
}

let smsSent = false;
let expectedCode = null;
let codeExpiresAt = 0;

if (sendSmsBtn && ctx) {
  sendSmsBtn.addEventListener('click', async () => {
    if (smsSent) return;
    try {
      sendSmsBtn.disabled = true;
      setStatus('Відправляємо SMS…', '');

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await sendSmsViaSmsFly(code);
      expectedCode = code;
      codeExpiresAt = Date.now() + 5 * 60 * 1000;

      smsSent = true;
      setStatus('SMS успішно відправлено. Введіть код з повідомлення.', 'ok');
      codeEntry.hidden = false;
      confirmBtn.disabled = false;
      codeInput.focus();
    } catch (err) {
      sendSmsBtn.disabled = false;
      setStatus(err.message || 'Не вдалося надіслати SMS. Спробуйте пізніше.', 'err');
    }
  });
}

if (form && ctx) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    if (!smsSent || !expectedCode) {
      setStatus('Спершу надішліть SMS з кодом.', 'err');
      return;
    }
    const code = (codeInput.value || '').trim();
    if (code.length < 3) {
      setStatus('Код має містити щонайменше 3 цифри.', 'err');
      return;
    }

    if (Date.now() > codeExpiresAt) {
      setStatus('Час дії коду вичерпано. Надішліть SMS повторно.', 'err');
      confirmBtn.disabled = false;
      sendSmsBtn.disabled = false;
      smsSent = false;
      expectedCode = null;
      return;
    }
    if (code !== expectedCode) {
      setStatus('Введений код не збігається. Перевірте SMS та спробуйте знову.', 'err');
      confirmBtn.disabled = false;
      return;
    }
    try {
      confirmBtn.disabled = true;
      setStatus('Перевіряємо код…', '');

      setStatus('Номер успішно підтверджено! Перехід до розіграшу…', 'ok');
      sessionStorage.setItem(
        'dolota_wheel_access',
        JSON.stringify({ leadId: ctx.leadId, phone: ctx.phone, token: ctx.token, ts: Date.now() }),
      );
      const wheelUrl = new URL('wheel.html', location.href);
      wheelUrl.searchParams.set('leadId', ctx.leadId);
      wheelUrl.searchParams.set('phone', ctx.phone);
      wheelUrl.searchParams.set('token', ctx.token);
      setTimeout(() => {
        location.href = wheelUrl.toString();
      }, 600);
    } catch (err) {
      confirmBtn.disabled = false;
      setStatus(err.message || 'Код не підтверджено. Спробуйте ще раз.', 'err');
    }
  });
}

if (codeInput) {
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  });
}
