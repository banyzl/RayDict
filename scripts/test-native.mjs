import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const folder = mkdtempSync(join(tmpdir(), "raydict-settings-test-"));
try {
  const path = join(folder, "settings-v1.json");
  const catalog = JSON.parse(
    readFileSync("assets/settings-catalog.json", "utf8"),
  );
  writeFileSync(
    path,
    JSON.stringify({ revision: 0, config: catalog.defaults }),
  );
  const result = spawnSync(
    "assets/RayDict Settings.app/Contents/MacOS/RayDictSettings",
    [
      "--self-test",
      "--config",
      path,
      "--catalog",
      resolve("assets/settings-catalog.json"),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else {
    const { ConfigSchema } = await import("../src/core/schema.ts");
    ConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")).config);
    console.log("OK: native output passes extension schema");
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}
const selection = spawnSync(
  "assets/RayDict Settings.app/Contents/MacOS/RayDictSettings",
  ["--selection-self-test"],
  { stdio: "inherit" },
);
if (selection.status !== 0) process.exitCode = selection.status ?? 1;
