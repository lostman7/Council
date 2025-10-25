const hasWindow = typeof window !== 'undefined';

let seatControlsRequested = false;
let lazyStartTriggered = false;

export async function buildSeatControls() {
  if (!hasWindow) return;
  if (seatControlsRequested) {
    if (window?.CouncilAPI?.getSeats) {
      window.CouncilAPI.getSeats();
    }
    return;
  }

  seatControlsRequested = true;

  if (window?.CouncilAPI?.getSeats) {
    window.CouncilAPI.getSeats();
  }
  if (window?.CouncilAPI?.getSafeMode) {
    window.CouncilAPI.getSafeMode();
  }
}

export async function lazyStart(message, { force = false } = {}) {
  if (!hasWindow) return;
  if (lazyStartTriggered && !force) return;

  const topic = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Flowfield: baseline session';

  lazyStartTriggered = true;

  if (window?.CouncilAPI?.startSession) {
    window.CouncilAPI.startSession(topic);
  }
}

export function resetLazyStart() {
  lazyStartTriggered = false;
}
