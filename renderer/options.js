// renderer/options.js
// Populates the options drawer from main and lets you change models.

const optionsBtn = document.getElementById('optionsBtn');

let drawer;
function ensureDrawer() {
  if (drawer) return drawer;
  drawer = document.createElement('div');
  drawer.id = 'optionsDrawer';
  drawer.classList.add('hidden');
  drawer.innerHTML = `
    <div class="options-header">
      <h3>Council Options</h3>
      <button id="closeOptionsDrawer">×</button>
    </div>
    <div id="seatList"></div>
  `;
  document.body.appendChild(drawer);
  document.getElementById('closeOptionsDrawer').onclick = () => drawer.classList.add('hidden');
  return drawer;
}

optionsBtn.onclick = () => {
  ensureDrawer();
  drawer.classList.toggle('hidden');
  window.CouncilAPI.getSeats();
};

// Render the seat list when main replies
window.CouncilAPI.on('seats-list', (all) => {
  ensureDrawer();
  const container = drawer.querySelector('#seatList');
  container.innerHTML = '';
  Object.entries(all).forEach(([name, cfg]) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    row.innerHTML = `
      <label>${name}</label>
      <input type="text" value="${cfg?.model || ''}" data-seat="${name}" />
    `;
    container.appendChild(row);
  });

  container.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (t && t.matches('input[data-seat]')) {
        window.CouncilAPI.updateSeat(t.dataset.seat, t.value.trim());
      }
    },
    { once: true }
  );
});

// Toast when seat model updates
window.CouncilAPI.on('seats-updated', ({ name, model }) => {
  const note = document.createElement('div');
  note.className = 'log-entry';
  note.textContent = `Seat updated: ${name} → ${model}`;
  let log = document.getElementById('logDrawer');
  if (!log) {
    log = document.createElement('div');
    log.id = 'logDrawer';
    log.innerHTML = `<div class="log-title">System Log</div><div class="log-content"></div>`;
    document.body.appendChild(log);
  }
  log.querySelector('.log-content').appendChild(note);
});
