import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { AppConfig, ConfigSchema } from "../core/schema";
import { validateJsonProvider } from "../providers/json";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
export class ConfigFile {
  constructor(readonly path: string) {}
  async read(): Promise<{ revision: number; config: AppConfig } | null> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const data = JSON.parse(text) as { revision: unknown; config: unknown };
    if (!Number.isInteger(data.revision) || Number(data.revision) < 0)
      throw new Error("配置版本损坏，已有文件已保留");
    const config = ConfigSchema.parse(data.config);
    config.providers.forEach(validateJsonProvider);
    return { revision: Number(data.revision), config };
  }
  async write(config: AppConfig, expected: AppConfig | null) {
    const next = ConfigSchema.parse(config);
    next.providers.forEach(validateJsonProvider);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`;
    let acquired = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await mkdir(lock);
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await delay(25);
      }
    }
    if (!acquired) throw new Error("配置正在另一窗口保存，请稍后重试");
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const current = await this.read();
      if (
        (expected === null && current) ||
        (expected !== null &&
          (!current || canonical(current.config) !== canonical(expected)))
      )
        throw new Error("设置已在另一窗口修改，请刷新后重试");
      const revision = (current?.revision ?? -1) + 1;
      await writeFile(
        temporary,
        JSON.stringify({ revision, config: next }, null, 2),
        { mode: 0o600 },
      );
      await rename(temporary, this.path);
      return { revision, config: next };
    } finally {
      await rm(temporary, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}
