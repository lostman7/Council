import { saveBubble } from '../memory/bubbles.js';

const THINKER_MODEL = 'deepscaler:1.5b';

export async function summarize(role, log) {
  const transcript = Array.isArray(log) ? log.filter(Boolean) : [];
  if (!transcript.length) {
    return '(nothing to summarize)';
  }

  const body = {
    model: THINKER_MODEL,
    stream: false,
    messages: [
      {
        role: 'system',
        content: 'Condense the conversation below into a 3-sentence summary retaining key facts.'
      },
      { role: 'user', content: transcript.join('\n') }
    ]
  };

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Optical Thinker request failed with status ${res.status}`);
    }

    const data = await res.json();
    const summary = data.message?.content || '(no summary)';
    saveBubble(`${role}_summary`, summary);
    return summary;
  } catch (err) {
    console.error('Optical Thinker error:', err);
    return '(summary failed)';
  }
}

export async function reconcile(conflictSummary) {
  const summaryText = Array.isArray(conflictSummary)
    ? conflictSummary.filter(Boolean).join('\n')
    : String(conflictSummary ?? '');

  if (!summaryText.trim()) {
    return '(no reconciliation)';
  }

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: THINKER_MODEL,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'Unify conflicting Council viewpoints into one balanced statement.'
          },
          { role: 'user', content: summaryText }
        ]
      })
    });

    if (!res.ok) {
      throw new Error(`Optical Thinker reconciliation failed with status ${res.status}`);
    }

    const data = await res.json();
    return data.message?.content || '(reconciliation failed)';
  } catch (err) {
    console.error('Reconcile error:', err);
    return '(no reconciliation)';
  }
}
