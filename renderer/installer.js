import { buildSeatControls, lazyStart } from '../core/uiControls.js';

const SEND_SELECTORS = ['#sendBtn', '#send', '.send-button', 'button[data-action="send"]'];
let observer;
let firstMessageHandled = false;

function log(message) {
  console.debug('[Council Installer]', message);
}

function findSendButton() {
  for (const selector of SEND_SELECTORS) {
    const node = document.querySelector(selector);
    if (node) {
      return node;
    }
  }
  return null;
}

function attachSendHook(button) {
  if (!button || button.dataset.councilHooked === 'true') {
    return;
  }
  button.dataset.councilHooked = 'true';
  button.addEventListener('click', handleFirstSend, { capture: true });
  log('Send button hook attached.');
}

async function handleFirstSend(event) {
  if (firstMessageHandled) {
    return;
  }

  const input = document.querySelector('#seedInput, #input, textarea, input[type="text"]');
  const message = input && typeof input.value === 'string' ? input.value.trim() : '';
  if (!message) {
    return;
  }

  firstMessageHandled = true;
  log('Lazy start triggered from first message.');
  try {
    await lazyStart(message);
  } catch (err) {
    console.error('[Council Installer] lazyStart failed:', err);
  } finally {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
}

function watchSendButton() {
  const current = findSendButton();
  if (current) {
    attachSendHook(current);
    return;
  }

  observer = new MutationObserver(() => {
    const target = findSendButton();
    if (target) {
      attachSendHook(target);
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  });

  const body = document.body || document.documentElement;
  if (body) {
    observer.observe(body, { childList: true, subtree: true });
  }
}

async function installCouncilHooks() {
  log('Initializing Council hooks…');
  document.addEventListener('DOMContentLoaded', async () => {
    await buildSeatControls();
    log('Seat controls initialized.');
  });
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    void buildSeatControls();
  }
  watchSendButton();
}

installCouncilHooks()
  .then(() => log('Council auto-hooks active.'))
  .catch((err) => console.error('[Council Installer] Hook init failed', err));

window.addEventListener('send-first-message', async (event) => {
  if (firstMessageHandled) {
    return;
  }
  const message = event?.detail?.message;
  if (!message) {
    return;
  }
  firstMessageHandled = true;
  try {
    await lazyStart(message);
  } catch (err) {
    console.error('[Council Installer] lazyStart failed:', err);
  }
});
