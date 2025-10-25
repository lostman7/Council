// core/recorder.js
// Buffers seat transcripts for the Throne review cycle.

let buffer = [];

export function appendSeatTurn(seat, text) {
  if (!seat || typeof text !== 'string') return;
  buffer.push({ seat, text, timestamp: Date.now() });
}

export function getSeatHistory(count) {
  if (typeof count !== 'number' || count <= 0) {
    return [...buffer];
  }
  return buffer.slice(-count);
}

export function clearSeatHistory() {
  buffer = [];
}
