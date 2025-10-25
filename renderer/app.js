const leftCol = document.getElementById("left");
const rightCol = document.getElementById("right");
const sendBtn = document.getElementById("sendBtn");
const seedInput = document.getElementById("seedInput");
const status = document.getElementById("status");

let active = false;

function addMessage(sender, text, side) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
  document.getElementById(side).appendChild(msg);
  msg.scrollIntoView({ behavior: "smooth", block: "end" });
}

document.addEventListener("DOMContentLoaded", () => {
  addMessage("Throne", "Council loaded. Awaiting topic...", "left");
});

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on("council-response", (payload) => {
    addMessage("Seat", payload, "right");
  });
}

sendBtn.onclick = () => {
  const seed = seedInput.value.trim();
  if (!seed) return;
  if (!active) {
    active = true;
    status.textContent = "Active Seat: Physicist";
    addMessage("Throne", "Council assembled. Topic pending.", "left");
  }
  addMessage("Throne", seed, "left");
  window.CouncilAPI.send("seed", seed);
  seedInput.value = "";
};
