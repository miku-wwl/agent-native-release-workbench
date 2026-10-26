import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Use the verified project-local LTS runtime for the Windows Node 26 forwarding
// exit bug. This never changes PATH or the machine's global Node installation.
let executable = process.execPath;
if (process.platform === "win32" && Number(process.versions.node.split(".")[0]) >= 26) {
  executable = fileURLToPath(new URL("../data/phase05/node24/node_modules/node-win-x64/bin/node.exe", import.meta.url));
  if (!existsSync(executable)) {
    console.error("Windows Node 26 has a reproduced CLI forwarding exit crash. Use Node 24 LTS or install the isolated runtime: npm install --prefix data/phase05/node24 --no-save --no-package-lock node-win-x64@24.22.1");
    process.exitCode = 1;
  } else {
    const version = spawnSync(executable, ["--version"], { shell: false, encoding: "utf8" });
    if (version.status !== 0 || !/^v24\./.test(version.stdout.trim())) throw new Error("The isolated CLI runtime must be Node 24 LTS.");
    console.error(`[workbench-cli] runtime: ${version.stdout.trim()} (isolated; global Node unchanged)`);
  }
}
if (!process.exitCode) {
  const args = process.argv.slice(2);
  let entry;
  if (args[0] === "--dev") {
    args.shift();
    entry = ["node_modules/@agent-native/core/bin/agent-native.js", "dev", ...args];
  } else if (args[0] === "--phase05-dev") {
    entry = ["verification/phase05/dev-server.mjs"];
  } else {
    entry = ["--import", "tsx", "actions/run.ts", ...args];
  }
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${path.dirname(executable)}${path.delimiter}${env[pathKey] ?? ""}`;
  const child = spawn(executable, entry, { shell: false, stdio: "inherit", env });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("close", (code) => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
