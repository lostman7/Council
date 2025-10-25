const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';

export async function callModel({ model, messages, stream = false }) {
  if (!model) {
    throw new Error('Model name is required for callModel');
  }
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error('Messages required for callModel');
  }

  try {
    const res = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream, messages })
    });

    if (!res.ok) {
      throw new Error(`Model request failed with status ${res.status}`);
    }

    const data = await res.json();
    const text = data?.message?.content || '(no reply)';
    return { text, raw: data, model };
  } catch (err) {
    console.error('Model invocation error:', err);
    return { text: '(seat offline)', raw: null, model };
  }
}
