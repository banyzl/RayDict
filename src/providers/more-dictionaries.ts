import { load } from "cheerio/slim";
import { z } from "zod";
import {
  DictionaryEntry,
  DictionaryProvider,
  ProviderResult,
  Sense,
  LookupChoice,
} from "../core/schema";
import { requestHtml, requestJson, safeUrl } from "../core/http";
import { uniqueChoices, hasDefinition } from "../core/lookup-choices";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];
function document(html: string) {
  const $ = load(html);
  $("script,style,button,iframe,noscript").remove();
  return $;
}
function sound(value: string | undefined, base: string) {
  try {
    return value ? safeUrl(new URL(value, base).href) : undefined;
  } catch {
    return undefined;
  }
}
function result(
  entries: DictionaryEntry[],
  label: string,
  url: string,
  audio: NonNullable<ProviderResult["audio"]> = [],
): ProviderResult | null {
  if (!entries.length) return null;
  return {
    summary: entries[0].senses[0].definition,
    entries,
    audio: [...new Map(audio.map((item) => [item.url, item])).values()],
    retention: "session",
    attributions: [{ label, url }],
  };
}
function spellingResult(
  choices: LookupChoice[],
  label: string,
  url: string,
): ProviderResult | null {
  choices = uniqueChoices(choices, 20);
  if (!choices.length) return null;
  return {
    summary: `${choices.length} 个拼写候选 · 回车选择`,
    entries: [],
    choices,
    choicePrompt:
      "没有找到完全匹配的词条。以下是词典原站提供的候选，请自行选择。",
    retention: "session",
    attributions: [{ label, url }],
  };
}
export function parseDictcnSuggestions(
  html: string,
  word: string,
): ProviderResult | null {
  const $ = document(html);
  const choices: LookupChoice[] = [];
  $(".unfind .ifufind")
    .parent()
    .find("ul > li")
    .each((_, li) => {
      const link = $(li).children("a[href]").first();
      try {
        const url = new URL(link.attr("href") ?? "", "https://dict.cn/");
        const query = decodeURIComponent(url.pathname.slice(1));
        if (
          url.origin !== "https://dict.cn" ||
          !query ||
          query.includes("/") ||
          !link.text().trim() ||
          query === word
        )
          return;
        choices.push({
          title: clean(link.text()),
          description: clean($(li).text()).slice(0, 400),
          kind: "spelling",
          target: { query },
        });
      } catch {
        /* Ignore malformed links rather than guessing a word. */
      }
    });
  return spellingResult(
    choices,
    "海词词典 · 拼写候选",
    `https://dict.cn/${encodeURIComponent(word)}`,
  );
}
export function parseOxfordSuggestions(
  html: string,
  word: string,
): ProviderResult | null {
  const $ = document(html);
  const choices: LookupChoice[] = [];
  $(".result-list a.dym-link[href]").each((_, node) => {
    const link = $(node);
    try {
      const url = new URL(
        link.attr("href")!,
        "https://www.oxfordlearnersdictionaries.com/",
      );
      const query = url.searchParams.get("q");
      if (
        url.origin !== "https://www.oxfordlearnersdictionaries.com" ||
        url.pathname !== "/search/english/" ||
        !query ||
        query === word
      )
        return;
      choices.push({
        title: clean(link.text()) || query,
        description: "牛津词典提供的拼写候选",
        kind: "spelling",
        target: { query },
      });
    } catch {
      /* Ignore invalid suggestion links. */
    }
  });
  return spellingResult(
    choices,
    "Oxford Advanced Learner’s Dictionary · 拼写候选",
    `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(word)}`,
  );
}

export function parseBing(html: string, word: string): ProviderResult | null {
  const $ = document(html);
  const root = $(".qdef").first();
  const senses: Sense[] = root
    .children("ul")
    .children("li")
    .toArray()
    .map((li) => ({
      definition: clean($(li).find(".def").first().text()),
      partOfSpeech: clean($(li).find(".pos").first().text()),
    }))
    .filter((sense) => sense.definition);
  if (!senses.length) return null;
  senses[0].examples = $(".se_li1")
    .slice(0, 8)
    .toArray()
    .map((li) =>
      [clean($(li).find(".sen_en").text()), clean($(li).find(".sen_cn").text())]
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
  const url = `https://cn.bing.com/dict/search?${new URLSearchParams({ q: word })}`;
  const audio = root
    .find(".hd_area [data-mp3link]")
    .toArray()
    .flatMap((node) => {
      const url = sound($(node).attr("data-mp3link"), "https://cn.bing.com");
      return url
        ? [
            {
              url,
              label: $(node).attr("id")?.includes("uk")
                ? "英式发音"
                : "美式发音",
            },
          ]
        : [];
    });
  return result(
    [
      {
        headword: clean(root.find("h1").first().text()) || word,
        phonetic: unique(
          root
            .find(".hd_prUS,.hd_pr")
            .toArray()
            .map((node) => clean($(node).text())),
        ).join(" · "),
        senses,
      },
    ],
    "必应词典 · 公开词条",
    url,
    audio,
  );
}

export function parseDictcn(html: string, word: string): ProviderResult | null {
  const $ = document(html);
  const senses: Sense[] = $(".dict-basic-ul > li")
    .toArray()
    .map((node) => ({
      definition: clean($(node).children("strong").text()),
      partOfSpeech: clean($(node).children("span").first().text()),
    }))
    .filter((sense) => sense.definition);
  if (!senses.length) return parseDictcnSuggestions(html, word);
  senses[0].examples = $(".layout.sort ol li")
    .slice(0, 8)
    .toArray()
    .map((node) => {
      const item = $(node).clone();
      item.find("br").replaceWith("\n");
      return item.text().split("\n").map(clean).filter(Boolean).join("\n");
    })
    .filter(Boolean);
  $(".layout.en").each((_, layout) => {
    const pos = clean($(layout).children("span").first().text()).replace(
      /:$/,
      "",
    );
    $(layout)
      .find("ol > li")
      .each((_, node) => {
        const item = $(node).clone();
        const examples = item
          .find("p")
          .toArray()
          .map((p) => clean($(p).text()))
          .filter(Boolean);
        item.find("p").remove();
        const definition = clean(item.text());
        if (definition)
          senses.push({ definition, partOfSpeech: pos, examples });
      });
  });
  return result(
    [
      {
        headword: clean($(".word h1").first().text()) || word,
        phonetic: clean($(".word .phonetic").first().text()),
        senses,
      },
    ],
    "海词词典 · 公开词条",
    `https://dict.cn/${encodeURIComponent(word)}`,
  );
}

export function parseOxford(
  html: string,
  word: string,
  url: string,
): ProviderResult | null {
  const $ = document(html);
  const entries: DictionaryEntry[] = [];
  const audio: NonNullable<ProviderResult["audio"]> = [];
  $(".entry").each((_, node) => {
    const root = $(node);
    const head = root.find(".top-container").first();
    const pos = clean(head.find(".pos").first().text());
    const senses: Sense[] = [];
    root.find(".sense").each((_, node) => {
      const sense = $(node);
      // Only the definition belonging to this sense; nested subsenses are separate rows.
      const definitions = sense
        .find(".def")
        .filter((_, definition) => $(definition).closest(".sense")[0] === node);
      const definition = unique(
        definitions.toArray().map((d) => clean($(d).text())),
      ).join("\n");
      if (!definition) return;
      const examples = sense
        .find(".x")
        .filter((_, x) => $(x).closest(".sense")[0] === node)
        .slice(0, 8)
        .toArray()
        .map((x) => clean($(x).text()))
        .filter(Boolean);
      senses.push({ definition, partOfSpeech: pos, examples });
    });
    if (!senses.length) return;
    entries.push({
      headword: clean(head.find(".headword").first().text()) || word,
      phonetic: unique(
        head
          .find(".phon")
          .toArray()
          .map((node) => clean($(node).text())),
      ).join(" · "),
      senses,
    });
    head.find("[data-src-mp3]").each((_, node) => {
      const src = sound($(node).attr("data-src-mp3"), url);
      if (src)
        audio.push({
          url: src,
          label: $(node).hasClass("pron-uk") ? "英式发音" : "美式发音",
        });
    });
  });
  return (
    result(
      entries,
      "Oxford Advanced Learner’s Dictionary · 牛津大学出版社",
      url,
      audio,
    ) ?? parseOxfordSuggestions(html, word)
  );
}

export function parseLongman(
  html: string,
  word: string,
  url: string,
): ProviderResult | null {
  const $ = document(html);
  const entries: DictionaryEntry[] = [];
  const audio: NonNullable<ProviderResult["audio"]> = [];
  $(".dictionary .ldoceEntry").each((_, node) => {
    const root = $(node);
    const head = root.children(".Head").first();
    const pos = clean(head.find(".POS").first().text());
    const senses: Sense[] = [];
    root.find(".Sense").each((_, node) => {
      const sense = $(node);
      const definition = unique(
        sense
          .find(".DEF")
          .filter((_, d) => $(d).closest(".Sense")[0] === node)
          .toArray()
          .map((d) => clean($(d).text())),
      ).join("\n");
      if (!definition) return;
      const examples = sense
        .find(".EXAMPLE")
        .slice(0, 8)
        .toArray()
        .map((x) => clean($(x).text()))
        .filter(Boolean);
      senses.push({ definition, partOfSpeech: pos, examples });
    });
    if (!senses.length) return;
    entries.push({
      headword: clean(head.find(".HWD").first().text()) || word,
      phonetic: unique(
        head
          .find(".PRON")
          .toArray()
          .map((node) => `/${clean($(node).text())}/`),
      ).join(" · "),
      senses,
    });
    head.find("[data-src-mp3]").each((_, node) => {
      const src = sound($(node).attr("data-src-mp3"), url);
      if (src)
        audio.push({
          url: src,
          label: $(node).hasClass("brefile") ? "英式发音" : "美式发音",
        });
    });
  });
  return result(
    entries,
    "Longman Dictionary of Contemporary English · Pearson",
    url,
    audio,
  );
}

const wikiResponse = z.object({
  en: z
    .array(
      z.object({
        partOfSpeech: z.string().optional(),
        definitions: z.array(
          z.object({
            definition: z.string(),
            examples: z.array(z.string()).optional(),
          }),
        ),
      }),
    )
    .optional(),
});
export function parseWiktionary(
  data: unknown,
  word: string,
): ProviderResult | null {
  if (data === null) return null;
  const rows = wikiResponse.parse(data).en ?? [];
  const choices: LookupChoice[] = [];
  for (const row of rows)
    for (const definition of row.definitions) {
      const $ = document(definition.definition);
      $(".form-of-definition-link a[href]").each((_, node) => {
        try {
          const url = new URL(
            $(node).attr("href")!,
            "https://en.wiktionary.org/wiki/",
          );
          const query = decodeURIComponent(url.pathname.slice(6)).replace(
            /_/g,
            " ",
          );
          if (
            url.origin !== "https://en.wiktionary.org" ||
            !url.pathname.startsWith("/wiki/") ||
            (url.hash && url.hash !== "#English") ||
            query.includes(":") ||
            query.toLowerCase() === word.toLowerCase()
          )
            return;
          choices.push({
            title: query,
            description: clean(
              $(node).closest(".form-of-definition").text(),
            ).slice(0, 400),
            kind: "form",
            target: { query },
          });
        } catch {
          /* A normal definition link is not a form-of relation. */
        }
      });
    }
  const text = (html: string) => clean(document(html).root().text());
  const entries: DictionaryEntry[] = rows
    .map((row) => ({
      headword: word,
      senses: row.definitions
        .map((d) => ({
          definition: text(d.definition),
          partOfSpeech: row.partOfSpeech,
          examples: d.examples?.map(text).filter(Boolean),
        }))
        .filter((sense) => sense.definition),
    }))
    .filter((entry) => entry.senses.length);
  const found = result(
    entries,
    "Wiktionary · 英语词条",
    `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#English`,
  );
  if (found) {
    const forms = uniqueChoices(choices, 20);
    if (forms.length) found.choices = forms;
    found.attributions.push({
      label: "Wiktionary · CC BY-SA / GFDL（详见词条页）",
      url: "https://en.wiktionary.org/wiki/Wiktionary:Copyrights",
    });
  }
  return found;
}

function htmlProvider(
  url: (word: string) => string,
  parse: (html: string, word: string, url: string) => ProviderResult | null,
  readNotFound = false,
): DictionaryProvider {
  return {
    async lookup({ input, signal }) {
      let source = url(input.text);
      let html = await requestHtml(source, signal, { readNotFound });
      let found = html ? parse(html, input.text, source) : null;
      // Preserve capitalized proper entries when present; retry lowercase only after a 404.
      const lower = input.text.toLowerCase();
      if ((!found || !hasDefinition(found)) && lower !== input.text) {
        source = url(lower);
        html = await requestHtml(source, signal, { readNotFound });
        const lowercase = html ? parse(html, input.text, source) : null;
        if (lowercase && (hasDefinition(lowercase) || !found))
          found = lowercase;
      }
      return found;
    },
  };
}
const slug = (word: string) =>
  encodeURIComponent(word.trim().replace(/\s+/g, "-"));
export const bingProvider = htmlProvider(
  (word) =>
    `https://cn.bing.com/dict/search?${new URLSearchParams({ q: word })}`,
  parseBing,
);
export const dictcnProvider = htmlProvider(
  (word) => `https://dict.cn/${encodeURIComponent(word)}`,
  parseDictcn,
);
export const oxfordProvider = htmlProvider(
  (word) =>
    `https://www.oxfordlearnersdictionaries.com/definition/english/${slug(word)}`,
  parseOxford,
  true,
);
export const longmanProvider = htmlProvider(
  (word) => `https://www.ldoceonline.com/dictionary/${slug(word)}`,
  parseLongman,
);
export const wiktionaryProvider: DictionaryProvider = {
  async lookup({ input, signal }) {
    return parseWiktionary(
      await requestJson(
        `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(input.text)}`,
        signal,
      ),
      input.text,
    );
  },
};
