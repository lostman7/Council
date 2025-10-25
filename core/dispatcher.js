import fetch from 'node-fetch';

export async function spawnSeat(role, prompt) {
  const modelMap = {
    Physicist: 'llama3.2:3b',
    Engineer: 'cogito:3b',
    Linguist: 'qwen3:0.6b'
  };
  const model = modelMap[role] || 'llama3.2:3b';

  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: `You are the ${role} of the Council.` },
      { role: 'user', content: prompt }
    ]
  };

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return data.message?.content || '(no reply)';
  } catch (err) {
    console.error('Seat spawn error:', err);
    return '(seat offline)';
  }
}
