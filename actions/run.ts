import { open } from "node:fs/promises";
import { format } from "node:util";
import { runScript } from "@agent-native/core/scripts";

// Keep the public framework dispatcher, but enter it directly. The framework's
// outer CLI spawns another shell on Windows, which corrupts positional JSON.
async function main() {
  const [actionName, ...originalArgs] = process.argv.slice(2);
  const args: string[] = [];
  let inputFile: string | undefined;
  let jsonOutput = false;
  for (let index = 0; index < originalArgs.length; index++) {
    const value = originalArgs[index];
    if (value === "--json") {
      jsonOutput = true;
    } else if (value === "--input-file" || value.startsWith("--input-file=")) {
      if (inputFile) throw new Error("Use --input-file once.");
      inputFile = value === "--input-file" ? originalArgs[++index] : value.slice(13);
      if (!inputFile || inputFile.startsWith("--")) throw new Error("--input-file needs a local JSON file path.");
    } else {
      args.push(value);
    }
  }
  if (inputFile) {
    if (args.some((value) => value.trim().startsWith("{"))) {
      throw new Error("Use either --input-file or positional JSON.");
    }
    const file = await open(inputFile, "r");
    const bytes = Buffer.alloc(65_537);
    let size = 0;
    try {
      while (size < bytes.length) {
        const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
        if (bytesRead === 0) break;
        size += bytesRead;
      }
    } finally { await file.close(); }
    if (size > 65_536) throw new Error("CLI input exceeds 64 KiB.");
    const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("CLI input must be a JSON object.");
    }
    args.unshift(JSON.stringify(input));
  }
  if (!actionName || actionName === "--help" || args.includes("--help")) {
    process.stdout.write("App CLI: pnpm action <name> --input-file <file.json> [--json]\n");
    process.stdout.write("--json emits structured Action results on stdout; diagnostics go to stderr.\n");
  }
  if (jsonOutput) {
    console.log = (...values: unknown[]) => {
      if (values.length === 1 && values[0] !== null && typeof values[0] === "object") {
        process.stdout.write(`${JSON.stringify(values[0])}\n`);
      } else {
        process.stderr.write(`${format(...values)}\n`);
      }
    };
  }
  process.argv = [process.argv[0], process.argv[1], actionName ?? "--help", ...args];
  await runScript();
}

main().catch((error: unknown) => {
  console.error("Action CLI failed:", error instanceof Error ? error.message : "Unknown failure");
  process.exitCode = 1;
});
