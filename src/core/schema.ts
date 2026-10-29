import { z } from "zod";
import catalogData from "./catalog-data.json";

const path = z
  .string()
  .max(300)
  .regex(/^[\w.[\]-]*$/, "路径只支持字段、数字下标和 []");
export const ProviderSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    kind: z.enum([
      "dictionaryapi",
      "glossary",
      "mymemory",
      "deepl",
      "ai",
      "json",
      "youdao",
      "cambridge",
      "zdic",
      "wikipedia",
      "bing",
      "dictcn",
      "oxford",
      "longman",
      "wiktionary",
    ]),
    trigger: z.enum(["auto", "manual"]).default("auto"),
    scope: z.enum(["word", "any"]).default("any"),
    language: z.enum(["auto", "en", "zh"]).default("auto"),
    inputLanguage: z.enum(["any", "latin", "han"]).default("any"),
    timeoutMs: z.number().int().min(100).max(60000).default(12000),
    endpoint: z.string().max(2000).optional(),
    method: z.enum(["GET", "POST"]).default("GET"),
    headers: z.record(z.string(), z.string()).default({}),
    body: z.unknown().optional(),
    tokenSlot: z.enum(["none", "1", "2", "3"]).default("none"),
    mapping: z
      .object({
        entries: path.default(""),
        headword: path.optional(),
        definition: path,
        phonetic: path.optional(),
        partOfSpeech: path.optional(),
        example: path.optional(),
        audio: path.optional(),
      })
      .optional(),
    attribution: z.string().max(300).optional(),
    attributionUrl: z.string().max(2000).optional(),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderSchema>;

export const ProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  providerIds: z.array(z.string()).max(40),
  sourceLanguage: z.string().min(2).max(20).default("en"),
  targetLanguage: z.string().min(2).max(20).default("zh-CN"),
  aiPrompt: z
    .string()
    .max(4000)
    .default("用中文解释词义，提供词性、例句、常见搭配与近义词区别。"),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.number().int().min(1).max(3).default(1),
    providers: z.array(ProviderSchema).max(80),
    profiles: z.array(ProfileSchema).min(1).max(30),
    activeProfileId: z.string(),
  })
  .superRefine((value, ctx) => {
    const ids = value.providers.map((p) => p.id);
    const profiles = value.profiles.map((p) => p.id);
    if (
      new Set(ids).size !== ids.length ||
      new Set(profiles).size !== profiles.length
    )
      ctx.addIssue({ code: "custom", message: "Provider 或 Profile ID 重复" });
    if (!profiles.includes(value.activeProfileId))
      ctx.addIssue({ code: "custom", message: "当前情景模式不存在" });
    for (const profile of value.profiles) {
      if (
        new Set(profile.providerIds).size !== profile.providerIds.length ||
        profile.providerIds.some((id) => !ids.includes(id))
      )
        ctx.addIssue({
          code: "custom",
          message: "情景模式中的词典重复或不存在",
        });
    }
  });
export type AppConfig = z.infer<typeof ConfigSchema>;

export interface QueryInput {
  text: string;
  context?: string;
  sourceApp?: string;
  sourceUrl?: string;
}
export interface Sense {
  definition: string;
  partOfSpeech?: string;
  examples?: string[];
  synonyms?: string[];
}
export interface DictionaryEntry {
  headword: string;
  phonetic?: string;
  senses: Sense[];
}
export interface Attribution {
  label: string;
  url?: string;
}
export interface LookupTarget {
  query: string;
  language?: "en" | "zh";
}
export interface LookupChoice {
  title: string;
  description?: string;
  kind: "article" | "form" | "spelling" | "related";
  target: LookupTarget;
}
export interface ProviderResult {
  summary: string;
  entries: DictionaryEntry[];
  audio?: { url: string; label: string }[];
  translation?: string;
  explanation?: string;
  attributions: Attribution[];
  generated?: boolean;
  retention?: "session";
  choices?: LookupChoice[];
  choicePrompt?: string;
}
export type ResultState = {
  providerId: string;
  status:
    | "waiting"
    | "manual"
    | "loading"
    | "success"
    | "empty"
    | "choices"
    | "error"
    | "skipped";
  result?: ProviderResult;
  message?: string;
  selection?: LookupTarget;
};
export interface ProviderContext {
  input: QueryInput;
  profile: Profile;
  config: ProviderConfig;
  signal: AbortSignal;
  token?: string;
  selection?: LookupTarget;
}
export interface DictionaryProvider {
  lookup(context: ProviderContext): Promise<ProviderResult | null>;
}
export interface SavedRecord extends QueryInput {
  id: string;
  profileId: string;
  profileName: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
  references?: Attribution[];
  results: {
    providerId: string;
    providerName: string;
    result: ProviderResult;
  }[];
}

export const DEFAULT_CONFIG: AppConfig = ConfigSchema.parse({
  schemaVersion: 1,
  activeProfileId: "general",
  catalogVersion: 3,
  providers: catalogData.map((item) => item.config),
  profiles: [
    {
      id: "general",
      name: "日常阅读",
      providerIds: [
        "youdao",
        "cambridge",
        "zdic",
        "wikipedia",
        "free-dictionary",
        "cs-glossary",
        "mymemory",
        "deepl",
        "raycast-ai",
      ],
    },
    {
      id: "cs",
      name: "计算机阅读",
      providerIds: [
        "cs-glossary",
        "youdao",
        "cambridge",
        "wikipedia",
        "free-dictionary",
        "raycast-ai",
        "mymemory",
      ],
      aiPrompt:
        "用中文解释计算机科学语境中的含义，给出准确术语、简短代码示例、易混概念和英文例句。没有足够语境时明确说明。",
    },
    {
      id: "translation",
      name: "句子翻译",
      providerIds: ["mymemory", "deepl", "raycast-ai"],
      aiPrompt: "将文本翻译为目标语言，说明关键术语和歧义。",
    },
  ],
});
