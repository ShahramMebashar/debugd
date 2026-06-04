#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outDir = path.join(root, "web", "src-tauri", "binaries");

function hostTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const hostLine = output.split("\n").find((line) => line.startsWith("host: "));

  if (!hostLine) {
    throw new Error("could not determine Rust host triple");
  }

  return hostLine.slice("host: ".length).trim();
}

const triple = process.env.TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple();
const extension = triple.includes("windows") ? ".exe" : "";
const outputPath = path.join(outDir, `debugd-${triple}${extension}`);

mkdirSync(outDir, { recursive: true });
console.log(`building debugd sidecar -> binaries/${path.basename(outputPath)}`);

execFileSync(
  "go",
  ["build", "-ldflags", "-s -w", "-o", outputPath, "./cmd/debugd"],
  { cwd: root, stdio: "inherit" },
);
