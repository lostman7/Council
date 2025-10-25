const sendBtn = document.getElementById("sendBtn");
const seedInput = document.getElementById("seedInput");

const optionsBtn = document.getElementById("optionsBtn");
const panel = document.getElementById("optionsPanel");
const closeOptions = document.getElementById("closeOptions");
const saveOptions = document.getElementById("saveOptions");
const councilDot = document.getElementById("councilDot");
const seatStatus = document.getElementById("seatStatus");

let active = false;

function addMessage(sender, text, side) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
  document.getElementById(side).appendChild(msg);
  msg.scrollIntoView({ behavior: "smooth", block: "end" });
}

function setCouncilDot(state) {
  councilDot.classList.remove("red", "green");
  councilDot.classList.add(state === "active" ? "green" : "red");
}

document.addEventListener("DOMContentLoaded", () => {
  addMessage("Throne", "Council loaded. Awaiting topic...", "left");
  setCouncilDot("idle");
});

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on("council-response", (payload) => {
    addMessage("Seat", payload, "right");
  });

  window.CouncilAPI.on("seat-change", (role) => {
    seatStatus.textContent = `Active Seat: ${role}`;
    setCouncilDot(role === "Idle" ? "idle" : "active");
  });
}

optionsBtn.onclick = () => panel.classList.toggle("hidden");
closeOptions.onclick = () => panel.classList.add("hidden");

saveOptions.onclick = () => {
  const config = {
    throne: document.getElementById("modelThrone").value,
    physicist: document.getElementById("modelPhysicist").value,
    ramdisk: parseInt(document.getElementById("ramSize").value, 10)
  };
  if (window.CouncilAPI?.send) {
    window.CouncilAPI.send("saveSettings", config);
  }
  panel.classList.add("hidden");
};

sendBtn.onclick = () => {
  const seed = seedInput.value.trim();
  if (!seed) return;
  if (!active) {
    active = true;
    addMessage("Throne", "Council assembled. Topic pending.", "left");
  }
  addMessage("Throne", seed, "left");
  if (window.CouncilAPI?.send) {
    window.CouncilAPI.send("seed", seed);
  }
  seedInput.value = "";
};
