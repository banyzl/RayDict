import { closeMainWindow, environment } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { configPath, loadConfig } from "../storage";
export async function openNativeSettings() {
  await loadConfig();
  const application = join(environment.assetsPath, "RayDict Settings.app");
  try {
    await access(application);
  } catch {
    throw new Error(
      "设置窗口尚未构建，请在项目目录运行 npm run build:settings",
    );
  }
  await closeMainWindow();
  await promisify(execFile)("/usr/bin/open", [
    "-a",
    application,
    "--args",
    "--config",
    configPath,
    "--catalog",
    join(environment.assetsPath, "settings-catalog.json"),
  ]);
}
