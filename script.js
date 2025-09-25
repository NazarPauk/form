// === Налаштування ===
function genLeadId() {
  try {
    if (crypto && crypto.randomUUID) return 'ld_' + crypto.randomUUID();
  } catch (e) {}
  return 'ld_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

window.__leadId = null;
const WEBHOOK_URL = "https://hook.eu2.make.com/1eugiujlu8s20qptl3cgj49bikwkcrqc";

// === Елементи ===
const form = document.getElementById('leadForm');
const statusEl = document.getElementById('status');
const btn = document.getElementById('submitBtn');
const catalogs = document.getElementById('catalogs');

// === Відправка подій (трекінг) ===
async function track(eventName, data) {
  try {
    const params = new URLSearchParams(location.search);
    const tag = params.get('tag') || 'nfc_unknown';
    const body = Object.assign({ event: eventName, leadId: window.__leadId || null, tag, ts: new Date().toISOString() }, data || {});
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (e) {
    /* noop */
  }
}

// === UTM/Geo helpers ===
const UTM_BASE = { source: 'nfc', medium: 'booth', campaign: 'expo_2025' };
const TAG_UTM_MAP = {
  A1X9: { content: 'zone_a1', term: 'left_pillar' },
  B2Y3: { content: 'zone_b2', term: 'rig_demo' },
};
function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

// Wait for user to confirm geolocation permission and try to acquire position (up to 15s)
function getGeoWait(maxWaitMs = 15000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let done = false;
    const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs };
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, maxWaitMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc_m: pos.coords.accuracy });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
      opts,
    );
  });
}

async function getGeoPermissionState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return null;
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return (p && p.state) || null;
  } catch (_) {
    return null;
  }
}

async function buildUtm() {
  try {
    if (statusEl) {
      statusEl.textContent = 'Будь ласка, підтвердьте доступ до геолокації…';
      statusEl.className = 'status';
    }
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') || 'nfc_unknown';
  const geo = await getGeoWait(15000).catch(() => null);
  const now = new Date();
  const tb = timeBucket(now);
  const map = TAG_UTM_MAP[tag] || { content: `zone_${tag}`, term: 'generic' };
  const utm = {
    utm_source: UTM_BASE.source,
    utm_medium: UTM_BASE.medium,
    utm_campaign: UTM_BASE.campaign,
    utm_content: `${map.content}_${tb}`,
    utm_term: map.term,
  };
  return { utm, geo, tag, iso: now.toISOString(), tz: getTimezone() };
}

function augmentCatalogLinks(meta) {
  try {
    const links = document.querySelectorAll('#catalogs a[href]');
    links.forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const url = new URL(href, location.href);
      Object.entries(meta.utm || {}).forEach(([k, v]) => url.searchParams.set(k, v));
      if (meta.geo && typeof meta.geo.lat === 'number') {
        url.searchParams.set('lat', String(meta.geo.lat));
        url.searchParams.set('lon', String(meta.geo.lon));
        url.searchParams.set('acc_m', String(meta.geo.acc_m));
      }
      url.searchParams.set('tag', meta.tag || 'nfc_unknown');
      url.searchParams.set('tz', meta.tz || 'UTC');
      url.searchParams.set('ts', meta.iso || new Date().toISOString());
      a.setAttribute('href', url.toString());
    });
  } catch (e) {
    /* noop */
  }
}

// === ТЕХНІЧНІ ДАНІ КЛІЄНТА ===
async function collectTech() {
  const nav = navigator || {};
  const scr = screen || {};
  const doc = document || {};
  const con = nav && nav.connection ? nav.connection : {};
  const mem = nav.deviceMemory;
  const hw = nav.hardwareConcurrency;
  const tz = Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const uaCH =
    nav.userAgentData && nav.userAgentData.getHighEntropyValues
      ? await nav.userAgentData
          .getHighEntropyValues(['architecture', 'bitness', 'model', 'platform', 'platformVersion', 'uaFullVersion', 'fullVersionList'])
          .catch(() => null)
      : null;
  let battery = null;
  try {
    if (nav.getBattery) {
      battery = await nav.getBattery();
    }
  } catch (e) {}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    url: location.href,
    referrer: doc.referrer || null,
    lang: nav.language,
    languages: nav.languages,
    tz,
    userAgent: nav.userAgent,
    uaData: uaCH || null,
    platform: nav.platform,
    vendor: nav.vendor,
    cookiesEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    screen: {
      width: scr.width,
      height: scr.height,
      availWidth: scr.availWidth,
      availHeight: scr.availHeight,
      colorDepth: scr.colorDepth,
      pixelDepth: scr.pixelDepth,
    },
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    connection: { effectiveType: con.effectiveType, rtt: con.rtt, downlink: con.downlink, saveData: con.saveData },
    memoryGB: mem,
    hardwareConcurrency: hw,
    prefersDark,
    prefersReducedMotion,
    orientation: (screen.orientation && screen.orientation.type) || null,
    online: navigator.onLine,
    battery: battery
      ? {
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        }
      : null,
  };
}

// === ПОВЕДІНКОВІ ПОДІЇ ===
function initBehaviorTracking() {
  const start = Date.now();
  let lastActivity = start;
  let maxScroll = 0;
  let clicks = 0;
  let keypress = 0;
  let focusCount = 0;
  let blurCount = 0;
  let visibleTime = 0;
  let hiddenSince = null;
  const events = [];
  function pushEvt(type, meta) {
    if (events.length < 200) {
      events.push({ t: new Date().toISOString(), type, ...(meta || {}) });
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      clicks++;
      lastActivity = Date.now();
      pushEvt('click', { x: e.clientX, y: e.clientY, tag: e.target && e.target.tagName });
    },
    { passive: true },
  );
  document.addEventListener('keydown', () => {
    keypress++;
    lastActivity = Date.now();
    pushEvt('keydown');
  });
  window.addEventListener('focus', () => {
    focusCount++;
    pushEvt('focus');
  });
  window.addEventListener('blur', () => {
    blurCount++;
    pushEvt('blur');
  });
  document.addEventListener(
    'scroll',
    () => {
      const sc = Math.max(document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
      const h = Math.max(document.documentElement.scrollHeight || 1, 1);
      const vh = window.innerHeight || 1;
      const depth = Math.min(100, Math.round(((sc + vh) / h) * 100));
      maxScroll = Math.max(maxScroll, depth);
      lastActivity = Date.now();
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      pushEvt('hidden');
    } else {
      if (hiddenSince) {
        visibleTime += Date.now() - hiddenSince;
        hiddenSince = null;
      }
      pushEvt('visible');
    }
  });
  function getIdleMs() {
    return Date.now() - lastActivity;
  }
  function snapshot() {
    const now = Date.now();
    const totalMs = now - start;
    const effectiveVisible = hiddenSince ? visibleTime : visibleTime + (now - (hiddenSince || now));
    return {
      totalMs,
      maxScrollPct: maxScroll,
      clicks,
      keypress,
      focusCount,
      blurCount,
      idleMs: getIdleMs(),
      effectiveVisibleMs: effectiveVisible,
      events,
    };
  }
  return { snapshot };
}
const behaviorTracker = initBehaviorTracking();

// === Автозаповнення з URL ===
(function autofillFromURL() {
  const p = new URLSearchParams(location.search);
  const map = { lastName: 'lastName', firstName: 'firstName', phone: 'phone', email: 'email', company: 'company' };
  Object.entries(map).forEach(([q, id]) => {
    const v = p.get(q);
    if (v) {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = v;
    }
  });
})();

// === Contact Picker API для телефона ===
(function setupContactPicker() {
  const btn = document.getElementById('pickPhoneBtn');
  if (!btn) return;
  const supported = !!(navigator.contacts && navigator.contacts.select);
  if (!supported) {
    btn.style.display = 'none';
    return;
  }
  btn.addEventListener('click', async () => {
    try {
      const props = ['name', 'tel', 'email'];
      const opts = { multiple: false };
      const results = await navigator.contacts.select(props, opts);
      if (results && results.length) {
        const c = results[0];
        if (c.tel && c.tel.length) document.getElementById('phone').value = c.tel[0];
        if (c.name && c.name.length) {
          const parts = String(c.name[0]).trim().split(/\s+/);
          if (parts.length >= 2) {
            document.getElementById('firstName').value ||= parts[0];
            document.getElementById('lastName').value ||= parts.slice(1).join(' ');
          }
        }
        if (c.email && c.email.length) document.getElementById('email').value ||= c.email[0];
      }
    } catch (e) {
      console.warn('Contact picker error', e);
    }
  });
})();

// === Telegram bot deep link ===
const DEFAULT_TELEGRAM_BOT_URL = 'https://t.me/test421_bot';
let TELEGRAM_BOT_URL = DEFAULT_TELEGRAM_BOT_URL;
try {
  const _bp = new URLSearchParams(location.search).get('bot');
  if (_bp) TELEGRAM_BOT_URL = _bp;
} catch (e) {}
const tgCta = document.getElementById('tgCta');
if (tgCta && tgCta.dataset) {
  tgCta.dataset.base = TELEGRAM_BOT_URL;
}
function augmentTelegramCTA(meta) {
  try {
    if (!tgCta) return;
    const base = tgCta.getAttribute('data-base') || TELEGRAM_BOT_URL;
    const url = new URL(base, location.href);
    const payload = {
      tag: meta.tag || 'nfc_unknown',
      ts: meta.iso,
      tz: meta.tz,
      category: window.__selectedCategory || null,
      leadId: window.__leadId || null,
    };
    const start = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    url.searchParams.set('start', window.__leadId || '');
    tgCta.setAttribute('href', url.toString());
  } catch (e) {
    /* noop */
  }
}

// === vCard helpers ===
function buildVCard(meta) {
  const family = 'ТОВ ДОЛОТА';
  const given = 'Відділ';
  const additional = 'Продажів';
  const org = 'ТОВ "ДОЛОТА"';
  const tel = '+380933332212';
  const site = 'https://dolota.ua';
  const email = 'info@dolota.ua';
  const chatbot = 'https://t.me/test421_bot';
  const note = 'Бурові машини, компресори, бурове обладнання та інструмент. Чатбот: ' + chatbot;
  const fn = `${family} ${given} ${additional}`.trim();
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${family};${given};${additional};;`,
    `FN:${fn}`,
    `ORG:${org}`,
    `TEL;TYPE=work,voice:${tel}`,
    `EMAIL;TYPE=work:${email}`,
    `URL:${site}`,
    `NOTE:${note}`,
    'END:VCARD',
  ].join('\r\n');
}
function triggerVcfDownload(vcard, filename = 'DOLOTA.vcf') {
  try {
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (e) {
    console.warn('VCF download failed', e);
  }
}
function autoOpenVCard(meta) {
  try {
    const vcf = buildVCard(meta);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DOLOTA.vcf';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 3000);
    if (isIOS) {
      setTimeout(() => {
        const dataUrl = 'data:text/vcard;charset=utf-8,' + encodeURIComponent(vcf);
        try {
          window.open(dataUrl, '_blank');
        } catch (e) {
          location.href = dataUrl;
        }
      }, 150);
    }
  } catch (e) {
    console.warn('autoOpenVCard failed', e);
  }
}

// === Валідація форми та нормалізація ===
function normalizePhone(raw) {
  if (!raw) return { ok: false, e164: null, cleaned: '' };
  const s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(digits)) return { ok: false, e164: null, cleaned: digits };
  const e164 = hasPlus ? '+' + digits : null;
  return { ok: true, e164, cleaned: digits };
}
function isValidEmail(raw) {
  if (!raw) return true;
  const s = String(raw).trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  return re.test(s);
}
function validate(fd) {
  const lastName = fd.get('lastName')?.trim();
  const firstName = fd.get('firstName')?.trim();
  const phone = fd.get('phone')?.trim();
  const email = fd.get('email')?.trim();
  const phoneCheck = normalizePhone(phone);
  if (!(lastName && firstName && phone)) return { ok: false, msg: 'Будь ласка, заповніть обов’язкові поля.' };
  if (!phoneCheck.ok)
    return {
      ok: false,
      msg: 'Невірний номер телефону. Введіть міжнародний формат (наприклад, +380..., +1...). Мінімум 7, максимум 15 цифр.',
    };
  if (!isValidEmail(email)) return { ok: false, msg: 'Невірний формат e‑mail.' };
  return { ok: true, phoneCheck };
}

// === Відправка вебхуків ===
async function sendContactNow(payloadObj) {
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') || 'nfc_unknown';
  const body = {
    ...payloadObj,
    tag,
    source: 'expo_nfc',
    timestamp: new Date().toISOString(),
    event: 'contact_submitted',
  };
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (e) {
    /* ignore */
  }
}
let categorySent = false;
async function sendCategoryUpdate(payloadObj, category) {
  if (categorySent) return;
  categorySent = true;
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') || 'nfc_unknown';
  const body = {
    ...payloadObj,
    tag,
    source: 'expo_nfc',
    timestamp: new Date().toISOString(),
    event: 'category_selected',
    category: category || null,
  };
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (e) {
    /* ignore */
  }
}

// === Збереження контакту локально ===
function saveVisitor(payload) {
  try {
    localStorage.setItem(
      'dolota_visitor',
      JSON.stringify({
        lastName: payload.lastName || '',
        firstName: payload.firstName || '',
        phone: payload.phone || '',
        email: payload.email || '',
        company: payload.company || '',
      }),
    );
  } catch (e) {}
}
function loadVisitor() {
  try {
    const raw = localStorage.getItem('dolota_visitor');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// === Submit handler ===
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = '';
  const fd = new FormData(form);
  const v = validate(fd);
  if (!window.__leadId) window.__leadId = genLeadId();
  if (!v.ok) {
    statusEl.textContent = v.msg;
    statusEl.className = 'status err';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Запитуємо геолокацію…';

  const payload = Object.fromEntries(fd.entries());
  if (v.phoneCheck && v.phoneCheck.e164) payload.phone_e164 = v.phoneCheck.e164;
  const meta = await buildUtm(); // тут чекаємо підтвердження/позицію
  const geoPerm = await getGeoPermissionState();
  const tech = await collectTech();
  const behavior = initBehaviorTracking().snapshot(); // короткий знімок на момент сабміту
  payload.leadId = window.__leadId;
  payload.tag = meta.tag;
  payload.source = 'expo_nfc';
  payload.timestamp = meta.iso;
  payload.utm = meta.utm;
  if (meta.geo) payload.geo = meta.geo;
  payload.tz = meta.tz;
  payload.tech = tech;
  payload.behavior = behavior;
  payload.geo_permission = geoPerm;

  try {
    await sendContactNow(payload);
    statusEl.textContent = 'Дякуємо! Дані успішно надіслані.';
    autoOpenVCard(meta);
    statusEl.className = 'status ok';
    saveVisitor(payload);
    document.getElementById('afterSubmit').style.display = 'block';
    catalogs.style.display = 'block';
    catalogs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    augmentCatalogLinks(meta);
    augmentTelegramCTA(meta);
    try {
      const tg = document.getElementById('tgCta');
      if (tg) tg.addEventListener('click', () => {
        track('tg_cta_click', { leadId: window.__leadId });
      }, { once: true });
      const call = document.getElementById('callCta');
      if (call) call.addEventListener('click', () => {
        track('call_click', { leadId: window.__leadId });
      }, { once: true });
    } catch (e) {}
    document.addEventListener(
      'click',
      (ev) => {
        const a = ev.target.closest('#catalogs a[data-category], #catalogs a[href]');
        if (!a) return;
        const name = a.getAttribute('data-category') || a.textContent.trim();
        window.__selectedCategory = name;
        track('catalog_open', { leadId: window.__leadId, category: name, href: a.href });
        sendCategoryUpdate(payload, name);
      },
      { once: true },
    );
    const saveBtn = document.getElementById('saveVCardBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        track('vcard_click', { leadId: window.__leadId });
        const vcf = buildVCard(meta);
        triggerVcfDownload(vcf);
      };
    }
  } catch (err) {
    statusEl.textContent = 'Помилка відправлення. Спробуйте ще раз або перевірте інтернет.';
    statusEl.className = 'status err';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Надіслати';
  }
});

function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  const inputs = document.querySelectorAll('#leadForm input, #leadForm button');
  const statusElLocal = document.getElementById('status');
  if (!isOnline) {
    inputs.forEach((el) => {
      el.disabled = true;
      el.style.backgroundColor = '#444';
    });
    if (statusElLocal) {
      statusElLocal.textContent = 'Немає з’єднання з інтернетом. Будь ласка, підключіться до мережі.';
      statusElLocal.className = 'status err';
    }
  } else {
    inputs.forEach((el) => {
      el.disabled = false;
      el.style.backgroundColor = '';
    });
    if (statusElLocal) {
      statusElLocal.textContent = '';
      statusElLocal.className = 'status';
    }
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
document.addEventListener('DOMContentLoaded', updateOnlineStatus);
