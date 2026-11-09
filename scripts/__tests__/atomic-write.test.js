const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { execFileSync } = childProcess;
const { after } = require("node:test");
const { syncBuiltinESMExports } = require("node:module");
const { writeFileAtomic } = require("../atomic-write.mjs");

const created = [];
const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-write-"));
  created.push(dir);
  return dir;
};
after(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

test("writes the contents to the destination and leaves no temporary file", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  writeFileAtomic(destination, "first");
  writeFileAtomic(destination, "second");
  assert.strictEqual(fs.readFileSync(destination, "utf8"), "second");
  assert.deepStrictEqual(fs.readdirSync(dir), ["out.json"]);
});

test("a failed rename throws and removes its temporary file", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  fs.mkdirSync(destination);
  assert.throws(() => writeFileAtomic(destination, "payload"));
  assert.deepStrictEqual(fs.readdirSync(dir), ["out.json"]);
});

test("a partial temporary write removes the file created by the writer", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, contents, ...options) => {
    if (typeof file === "number") {
      write(file, "partial");
      throw new Error("disk full");
    }
    return write(file, contents, ...options);
  };
  try {
    assert.throws(() => writeFileAtomic(destination, "payload"), /disk full/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test("a partial proof write removes the temporary and proof created by the writer", () => {
  const dir = makeDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "base"], { cwd: dir, stdio: "ignore" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  const journalPath = execFileSync("git", ["rev-parse", "--git-path", "refresh-outputs.json"], { cwd: dir, encoding: "utf8" }).trim();
  fs.writeFileSync(path.resolve(dir, journalPath), JSON.stringify({ head, baseline: {}, checkpoint: {} }));
  const destination = path.join(dir, "out.json");
  const write = fs.writeFileSync;
  let fdWrites = 0;
  fs.writeFileSync = (file, contents, ...options) => {
    if (typeof file === "number" && ++fdWrites === 2) {
      write(file, "partial");
      throw new Error("disk full");
    }
    return write(file, contents, ...options);
  };
  try {
    assert.throws(() => writeFileAtomic(destination, "payload", { refreshRecovery: true }), /disk full/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepStrictEqual(fs.readdirSync(dir), [".git"]);
});

test("rechecks the refresh journal before each opt-in write", () => {
  const dir = makeDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "base"], { cwd: dir, stdio: "ignore" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  const journalPath = path.resolve(dir, execFileSync("git", ["rev-parse", "--git-path", "refresh-outputs.json"], { cwd: dir, encoding: "utf8" }).trim());
  fs.writeFileSync(journalPath, JSON.stringify({ head, baseline: {}, checkpoint: {} }));
  const first = path.join(dir, "first.json");
  const second = path.join(dir, "second.json");
  const rename = fs.renameSync;
  const proofAtRename = new Map();
  fs.renameSync = (temporary, target) => {
    proofAtRename.set(target, fs.existsSync(`${temporary}.owner`));
    return rename(temporary, target);
  };
  try {
    writeFileAtomic(first, "first", { refreshRecovery: true });
    fs.rmSync(journalPath);
    writeFileAtomic(second, "second", { refreshRecovery: true });
  } finally {
    fs.renameSync = rename;
  }
  assert.strictEqual(proofAtRename.get(first), true);
  assert.strictEqual(proofAtRename.get(second), false);
});

test("uses one Git subprocess to validate each opt-in write", () => {
  const dir = makeDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "base"], { cwd: dir, stdio: "ignore" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  const journalPath = path.resolve(dir, execFileSync("git", ["rev-parse", "--git-path", "refresh-outputs.json"], { cwd: dir, encoding: "utf8" }).trim());
  fs.writeFileSync(journalPath, JSON.stringify({ head, baseline: {}, checkpoint: {} }));
  const original = childProcess.execFileSync;
  const commands = [];
  childProcess.execFileSync = (command, args, options) => {
    if (command === "git") commands.push(args);
    return original(command, args, options);
  };
  syncBuiltinESMExports();
  try {
    writeFileAtomic(path.join(dir, "first.json"), "first", { refreshRecovery: true });
    writeFileAtomic(path.join(dir, "second.json"), "second", { refreshRecovery: true });
  } finally {
    childProcess.execFileSync = original;
    syncBuiltinESMExports();
  }
  assert.strictEqual(commands.length, 2);
  for (const command of commands) assert.deepStrictEqual(command, ["rev-parse", "--show-toplevel", "--path-format=absolute", "--git-path", "refresh-outputs.json", "HEAD"]);
});

test("creates the owner proof before the temporary", () => {
  const dir = makeDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "base"], { cwd: dir, stdio: "ignore" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  const journalPath = execFileSync("git", ["rev-parse", "--git-path", "refresh-outputs.json"], { cwd: dir, encoding: "utf8" }).trim();
  fs.writeFileSync(path.resolve(dir, journalPath), JSON.stringify({ head, baseline: {}, checkpoint: {} }));
  const open = fs.openSync;
  const order = [];
  fs.openSync = (file, ...rest) => {
    if (typeof file === "string" && file.endsWith(".tmp")) order.push("temporary");
    else if (typeof file === "string" && file.endsWith(".tmp.owner")) order.push("owner");
    return open(file, ...rest);
  };
  try {
    writeFileAtomic(path.join(dir, "out.json"), "payload", { refreshRecovery: true });
  } finally {
    fs.openSync = open;
  }
  assert.deepStrictEqual(order, ["owner", "temporary"]);
});

test("refresh proof stays disabled without an active journal", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  writeFileAtomic(destination, "payload", { refreshRecovery: true });
  assert.deepStrictEqual(fs.readdirSync(dir), ["out.json"]);
});
