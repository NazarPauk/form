const WEBHOOK_URL = 'https://hook.eu2.make.com/15sdp8heqq62udgrfmfquv4go2n9cbvs';
const STATUS_WEBHOOK_URL = 'https://hook.eu2.make.com/frvapm5gb7i4ss8selrcpxnhqei35iit';
const CONTEXT_KEY = 'dolota_gift_context';
const VERIFIED_KEY = 'dolota_gift_verified';

const phoneInput = document.getElementById('phoneDisplay');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const codeSection = document.getElementById('codeSection');
const codeInput = document.getElementById('codeInput');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const resendCodeWrapper = document.getElementById('resendCodeWrapper');
const resendCodeLink = document.getElementById('resendCodeLink');

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


function toggleResendLink(visible) {
  if (!resendCodeWrapper) return;
  if (visible) {
    resendCodeWrapper.classList.remove('hidden');
    resendCodeWrapper.setAttribute('aria-hidden', 'false');
  } else {
    resendCodeWrapper.classList.add('hidden');
    resendCodeWrapper.setAttribute('aria-hidden', 'true');
  }
}

function hideSendCodeButton() {
  if (!sendCodeBtn) return;
  sendCodeBtn.classList.add('hidden');
  sendCodeBtn.setAttribute('aria-hidden', 'true');
}

function showSendCodeButton() {
  if (!sendCodeBtn) return;
  sendCodeBtn.classList.remove('hidden');
  sendCodeBtn.removeAttribute('aria-hidden');
}

async function sendVerificationCode({ resend = false, displayValue }) {
  if (!context) return;
  const payload = {
    action: 'send_code',
    leadId: context.leadId,
    phone: displayValue,
    phoneDigits: context.phoneDigits || null,
  };

  if (resend) {
    if (resendCodeLink) resendCodeLink.disabled = true;
    setStatus('Надсилаємо код повторно…');
  } else {
    if (sendCodeBtn) {
      sendCodeBtn.disabled = true;
      hideSendCodeButton();
    }
    setStatus('Надсилаємо код підтвердження…');
  }

  try {
    await callWebhook(payload);
    toggleCodeSection(true);
    toggleResendLink(true);
    setStatus(resend ? 'Код повторно надіслано. Перевірте повідомлення.' : 'Код надіслано. Введіть 4 цифри з повідомлення.', 'ok');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } catch (err) {
    setStatus('Не вдалося надіслати код. Спробуйте ще раз.', 'err');
    if (!resend && sendCodeBtn) {
      showSendCodeButton();
    }
  } finally {
    if (sendCodeBtn) sendCodeBtn.disabled = false;
    if (resendCodeLink) resendCodeLink.disabled = false;
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

async function callStatusWebhook(body) {
  const response = await fetch(STATUS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Status webhook failed with ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function extractStatusValue(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response === 'object') {
    const value = response['статус'] ?? response.status;
    return typeof value === 'string' ? value : '';
  }
  return '';
}

function handleInitialStatus(statusValue, displayValue) {
  const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : '';
  const positiveMessage = 'Ви вже виграли подарунок! Для отримання зверніться до менеджера.';
  const receivedMessage = 'Подарунок вже отримано. Якщо маєте питання — зверніться до менеджера.';

  if (normalized === 'виграв') {
    hideSendCodeButton();
    toggleCodeSection(false);
    toggleResendLink(false);
    if (sendCodeBtn) sendCodeBtn.disabled = true;
    sessionStorage.removeItem(VERIFIED_KEY);
    setStatus(positiveMessage, 'warn');
    return false;
  }

  if (normalized === 'отримав') {
    hideSendCodeButton();
    toggleCodeSection(false);
    toggleResendLink(false);
    if (sendCodeBtn) sendCodeBtn.disabled = true;
    sessionStorage.removeItem(VERIFIED_KEY);
    setStatus(receivedMessage, 'ok');
    return false;
  }

  if (normalized === 'підтверджений') {
    hideSendCodeButton();
    toggleCodeSection(false);
    toggleResendLink(false);
    const verifiedPayload = {
      ...context,
      phoneDisplay: displayValue,
      verifiedAt: new Date().toISOString(),
      preVerified: true,
    };
    sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
    setStatus('Номер вже підтверджено. Відкриваємо колесо фортуни…', 'ok');
    setTimeout(() => {
      window.location.replace('fortune-wheel.html');
    }, 900);
    return false;
  }

  if (normalized === 'не брав участі' || normalized === 'не підтверджений' || normalized === '') {
    showSendCodeButton();
    toggleCodeSection(false);
    toggleResendLink(false);
    sessionStorage.removeItem(VERIFIED_KEY);
    setStatus('Натисніть «Надіслати код підтвердження», щоб продовжити.', '');
    return true;
  }

  showSendCodeButton();
  toggleCodeSection(false);
  toggleResendLink(false);
  sessionStorage.removeItem(VERIFIED_KEY);
  setStatus('', '');
  return true;
}

async function requestInitialStatus(displayValue) {
  if (!context) return;
  let enableSendButton = true;
  try {
    setStatus('Перевіряємо статус участі…');
    if (sendCodeBtn) sendCodeBtn.disabled = true;
    const payload = {
      phone: displayValue,
      phoneDigits: context.phoneDigits || null,
      leadId: context.leadId || null,
    };
    const response = await callStatusWebhook(payload);
    const statusValue = extractStatusValue(response);
    enableSendButton = handleInitialStatus(statusValue, displayValue);
  } catch (err) {
    enableSendButton = true;
    showSendCodeButton();
    toggleCodeSection(false);
    toggleResendLink(false);
    setStatus('Не вдалося отримати статус участі. Оновіть сторінку або спробуйте пізніше.', 'err');
  } finally {
    if (sendCodeBtn) sendCodeBtn.disabled = !enableSendButton;
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

  showSendCodeButton();
  toggleCodeSection(false);
  toggleResendLink(false);
  if (sendCodeBtn) sendCodeBtn.disabled = true;
  requestInitialStatus(displayValue);

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

      await sendVerificationCode({ resend: false, displayValue });
    });
  }

  if (resendCodeLink) {
    resendCodeLink.addEventListener('click', async () => {
      if (!context) return;
      await sendVerificationCode({ resend: true, displayValue });
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
