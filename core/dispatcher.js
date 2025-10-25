const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';
const CLOUD_BLACKLIST = ['gpt-oss:120b-cloud', 'glm-4.6:cloud'];
const FALLBACK_MODEL = 'llama3.2:3b';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export async function callModel({ model, messages, stream = false }) {
  if (!model) {
    throw new Error('Model name is required for callModel');
  }
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error('Messages required for callModel');
  }

  let selectedModel = model;
  if (CLOUD_BLACKLIST.some((blocked) => selectedModel.includes(blocked))) {
    console.warn(`[COUNCIL] Skipping blacklisted model '${selectedModel}'`);
    selectedModel = FALLBACK_MODEL;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(OLLAMA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, stream, messages })
      });

      if (!res.ok) {
        throw new Error(`Model request failed with status ${res.status}`);
      }

      const data = await res.json();
      const text = data?.message?.content || '(no reply)';
      return { text, raw: data, model: selectedModel };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error('Model invocation error:', err);
        return { text: '(seat offline)', raw: null, model: selectedModel };
      }

      console.warn(`[Dispatcher] Retry ${attempt}/${MAX_ATTEMPTS} after error: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return { text: '(seat offline)', raw: null, model: selectedModel };
}
