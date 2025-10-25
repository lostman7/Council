export function handleSeed(msg, win) {
  console.log("Throne received seed:", msg);
  win.webContents.send('council-response', `Physicist: Processing "${msg}"...`);
}
