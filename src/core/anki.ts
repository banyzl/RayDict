import { z } from "zod";
import { SavedRecord } from "./schema";
import { ankiFields } from "./render";
import { requestJson } from "./http";

export interface AnkiSettings {
  endpoint: string;
  key?: string;
  deck: string;
  model: string;
  front: string;
  back: string;
}
export async function sendToAnki(
  record: SavedRecord,
  settings: AnkiSettings,
): Promise<number> {
  const url = new URL(settings.endpoint);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("AnkiConnect 仅允许本机地址");
  if (!settings.front || !settings.back || settings.front === settings.back)
    throw new Error("请配置不同的 Anki 正面和背面字段");
  async function invoke(action: string, params: Record<string, unknown> = {}) {
    const response = z
      .object({ result: z.unknown(), error: z.string().nullable() })
      .parse(
        await requestJson(settings.endpoint, AbortSignal.timeout(8000), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            version: 6,
            params,
            ...(settings.key ? { key: settings.key } : {}),
          }),
        }),
      );
    if (response.error) throw new Error(response.error);
    return response.result;
  }
  const fields = z
    .array(z.string())
    .parse(await invoke("modelFieldNames", { modelName: settings.model }));
  if (!fields.includes(settings.front) || !fields.includes(settings.back))
    throw new Error("Anki 笔记类型中没有配置的正面或背面字段");
  const decks = z.array(z.string()).parse(await invoke("deckNames"));
  if (!decks.includes(settings.deck))
    throw new Error("Anki 牌组不存在，请在扩展设置中填写已有牌组");
  const content = ankiFields(record);
  return z.number().parse(
    await invoke("addNote", {
      note: {
        deckName: settings.deck,
        modelName: settings.model,
        fields: {
          [settings.front]: content.front,
          [settings.back]: content.back,
        },
        options: { allowDuplicate: false },
        tags: ["raydict"],
      },
    }),
  );
}
