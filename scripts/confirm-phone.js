const WEBHOOK_URL = 'https://hook.eu2.make.com/15sdp8heqq62udgrfmfquv4go2n9cbvs';
const CONTEXT_KEY = 'dolota_gift_context';
const VERIFIED_KEY = 'dolota_gift_verified';

const phoneInput = document.getElementById('phoneDisplay');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const codeSection = document.getElementById('codeSection');
const codeInput = document.getElementById('codeInput');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const statusEl = document.getElementById('confirmStatus');

let context = null;

function parseContext() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    return null;
  }
}

function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('ok', 'err');
  if (type) statusEl.classList.add(type);
}

function sanitizeCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4);
}

function toggleCodeSection(visible) {
  if (!codeSection) return;
  if (visible) {
    codeSection.classList.remove('hidden');
    codeSection.setAttribute('aria-hidden', 'false');
  } else {
    codeSection.classList.add('hidden');
    codeSection.setAttribute('aria-hidden', 'true');
  }
}

async function callWebhook(body) {
  const response = await fetch(WEBHOOK_URL, {
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

function init() {
  context = parseContext();
  if (!context || !context.leadId || (!context.phoneDigits && !context.phoneDisplay)) {
    setStatus('Не знайдено даних для підтвердження. Поверніться до форми та натисніть «Отримати подарунок».', 'err');
    if (sendCodeBtn) sendCodeBtn.disabled = true;
    return;
  }

  const displayValue = context.phoneDisplay || (context.phoneDigits ? `+38${context.phoneDigits}` : '');
  if (phoneInput) {
    phoneInput.value = displayValue;
  }

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = sanitizeCode(codeInput.value);
    });
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (verifyCodeBtn && !verifyCodeBtn.disabled) {
          verifyCodeBtn.click();
        }
      }
    });
  }

  if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', async () => {
      if (!context) return;
      try {
        sendCodeBtn.disabled = true;
        setStatus('Надсилаємо код підтвердження…');
        const payload = {
          action: 'send_code',
          leadId: context.leadId,
          phone: displayValue,
          phoneDigits: context.phoneDigits || null,
        };
        await callWebhook(payload);
        toggleCodeSection(true);
        setStatus('Код надіслано. Введіть 4 цифри з повідомлення.', 'ok');
        if (codeInput) {
          codeInput.focus();
        }
      } catch (err) {
        setStatus('Не вдалося надіслати код. Спробуйте ще раз.', 'err');
      } finally {
        sendCodeBtn.disabled = false;
      }
    });
  }

  if (verifyCodeBtn) {
    verifyCodeBtn.addEventListener('click', async () => {
      if (!context) return;
      const code = sanitizeCode(codeInput ? codeInput.value : '');
      if (code.length !== 4) {
        setStatus('Введіть 4-значний код підтвердження.', 'err');
        if (codeInput) codeInput.focus();
        return;
      }
      try {
        verifyCodeBtn.disabled = true;
        if (sendCodeBtn) sendCodeBtn.disabled = true;
        setStatus('Перевіряємо код…');
        const payload = {
          action: 'verify_code',
          leadId: context.leadId,
          phone: displayValue,
          code,
        };
        const response = await callWebhook(payload);
        const confirmationValue = (() => {
          if (!response) return '';
          if (typeof response === 'string') return response;
          if (typeof response === 'object') {
            const value = response['підтвердження'];
            return typeof value === 'string' ? value : '';
          }
          return '';
        })();
        if (String(confirmationValue).toLowerCase() === 'true') {
          const verifiedPayload = {
            ...context,
            code,
            verifiedAt: new Date().toISOString(),
          };
          sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
          setStatus('Номер підтверджено! Переходимо до колеса фортуни…', 'ok');
          setTimeout(() => {
            window.location.href = 'fortune-wheel.html';
          }, 1200);
        } else {
          setStatus('Код не підходить. Перевірте цифри та спробуйте ще раз.', 'err');
          if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
          }
        }
      } catch (err) {
        setStatus('Сталася помилка під час перевірки. Спробуйте пізніше.', 'err');
      } finally {
        verifyCodeBtn.disabled = false;
        if (sendCodeBtn) sendCodeBtn.disabled = false;
      }
    });
  }
}

init();
