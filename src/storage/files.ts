import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SavedRecord } from "../core/schema";

/** One atomic file per record: unrelated saves cannot overwrite one shared array. */
export class FileRecordStore {
  constructor(readonly directory: string) {}
  private path(id: string) {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("无效记录 ID");
    return join(this.directory, `${id}.json`);
  }
  async put(record: SavedRecord) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = this.path(record.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async list(): Promise<SavedRecord[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = (await readdir(this.directory)).filter((name) =>
      /^[a-zA-Z0-9-]+\.json$/.test(name),
    );
    const rows = await Promise.all(
      files.map(async (name) => {
        // Corrupt records must surface to the user instead of silently disappearing.
        const record = JSON.parse(
          await readFile(join(this.directory, name), "utf8"),
        ) as SavedRecord;
        if (
          typeof record.id !== "string" ||
          typeof record.text !== "string" ||
          !Array.isArray(record.results)
        )
          throw new Error(`记录损坏：${name}`);
        return record;
      }),
    );
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async remove(id: string) {
    await unlink(this.path(id)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async clear() {
    await Promise.all((await this.list()).map((row) => this.remove(row.id)));
  }
}
