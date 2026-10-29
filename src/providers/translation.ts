import { z } from "zod";
import { DictionaryProvider } from "../core/schema";
import { requestJson } from "../core/http";

const MyMemoryResponse = z.object({
  responseStatus: z.union([z.number(), z.string()]),
  responseData: z.object({ translatedText: z.string() }).optional(),
});
export const myMemoryProvider: DictionaryProvider = {
  async lookup({ input, profile, signal }) {
    if (Buffer.byteLength(input.text, "utf8") > 500)
      throw new Error("MyMemory 单次最多 500 字节，请改用 DeepL 或 AI");
    const params = new URLSearchParams({
      q: input.text,
      langpair: `${profile.sourceLanguage}|${profile.targetLanguage}`,
    });
    const data = MyMemoryResponse.parse(
      await requestJson(
        `https://api.mymemory.translated.net/get?${params}`,
        signal,
      ),
    );
    if (Number(data.responseStatus) !== 200)
      throw new Error("MyMemory 无可用结果、语言不支持或额度已用完");
    const text = data.responseData?.translatedText;
    return text
      ? {
          summary: text,
          entries: [],
          translation: text,
          attributions: [
            {
              label: "MyMemory · 机器翻译 / 翻译记忆",
              url: "https://mymemory.translated.net/",
            },
          ],
        }
      : null;
  },
};
export const deepLProvider: DictionaryProvider = {
  async lookup({ input, profile, signal, token }) {
    if (!token) throw new Error("请在扩展设置中填写 DeepL API Key");
    const normalize = (language: string) =>
      /^zh/i.test(language) ? "ZH" : language.toUpperCase();
    const host = token.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
    const data = z
      .object({ translations: z.array(z.object({ text: z.string() })) })
      .parse(
        await requestJson(`https://${host}/v2/translate`, signal, {
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: [input.text],
            source_lang: normalize(profile.sourceLanguage),
            target_lang: normalize(profile.targetLanguage),
            ...(input.context ? { context: input.context } : {}),
          }),
        }),
      );
    const text = data.translations.map((t) => t.text).join("\n");
    return text
      ? {
          summary: text,
          entries: [],
          translation: text,
          attributions: [
            { label: "DeepL · 机器翻译", url: "https://www.deepl.com/" },
          ],
        }
      : null;
  },
};
