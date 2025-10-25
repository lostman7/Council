const drawer = document.createElement('div');
drawer.id = 'optionsDrawer';
drawer.classList.add('hidden');
drawer.innerHTML = `
  <div class="options-header">
    <h3>Council Seats</h3>
    <button id="closeOptionsDrawer" type="button">×</button>
  </div>
  <div id="seatList"></div>
`;

document.body.appendChild(drawer);

const seatList = drawer.querySelector('#seatList');
const closeBtn = drawer.querySelector('#closeOptionsDrawer');

closeBtn.addEventListener('click', () => {
  drawer.classList.add('hidden');
});

drawer.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.tagName !== 'INPUT') return;
  const seatName = target.dataset.seat;
  const model = target.value.trim();
  if (!seatName || !model) return;
  window.CouncilAPI?.send('update-seat', { name: seatName, model });
});

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on('init-seats', (seats) => {
    renderSeatList(seats);
  });
}

function renderSeatList(seats) {
  if (!seatList) return;
  seatList.innerHTML = '';
  if (!seats || typeof seats !== 'object') {
    seatList.textContent = 'No seats configured.';
    return;
  }

  Object.entries(seats).forEach(([name, cfg]) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    const label = document.createElement('label');
    label.textContent = `${name} (${cfg?.role ?? name})`;

    const input = document.createElement('input');
    input.value = cfg?.model ?? '';
    input.dataset.seat = name;
    input.placeholder = 'model name';

    row.append(label, input);
    seatList.appendChild(row);
  });
}

window.CouncilOptions = {
  toggle() {
    drawer.classList.toggle('hidden');
  },
  hide() {
    drawer.classList.add('hidden');
  }
};
