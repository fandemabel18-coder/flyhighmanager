// /src/modules/mabelcoins/mabelcoins-sdk.js
// SDK mínimo para MabelCoins (Wallet + Missions + Promo + Recovery Key)
// Requiere: el usuario esté logeado y exista localStorage['fhm.account.v2'] con { token }
//
// Endpoints Netlify Functions usados:
// - /.netlify/functions/coins-balance
// - /.netlify/functions/coins-history
// - /.netlify/functions/coins-award        (normalmente solo backend lo usa; aquí no lo exponemos por defecto)
// - /.netlify/functions/coins-spend        (normalmente solo backend lo usa; aquí no lo exponemos por defecto)
// - /.netlify/functions/promo-redeem
// - /.netlify/functions/missions-status
// - /.netlify/functions/missions-event
// - /.netlify/functions/recovery-status
// - /.netlify/functions/recovery-generate

const ACCOUNT_KEY = 'fhm.account.v2';

function getAccount() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); }
  catch { return null; }
}

export function getToken() {
  return getAccount()?.token || null;
}

export function isLoggedIn() {
  return !!getToken();
}

export function makeRefId(prefix = 'evt') {
  // refId único para idempotencia por evento
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}:${ts}:${rand}`;
}

async function fetchJSON(url, { method = 'GET', token, headers = {}, body } = {}) {
  const h = { ...headers };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });

  // Intentar parsear JSON siempre; si falla, entregar texto
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { ok: false, raw: text }; }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP_${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const Coins = {
  async getBalance() {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    return fetchJSON('/.netlify/functions/coins-balance', { token });
  },

  async getHistory({ limit = 50, cursor = null } = {}) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', String(cursor));
    const url = `/.netlify/functions/coins-history?${params.toString()}`;
    return fetchJSON(url, { token });
  }
};

export const Promo = {
  async redeem(code) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    return fetchJSON('/.netlify/functions/promo-redeem', {
      method: 'POST',
      token,
      body: { code }
    });
  }
};

export const Missions = {
  async getStatus() {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    return fetchJSON('/.netlify/functions/missions-status', { token });
  },

  async emit(eventName, payload = {}, { refId = null } = {}) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    const rid = refId || makeRefId(`mission:${eventName}`);
    return fetchJSON('/.netlify/functions/missions-event', {
      method: 'POST',
      token,
      body: { eventName, refId: rid, payload }
    });
  }
};

export const Recovery = {
  async status() {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    return fetchJSON('/.netlify/functions/recovery-status', { token });
  },

  async generate() {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    return fetchJSON('/.netlify/functions/recovery-generate', {
      method: 'POST',
      token,
      body: {}
    });
  }
};

// Helper: ejecutar una acción solo si está logeado; si no, retorna null
export async function safe(fn) {
  if (!isLoggedIn()) return null;
  return fn();
}

export default { Coins, Promo, Missions, Recovery, isLoggedIn, getToken, makeRefId, safe };
