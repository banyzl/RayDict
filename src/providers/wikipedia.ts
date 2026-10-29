import { z } from "zod";
import { load } from "cheerio/slim";
import {
  DictionaryProvider,
  LookupChoice,
  ProviderResult,
} from "../core/schema";
import { requestJson, safeUrl } from "../core/http";
import { uniqueChoices } from "../core/lookup-choices";

type Language = "en" | "zh";
const PageSchema = z.object({
  title: z.string(),
  extract: z.string().optional(),
  fullurl: z.string().optional(),
  missing: z.boolean().optional(),
  index: z.number().optional(),
  pageprops: z.object({ disambiguation: z.string().optional() }).optional(),
});
const ResponseSchema = z.object({
  error: z.object({ info: z.string() }).optional(),
  query: z.object({ pages: z.array(PageSchema) }).optional(),
});
const isDisambiguation = (page: z.infer<typeof PageSchema>) =>
  page.pageprops !== undefined &&
  Object.hasOwn(page.pageprops, "disambiguation");
const pageUrl = (language: string, title: string) =>
  `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
const license = {
  label: "Wikipedia contributors · CC BY-SA 4.0（及适用条款）",
  url: "https://en.wikipedia.org/wiki/Wikipedia:Copyrights",
};
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
function plainText(html: string) {
  const $ = load(html);
  $("script,style").remove();
  return clean($.root().text());
}
export function parseWikipedia(
  data: unknown,
  language: string,
): ProviderResult | null {
  const response = ResponseSchema.parse(data);
  if (response.error) throw new Error("维基百科暂时无法完成查询");
  const pages = (response.query?.pages ?? [])
    .filter((page) => !page.missing && !isDisambiguation(page) && page.extract)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (!pages.length) return null;
  return {
    summary: pages[0].extract!.split("\n")[0],
    entries: pages.map((page) => ({
      headword: page.title,
      senses: [{ definition: page.extract! }],
    })),
    attributions: [
      ...pages.map((page) => ({
        label: `维基百科 · ${page.title}`,
        url: page.fullurl
          ? safeUrl(page.fullurl)
          : pageUrl(language, page.title),
      })),
      license,
    ],
  };
}
const ParseSchema = z.object({
  error: z.object({ info: z.string() }).optional(),
  parse: z
    .object({
      title: z.string(),
      text: z.string(),
      links: z
        .array(
          z.object({
            ns: z.number(),
            title: z.string(),
            exists: z.boolean().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});
export function parseWikipediaDisambiguation(
  data: unknown,
  language: Language,
): LookupChoice[] {
  const response = ParseSchema.parse(data);
  if (response.error) throw new Error("维基百科候选列表暂时不可用");
  if (!response.parse) return [];
  const page = response.parse;
  const allowed = new Set(
    page.links
      .filter((link) => link.ns === 0 && link.exists !== false)
      .map((link) => link.title),
  );
  const $ = load(page.text);
  $(
    "script,style,table,nav,.hatnote,.navbox,.metadata,.toc,.reflist,.mw-editsection,sup",
  ).remove();
  const choices: LookupChoice[] = [];
  $(".mw-parser-output ul > li, .mw-parser-output ol > li").each((_, node) => {
    const item = $(node).clone();
    item.children("ul,ol").remove();
    const description = clean(item.text());
    for (const anchor of item.find("a[href]").toArray()) {
      const link = $(anchor);
      if (link.hasClass("new")) continue;
      try {
        const url = new URL(
          link.attr("href")!,
          `https://${language}.wikipedia.org/wiki/`,
        );
        if (
          url.origin !== `https://${language}.wikipedia.org` ||
          !url.pathname.startsWith("/wiki/")
        )
          continue;
        const title = decodeURIComponent(url.pathname.slice(6)).replace(
          /_/g,
          " ",
        );
        const label = clean(link.text());
        // Skip generic words linked later in an unlinked item's description (e.g. an actor's name).
        if (
          !label ||
          !description.startsWith(label) ||
          !allowed.has(title) ||
          title === page.title
        )
          continue;
        choices.push({
          title,
          description: description.slice(0, 400),
          kind: "article",
          target: { query: title, language },
        });
        break;
      } catch {
        /* Invalid or non-article link. */
      }
    }
  });
  return uniqueChoices(choices);
}
const SearchSchema = z.object({
  error: z.object({ info: z.string() }).optional(),
  query: z
    .object({
      searchinfo: z.object({ suggestion: z.string().optional() }).optional(),
      search: z
        .array(
          z.object({
            title: z.string(),
            ns: z.number().default(0),
            snippet: z.string().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});
export function parseWikipediaSearch(
  data: unknown,
  language: Language,
  query: string,
  exclude?: string,
): LookupChoice[] {
  const response = SearchSchema.parse(data);
  if (response.error) throw new Error("维基百科暂时无法提供搜索建议");
  const choices: LookupChoice[] = [];
  const suggestion = response.query?.searchinfo?.suggestion;
  if (suggestion && suggestion.toLowerCase() !== query.toLowerCase())
    choices.push({
      title: suggestion,
      description: "维基百科提供的拼写建议",
      kind: "spelling",
      target: { query: suggestion, language },
    });
  for (const page of response.query?.search ?? [])
    if (page.ns === 0 && page.title !== exclude)
      choices.push({
        title: page.title,
        description: page.snippet
          ? plainText(page.snippet).slice(0, 400)
          : "维基百科搜索结果",
        kind: "article",
        target: { query: page.title, language },
      });
  return uniqueChoices(choices, 12);
}
function selectionResult(
  choices: LookupChoice[],
  language: Language,
  query: string,
  ambiguous: boolean,
): ProviderResult | null {
  if (!choices.length && !ambiguous) return null;
  return {
    summary: choices.length
      ? `${choices.length} 个可选词条 · 回车选择`
      : "这是消歧页，候选列表暂不可用",
    entries: [],
    choices,
    choicePrompt: ambiguous
      ? choices.length
        ? "此名称可能对应多个百科词条，请选择要查看的条目。"
        : "此名称对应多个词条，暂未读取到候选。可重试，或打开下方原站链接查看。"
      : "没有找到完全匹配的百科条目。以下是维基百科提供的候选，请选择后查看。",
    attributions: [
      { label: `维基百科 · ${query}`, url: pageUrl(language, query) },
      license,
    ],
  };
}
export const wikipediaProvider: DictionaryProvider = {
  async lookup({ input, config, signal, selection }) {
    const language: Language =
      selection?.language ??
      (config.language === "auto"
        ? /\p{Script=Han}/u.test(input.text)
          ? "zh"
          : "en"
        : config.language);
    const base = `https://${language}.wikipedia.org/w/api.php`;
    const request = async (params: Record<string, string>) => {
      try {
        return await requestJson(
          `${base}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`,
          signal,
          {
            headers: {
              "User-Agent": "RayDict/0.4 (personal native dictionary)",
            },
          },
        );
      } catch (error) {
        if (error instanceof Error && /HTTP (429|503)/.test(error.message))
          throw new Error("维基百科服务暂时不可用，请稍后重试，或在原站查看。");
        throw error;
      }
    };
    const data = await request({
      action: "query",
      titles: input.text,
      prop: "extracts|info|pageprops",
      ppprop: "disambiguation",
      exintro: "1",
      explaintext: "1",
      inprop: "url",
      redirects: "1",
    });
    const response = ResponseSchema.parse(data);
    if (response.error) throw new Error("维基百科暂时无法完成查询");
    const ambiguous = response.query?.pages.find(
      (page) => !page.missing && isDisambiguation(page),
    );
    if (ambiguous) {
      const candidates = parseWikipediaDisambiguation(
        await request({
          action: "parse",
          page: ambiguous.title,
          prop: "text|links",
          redirects: "1",
          disablelimitreport: "1",
          disableeditsection: "1",
        }),
        language,
      );
      if (candidates.length)
        return selectionResult(candidates, language, ambiguous.title, true);
    } else {
      const direct = parseWikipedia(data, language);
      if (direct) return direct;
    }
    const candidates = parseWikipediaSearch(
      await request({
        action: "query",
        list: "search",
        srsearch: input.text,
        srnamespace: "0",
        srlimit: "8",
        srinfo: "suggestion",
        srprop: "snippet",
      }),
      language,
      input.text,
      ambiguous?.title,
    );
    return selectionResult(
      candidates,
      language,
      ambiguous?.title ?? input.text,
      Boolean(ambiguous),
    );
  },
};
