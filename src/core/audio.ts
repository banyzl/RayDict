import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeUrl } from "./http";

let playing = false;
export async function playAudio(value: string) {
  if (playing) return;
  const url = safeUrl(value);
  if (!url) throw new Error("无效的音频地址");
  playing = true;
  const folder = await mkdtemp(join(tmpdir(), "raydict-audio-"));
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    if (!response.ok || !response.body) throw new Error("无法下载音频");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.length;
        if (size > 10_000_000) throw new Error("音频文件超过 10 MB 限制");
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const path = join(folder, "pronunciation.audio");
    await writeFile(path, Buffer.concat(chunks));
    await promisify(execFile)("/usr/bin/afplay", [path], { timeout: 60000 });
  } finally {
    playing = false;
    await rm(folder, { recursive: true, force: true });
  }
}
