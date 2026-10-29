import {
  DictionaryProvider,
  DictionaryEntry,
  ProviderConfig,
  ProviderResult,
} from "../core/schema";
import { requestJson, safeUrl } from "../core/http";

/** A deliberately small data path language. No eval, scripts, filters or prototype access. */
export function valuesAt(data: unknown, path: string): unknown[] {
  if (!path) return [data];
  if (!/^(?:[\w-]+|\[\d*\])(?:\.[\w-]+|\[\d*\])*$/.test(path))
    throw new Error("无效的数据路径");
  const tokens = [...path.matchAll(/([\w-]+)|\[(\d*)\]/g)].map(
    (match) => match[1] ?? match[2],
  );
  let values: unknown[] = [data];
  for (const token of tokens) {
    if (["__proto__", "constructor", "prototype"].includes(token))
      throw new Error("禁止访问原型字段");
    values = values.flatMap((value) => {
      if (token === "") return Array.isArray(value) ? value : [];
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, token)
      )
        return [];
      return [(value as Record<string, unknown>)[token]];
    });
  }
  return values;
}
function stringsAt(data: unknown, path?: string): string[] {
  if (path === undefined) return [];
  return valuesAt(data, path)
    .flat(3)
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
}
export function substitute(
  value: unknown,
  vars: Record<string, string>,
): unknown {
  if (typeof value === "string")
    return value.replace(
      /\{(word|context|source|target|token)\}/g,
      (_, name: string) => vars[name] ?? "",
    );
  if (Array.isArray(value)) return value.map((item) => substitute(item, vars));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, vars)]),
    );
  return value;
}
export function validateJsonProvider(config: ProviderConfig): void {
  if (config.kind !== "json") return;
  if (!config.endpoint || !config.mapping)
    throw new Error("请填写 API 地址和释义映射");
  if (
    config.endpoint.includes("{token}") ||
    JSON.stringify(config.body ?? {}).includes("{token}")
  )
    throw new Error("密钥只能通过请求头传递");
  if (!safeUrl(config.endpoint.replace(/\{\w+\}/g, "test")))
    throw new Error("API 地址需要 HTTPS，本机服务可使用 HTTP");
  if (
    config.tokenSlot === "none" &&
    Object.values(config.headers).some((v) => v.includes("{token}"))
  )
    throw new Error("请为请求头选择密钥槽位");
  for (const value of Object.values(config.mapping))
    if (value !== undefined) valuesAt({}, value);
}
export function mapJsonResult(
  data: unknown,
  config: ProviderConfig,
  word: string,
): ProviderResult | null {
  const mapping = config.mapping;
  if (!mapping || data === null) return null;
  const rows = valuesAt(data, mapping.entries).flat(1).slice(0, 100);
  const entries: DictionaryEntry[] = [];
  const audio: { url: string; label: string }[] = [];
  for (const row of rows) {
    const definitions = stringsAt(row, mapping.definition).slice(0, 100);
    if (!definitions.length) continue;
    entries.push({
      headword: stringsAt(row, mapping.headword)[0] ?? word,
      phonetic: stringsAt(row, mapping.phonetic)[0],
      senses: definitions.map((definition) => ({
        definition,
        partOfSpeech: stringsAt(row, mapping.partOfSpeech)[0],
        examples: stringsAt(row, mapping.example).slice(0, 20),
      })),
    });
    for (const value of stringsAt(row, mapping.audio)) {
      const url = safeUrl(value);
      if (url) audio.push({ url, label: "词典发音" });
    }
  }
  if (!entries.length) return null;
  return {
    summary: entries[0].senses[0].definition,
    entries,
    audio,
    attributions: [
      {
        label: config.attribution || config.name,
        url: config.attributionUrl ? safeUrl(config.attributionUrl) : undefined,
      },
    ],
  };
}
export const jsonProvider: DictionaryProvider = {
  async lookup({ input, profile, config, signal, token }) {
    validateJsonProvider(config);
    if (config.tokenSlot !== "none" && !token)
      throw new Error("请先在扩展设置中填写所选 API 密钥");
    const vars = {
      word: input.text,
      context: input.context ?? "",
      source: profile.sourceLanguage,
      target: profile.targetLanguage,
      token: token ?? "",
    };
    const url = config.endpoint!.replace(
      /\{(word|source|target|context)\}/g,
      (_, name: string) => encodeURIComponent(vars[name as keyof typeof vars]),
    );
    const headers = substitute(config.headers, vars) as Record<string, string>;
    if (config.method === "POST") headers["Content-Type"] = "application/json";
    const data = await requestJson(url, signal, {
      method: config.method,
      headers,
      body:
        config.method === "POST"
          ? JSON.stringify(substitute(config.body ?? {}, vars))
          : undefined,
    });
    return mapJsonResult(data, config, input.text);
  },
};
