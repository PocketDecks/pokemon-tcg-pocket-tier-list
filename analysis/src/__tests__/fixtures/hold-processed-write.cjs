const fs = require("node:fs");

fs.writeFileSync(process.env.STORE_LOCK, String(process.pid));
fs.writeFileSync(process.env.PROCESSED_FILE, "[");
process.send("ready");

process.on("message", (message) => {
  if (message !== "release") return;
  fs.writeFileSync(process.env.PROCESSED_FILE, process.env.PROCESSED_SNAPSHOT);
  fs.rmSync(process.env.STORE_LOCK, { force: true });
  process.send("released", () => process.exit(0));
});
