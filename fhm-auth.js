(function () {
  'use strict';

  var STORAGE_KEY = 'fhm.account.v2';
  var ACCOUNT_BUTTON_SELECTOR = '[data-action="open-auth"]';
  var API_BASE = '/.netlify/functions';
  
// Actualiza el texto "Usted está como ..."
function updateAccountLabel(nickname) {
  var label = (nickname && nickname.trim()) ? nickname.trim() : 'Invitado';

  try {
    document.querySelectorAll('[data-nick-target]').forEach(function (el) {
      el.textContent = label;
    });
  } catch (e) {
    // ignore
  }
}

  function readAccount() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var acc = JSON.parse(raw);
      if (!acc || typeof acc.nickname !== 'string' || typeof acc.token !== 'string') return null;
      return acc;
    } catch (e) {
      return null;
    }
  }

  function saveAccount(acc) {
    try {
      if (!acc) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        var toStore = {
          nickname: String(acc.nickname || '').trim(),
          token: String(acc.token || ''),
          createdAt: acc.createdAt || new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      }
    } catch (e) {
      // ignore
    }
  }

  function sanitizeAccountForEvent(acc) {
    if (!acc) return null;
    return {
      nickname: acc.nickname,
      createdAt: acc.createdAt || null
    };
  }

  function isLoggedIn() {
    var acc = readAccount();
    return !!(acc && acc.nickname && acc.token);
  }

  function getNickname() {
    var acc = readAccount();
    return acc && acc.nickname ? acc.nickname : '';
  }

  function updateAccountButtonLabel() {
    try {
      var logged = isLoggedIn();
      var btns = document.querySelectorAll(ACCOUNT_BUTTON_SELECTOR);
      for (var i = 0; i < btns.length; i++) {
        btns[i].textContent = logged ? 'Cerrar sesión' : 'Cuenta / Login';
      }
    } catch (e) {
      // ignore
    }
  }

  var STYLE_ID = 'fhm-auth-style';

  function injectStyles() {
    try {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '#fhm-auth-modal{' +
        'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        '}' +
        '#fhm-auth-modal.fhm-auth-modal--visible{display:flex;}' +
        '#fhm-auth-modal .fhm-auth-modal__backdrop{' +
        'position:absolute;inset:0;background:rgba(0,0,0,0.6);' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__dialog{' +
        'position:relative;z-index:1;max-width:380px;width:90%;background:#111827;color:#f9fafb;border-radius:12px;padding:16px 20px;box-shadow:0 20px 40px rgba(0,0,0,0.45);' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__title{font-size:1.2rem;font-weight:600;margin:0 0 4px 0;}' +
        '#fhm-auth-modal .fhm-auth-modal__subtitle{font-size:0.9rem;opacity:0.9;margin:0 0 12px 0;}' +
        '#fhm-auth-modal label{display:block;font-size:0.8rem;margin-bottom:8px;}' +
        '#fhm-auth-modal input[type="text"],#fhm-auth-modal input[type="password"]{' +
        'width:100%;padding:6px 8px;margin-top:2px;border-radius:6px;border:1px solid #4b5563;background:#020617;color:#f9fafb;font-size:0.9rem;box-sizing:border-box;' +
        '}' +
        '#fhm-auth-modal input[type="text"]:focus,#fhm-auth-modal input[type="password"]:focus{' +
        'outline:none;border-color:#fbbf24;box-shadow:0 0 0 1px #fbbf24;' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__hint{font-size:0.75rem;opacity:0.85;margin:4px 0 10px 0;}' +
        '#fhm-auth-modal .fhm-auth-modal__actions{display:flex;gap:8px;margin-top:10px;}' +
        '#fhm-auth-modal .fhm-auth-modal__actions button{' +
        'flex:1;padding:8px 10px;border-radius:999px;border:none;font-size:0.9rem;cursor:pointer;font-weight:500;' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__actions button[data-role="login"]{' +
        'background:#fbbf24;color:#111827;' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__actions button[data-role="register"]{' +
        'background:transparent;color:#fbbf24;border:1px solid #fbbf24;' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__error{' +
        'margin-top:8px;font-size:0.8rem;color:#fecaca;min-height:1em;' +
        '}' +
        '#fhm-auth-modal .fhm-auth-modal__close{' +
        'position:absolute;top:8px;right:10px;border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:1.1rem;' +
        '}' +
        '@media (prefers-color-scheme: light){' +
        '#fhm-auth-modal .fhm-auth-modal__dialog{background:#ffffff;color:#020617;}' +
        '#fhm-auth-modal input[type="text"],#fhm-auth-modal input[type="password"]{background:#f9fafb;color:#020617;border-color:#d1d5db;}' +
        '}' +
        '';
      document.head.appendChild(style);
    } catch (e) {
      // ignore
    }
  }

  function getModal() {
    return document.getElementById('fhm-auth-modal');
  }

  function getFields() {
    var modal = getModal();
    if (!modal) {
      return {
        modal: null,
        nickInput: null,
        passInput: null,
        errorBox: null,
        reasonSpan: null
      };
    }
    return {
      modal: modal,
      nickInput: modal.querySelector('#fhm-auth-nick'),
      passInput: modal.querySelector('#fhm-auth-pass'),
      errorBox: modal.querySelector('#fhm-auth-error'),
      reasonSpan: modal.querySelector('[data-role="reason"]')
    };
  }

  function clearError() {
    var f = getFields();
    if (f.errorBox) {
      f.errorBox.textContent = '';
      f.errorBox.style.display = 'none';
    }
  }

  function showError(msg) {
    var f = getFields();
    if (f.errorBox) {
      f.errorBox.textContent = msg || '';
      f.errorBox.style.display = msg ? 'block' : 'none';
    } else if (msg) {
      console.warn('[FHM AUTH]', msg);
    }
  }

  function closeModal() {
    var modal = getModal();
    if (modal) {
      modal.classList.remove('fhm-auth-modal--visible');
    }
  }

  function apiRequest(path, payload) {
    var url = API_BASE + path;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data) {
          var msg = (data && data.error) || ('Error de red (' + res.status + ')');
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function afterAuthSuccess(acc, message) {
    closeModal();
    saveAccount(acc);
    updateAccountLabel(acc.nickname);
    try {
      if (window.NICK && typeof NICK.set === 'function') {
        NICK.set(acc.nickname);
      }
    } catch (e) {}
    try {
      var detail = sanitizeAccountForEvent(acc);
      document.dispatchEvent(new CustomEvent('fhm:account:login', { detail: detail }));
    } catch (e) {}
    updateAccountButtonLabel();
    if (message) console.log('[FHM AUTH]', message);
  }

  function setButtonsDisabled(disabled) {
    var modal = getModal();
    if (!modal) return;
    var btns = modal.querySelectorAll('.fhm-auth-modal__actions button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = disabled;
    }
  }

  function handleAuthClick(mode) {
    clearError();
    var f = getFields();
    var nickInput = f.nickInput;
    var passInput = f.passInput;
    if (!nickInput || !passInput) return;

    var nickname = String(nickInput.value || '').trim();
    var pass = String(passInput.value || '').trim();

    if (!nickname) {
      showError('Ingresa un nickname.');
      nickInput.focus();
      return;
    }
    if (nickname.length < 3 || nickname.length > 20) {
      showError('El nickname debe tener entre 3 y 20 caracteres.');
      nickInput.focus();
      return;
    }
    if (!pass) {
      showError('Ingresa una contraseña.');
      passInput.focus();
      return;
    }
    if (pass.length < 4) {
      showError('La contraseña debe tener al menos 4 caracteres.');
      passInput.focus();
      return;
    }

    setButtonsDisabled(true);
    var endpoint = mode === 'register' ? '/auth-register' : '/auth-login';

    apiRequest(endpoint, { nickname: nickname, password: pass })
      .then(function (data) {
        if (!data || !data.ok || !data.user || !data.token) {
          throw new Error(data && data.error ? data.error : 'Respuesta inválida del servidor.');
        }
        var acc = {
          nickname: data.user.nickname,
          token: data.token,
          createdAt: data.user.createdAt || new Date().toISOString()
        };
        afterAuthSuccess(acc, mode === 'register' ? 'Cuenta creada.' : 'Sesión iniciada.');
      })
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Error al comunicarse con el servidor.');
      })
      .finally(function () {
        setButtonsDisabled(false);
      });
  }

  function buildModal() {
    var modal = getModal();
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'fhm-auth-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="fhm-auth-modal__backdrop"></div>' +
      '<div class="fhm-auth-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="fhm-auth-title">' +
      '<button class="fhm-auth-modal__close" type="button" data-role="close" aria-label="Cerrar">×</button>' +
      '<h2 id="fhm-auth-title" class="fhm-auth-modal__title">Cuenta de FlyHighManager</h2>' +
      '<p class="fhm-auth-modal__subtitle" data-role="reason">Inicia sesión o crea tu cuenta para jugar y guardar tu progreso.</p>' +
      '<label>Nickname' +
      '<input id="fhm-auth-nick" type="text" autocomplete="username" maxlength="20" />' +
      '</label>' +
      '<label>Contraseña' +
      '<input id="fhm-auth-pass" type="password" autocomplete="current-password" />' +
      '</label>' +
      '<p class="fhm-auth-modal__hint">Esta cuenta se valida en el servidor de FlyHighManager. No se asocia a ningún correo. Si olvidas la contraseña, no se puede recuperar.</p>' +
      '<div class="fhm-auth-modal__actions">' +
      '<button type="button" data-role="login">Iniciar sesión</button>' +
      '<button type="button" data-role="register">Crear cuenta nueva</button>' +
      '</div>' +
      '<p id="fhm-auth-error" class="fhm-auth-modal__error"></p>' +
      '</div>';

    document.body.appendChild(modal);

    var backdrop = modal.querySelector('.fhm-auth-modal__backdrop');
    var closeBtn = modal.querySelector('[data-role="close"]');
    var loginBtn = modal.querySelector('[data-role="login"]');
    var registerBtn = modal.querySelector('[data-role="register"]');

    if (backdrop) backdrop.addEventListener('click', function (e) {
      e.preventDefault();
      closeModal();
    });
    if (closeBtn) closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeModal();
    });
    if (loginBtn) loginBtn.addEventListener('click', function (e) {
      e.preventDefault();
      handleAuthClick('login');
    });
    if (registerBtn) registerBtn.addEventListener('click', function (e) {
      e.preventDefault();
      handleAuthClick('register');
    });

    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var active = document.activeElement;
        if (active && (active.id === 'fhm-auth-nick' || active.id === 'fhm-auth-pass')) {
          e.preventDefault();
          handleAuthClick('login');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    });

    return modal;
  }

  function openModal(reason) {
    var modal = buildModal();
    var f = getFields();
    if (reason && f.reasonSpan) {
      var text = '';
      if (reason === 'play') {
        text = 'Crea tu cuenta para poder jugar y guardar tu progreso en el servidor.';
      } else {
        text = 'Inicia sesión o crea tu cuenta.';
      }
      f.reasonSpan.textContent = text;
    }
    modal.classList.add('fhm-auth-modal--visible');
    modal.setAttribute('aria-hidden', 'false');

    var acc = readAccount();
    var prefillNick = acc && acc.nickname ? acc.nickname : '';

    if (!prefillNick) {
      try {
        var legacyNick = localStorage.getItem('fhm.nick') || '';
        if (legacyNick) prefillNick = legacyNick;
      } catch (e) {}
    }

    var f2 = getFields();
    if (f2.nickInput) {
      if (prefillNick && !f2.nickInput.value) {
        f2.nickInput.value = prefillNick;
      }
      f2.nickInput.focus();
    }

    clearError();
  }

  function attachGlobalListeners() {
    document.addEventListener('click', function (e) {
      var gate = e.target.closest('[data-requires-auth="true"]');
      if (gate) {
        if (!isLoggedIn()) {
          e.preventDefault();
          openModal('play');
        }
        return;
      }
      var openBtn = e.target.closest(ACCOUNT_BUTTON_SELECTOR);
      if (openBtn) {
        e.preventDefault();
        if (isLoggedIn()) {
          var ok = window.confirm('¿Cerrar sesión? Tendrás que iniciar sesión nuevamente para jugar.');
          if (!ok) return;
          ACCOUNT.logout();
        } else {
          openModal('manual');
        }
      }
    });
  }

  function hydrateFromExistingAccount() {
  var acc = readAccount();

  if (acc && acc.nickname) {
    // Ya había sesión guardada
    updateAccountLabel(acc.nickname);
    try {
      if (window.NICK && typeof NICK.set === 'function') {
        NICK.set(acc.nickname);
      }
    } catch (e) {}
    try {
      var detail = sanitizeAccountForEvent(acc);
      document.dispatchEvent(new CustomEvent('fhm:account:login', { detail: detail }));
    } catch (e) {}
  } else {
    // No hay sesión -> Invitado
    updateAccountLabel(null);
  }

  updateAccountButtonLabel();
}
  }

 var ACCOUNT = {
  isLoggedIn: isLoggedIn,
  getNickname: getNickname,
  openModal: openModal,
  logout: function () {
    saveAccount(null);

    // 👉 Al cerrar sesión, volvemos a "Invitado"
    updateAccountLabel(null);

    try {
      if (window.NICK && typeof NICK.set === 'function') {
        NICK.set('');
      }
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('fhm:account:logout'));
    } catch (e) {}
    updateAccountButtonLabel();
  }
};

  window.ACCOUNT = ACCOUNT;

  function initAuth() {
    injectStyles();
    buildModal();
    attachGlobalListeners();
    hydrateFromExistingAccount();
    updateAccountButtonLabel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
