import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.env.UPDATE_MODE;
const mailbox = process.env.UPDATE_MAILBOX;
const stop = process.env.UPDATE_STOP;
const start = process.env.UPDATE_START;
const compose = ["compose", "-f", "docker-compose.local.yml", "-f", "docker-compose.updates.yml"];
const revisionPattern = /^[a-f0-9]{40}$/;
const interval = 60 * 60 * 1000;

function run(file, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: root,
      stdio: capture ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let output = "";
    if (capture) child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${file} exited with status ${code}.`));
    });
  });
}

function npm(...args) {
  return process.platform === "win32"
    ? run("cmd.exe", ["/d", "/c", "npm", ...args])
    : run("npm", args);
}

const git = (...args) => run("git", args, true);
const hook = (path) => run(process.execPath, [path]);

export function updateTarget(current, incoming, isAncestor) {
  if (!revisionPattern.test(current) || !revisionPattern.test(incoming)) {
    throw new Error("Invalid Git revision.");
  }
  if (current === incoming) return undefined;
  if (!isAncestor) throw new Error("The checkout cannot fast-forward to origin/main.");
  return incoming;
}

async function check() {
  if (await git("branch", "--show-current") !== "main") throw new Error("Switch to main.");
  if (!/^https:\/\/github\.com\/davidmcg1975\/aijobhunter(?:\.git)?$/.test(await git("remote", "get-url", "origin"))) {
    throw new Error("Origin must point to the AI Contract Hunter repository on GitHub.");
  }
  await git("fetch", "--no-tags", "origin", "refs/heads/main");
  const current = await git("rev-parse", "HEAD");
  const incoming = await git("rev-parse", "FETCH_HEAD");
  const ancestor = await git("merge-base", current, incoming);
  return updateTarget(current, incoming, ancestor === current);
}

async function install(revision) {
  if (await check() !== revision) throw new Error("The available revision changed. Check again.");
  if (await git("status", "--porcelain")) throw new Error("The checkout has local changes.");
  if (mode === "docker") {
    await run("docker", [...compose, "config", "--quiet"]);
    await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  } else {
    await hook(stop);
  }
  await run("git", ["merge", "--ff-only", revision]);
  if (mode === "docker") {
    await run("docker", [...compose, "up", "-d", "--build", "--wait"]);
    return;
  }

  await npm("ci", "--include=dev");
  if (mode === "dev-pglite") {
    await npm("run", "db:generate");
    await npm("run", "db:local");
  } else {
    await npm("run", "build");
    await npm("exec", "--", "prisma", "migrate", "deploy");
  }
  await hook(start);
}

async function main() {
  if (!["docker", "dev-pglite", "production"].includes(mode) || !mailbox || !isAbsolute(mailbox)) {
    throw new Error("Set UPDATE_MODE and an absolute UPDATE_MAILBOX path.");
  }
  if (mode !== "docker" && (!stop || !start || !isAbsolute(stop) || !isAbsolute(start))) {
    throw new Error("Set absolute paths to the Node.js stop and start scripts.");
  }
  await mkdir(mailbox, { recursive: true });
  const lockPath = join(mailbox, "host.lock");
  const lock = await open(lockPath, "wx");
  const requestPath = join(mailbox, "request.json");
  const statusPath = join(mailbox, "status.json");
  let automatic = false;
  let nextCheck = Infinity;
  let phase = "idle";
  let revision;
  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { running = false; });

  async function publish() {
    const temporary = join(mailbox, `status-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ phase, automatic, revision, updatedAt: Date.now() }), { flag: "wx" });
      await rename(temporary, statusPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async function processRequest(request) {
    if (request?.command === "enable" || request?.command === "disable") {
      automatic = request.command === "enable";
      nextCheck = automatic ? Date.now() : Infinity;
    } else if (request?.command === "install" && phase === "available" && request.revision === revision) {
      phase = "installing";
      await publish();
      await install(revision);
      revision = undefined;
      phase = "installed";
    } else if (request?.command === "check" || Date.now() >= nextCheck) {
      phase = "checking";
      nextCheck = automatic ? Date.now() + interval : Infinity;
      await publish();
      revision = await check();
      phase = revision ? "available" : "current";
    }
  }

  try {
    // Requests from a previous helper session must never trigger an install.
    await rm(requestPath, { force: true });
    console.log(`Update helper ready in ${mode} mode.`);
    while (running) {
      await publish();
      await sleep(1500);
      if (!running) break;
      try {
        const raw = await readFile(requestPath, "utf8").catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        const request = raw === undefined ? null : JSON.parse(raw);
        if (raw !== undefined) await rm(requestPath);
        await processRequest(request);
      } catch (error) {
        await rm(requestPath, { force: true });
        revision = undefined;
        phase = "error";
        console.error(error.message);
      }
    }
  } finally {
    await rm(statusPath, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
