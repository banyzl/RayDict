import { load } from "cheerio/slim";
import {
  DictionaryProvider,
  ProviderResult,
  DictionaryEntry,
  Sense,
  LookupChoice,
} from "../core/schema";
import { requestHtml, safeUrl } from "../core/http";
import { uniqueChoices } from "../core/lookup-choices";
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const unique = <T>(items: T[]) => [...new Set(items)];
function audioUrl(value: string | undefined, base: string) {
  try {
    return value ? safeUrl(new URL(value, base).toString()) : undefined;
  } catch {
    return undefined;
  }
}

export function parseYoudao(html: string, word: string): ProviderResult | null {
  const $ = load(html);
  $("script,style,button").remove();
  const root = $("#phrsListTab");
  const senses = root
    .find(".trans-container > ul > li")
    .toArray()
    .map((node) => clean($(node).text()))
    .filter(Boolean)
    .map((definition) => ({ definition }) as Sense);
  if (!senses.length) return null;
  const examples = $("#bilingual .ol > li")
    .toArray()
    .slice(0, 8)
    .map((node) =>
      $(node)
        .find("p")
        .toArray()
        .slice(0, 2)
        .map((p) => clean($(p).text()))
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
  if (examples.length) senses[0].examples = examples;
  const audio = root
    .find(".dictvoice[data-rel]")
    .toArray()
    .flatMap((node) => {
      const rel = $(node).attr("data-rel")!;
      const type = rel.includes("type=1") ? "1" : "2";
      return [
        {
          url: `https://dict.youdao.com/dictvoice?${new URLSearchParams({ audio: word, type })}`,
          label: type === "1" ? "英式发音" : "美式发音",
        },
      ];
    });
  const phonetic = unique(
    root
      .find(".pronounce")
      .toArray()
      .map((node) => clean($(node).text())),
  ).join(" · ");
  const choices: LookupChoice[] = [];
  for (const sense of senses) {
    for (const match of sense.definition.matchAll(
      /[（(]\s*([A-Za-z][A-Za-z'’ -]{0,79}?)\s*的\s*(复数|过去式|过去分词|现在分词|第三人称单数|比较级|最高级)([^（）()]{0,50})[）)]/g,
    )) {
      const query = match[1].trim();
      if (query.toLowerCase() !== word.toLowerCase())
        choices.push({
          title: query,
          description: `${word} 是 ${query} 的${match[2]}${match[3]}`,
          kind: "form",
          target: { query },
        });
    }
  }
  return {
    summary: senses[0].definition,
    entries: [
      {
        headword: clean(root.find(".keyword").text()) || word,
        phonetic,
        senses,
      },
    ],
    audio,
    choices: uniqueChoices(choices, 20),
    retention: "session",
    attributions: [
      {
        label: "网易有道词典 · 公开词条",
        url: `https://dict.youdao.com/w/${encodeURIComponent(word)}/`,
      },
    ],
  };
}
export const youdaoProvider: DictionaryProvider = {
  async lookup({ input, signal }) {
    const html = await requestHtml(
      `https://dict.youdao.com/w/${encodeURIComponent(input.text)}/`,
      signal,
    );
    return html ? parseYoudao(html, input.text) : null;
  },
};

export function parseCambridge(
  html: string,
  word: string,
  source: string,
): ProviderResult | null {
  const $ = load(html);
  $("script,style,button").remove();
  const entries: DictionaryEntry[] = [];
  const audio: { url: string; label: string }[] = [];
  $(".entry-body__el").each((_, node) => {
    const root = $(node);
    const senses: Sense[] = [];
    const pos = clean(root.find(".pos.dpos").first().text());
    root.find(".def-block.ddef_block").each((_, block) => {
      const definition = clean($(block).find(".def.ddef_d").first().text());
      const translation = clean(
        $(block).children(".def-body").children(".trans.dtrans").text(),
      );
      if (!definition && !translation) return;
      const examples = $(block)
        .find(".examp.dexamp")
        .toArray()
        .map((example) => clean($(example).text()))
        .filter(Boolean);
      senses.push({
        definition: [definition, translation].filter(Boolean).join("\n"),
        partOfSpeech: pos,
        examples,
      });
    });
    if (!senses.length) return;
    const phonetic = unique(
      root
        .find(".pos-header .ipa")
        .toArray()
        .map((p) => clean($(p).text())),
    )
      .map((ipa) => `/${ipa}/`)
      .join(" · ");
    entries.push({
      headword: clean(root.find(".hw.dhw").first().text()) || word,
      phonetic,
      senses,
    });
    root.find(".pos-header source[type='audio/mpeg']").each((_, element) => {
      const url = audioUrl(
        $(element).attr("src"),
        "https://dictionary.cambridge.org",
      );
      if (url && !audio.some((a) => a.url === url))
        audio.push({
          url,
          label: url.includes("/uk_")
            ? "英式发音"
            : url.includes("/us_")
              ? "美式发音"
              : "词典发音",
        });
    });
  });
  if (!entries.length) return null;
  return {
    summary: entries[0].senses[0].definition,
    entries,
    audio,
    retention: "session",
    attributions: [
      { label: "Cambridge Dictionary · 剑桥大学出版社", url: source },
    ],
  };
}
export const cambridgeProvider: DictionaryProvider = {
  async lookup({ input, signal, config }) {
    const dictionary =
      config.language === "en" ? "english" : "english-chinese-simplified";
    const url = `https://dictionary.cambridge.org/dictionary/${dictionary}/${encodeURIComponent(input.text.replace(/\s+/g, "-"))}`;
    const html = await requestHtml(url, signal);
    return html ? parseCambridge(html, input.text, url) : null;
  },
};

export function parseZdic(html: string, word: string): ProviderResult | null {
  const $ = load(html);
  $("script,style,button,.dict-section__footer,.feedback-link").remove();
  const entries: DictionaryEntry[] = [];
  const phonetic =
    clean($(".meta-pinyin").first().text()) ||
    clean($(".dicpy .pinyin").first().text());
  $("section.dict-section[data-section], [data-type-block]").each((_, node) => {
    const root = $(node);
    const title =
      root.attr("data-section") || root.attr("data-type-block") || "";
    if (!/基本解释|词语解释|详细解释/.test(title)) return;
    const senses = root
      .find(".xxjs-item, .sense-item, .jnr > p, .jnr > ol > li")
      .toArray()
      .map((part) => {
        const definitionNode = $(part)
          .find(".xxjs-item__def, .sense-definition")
          .first();
        const definition = clean(
          definitionNode.length ? definitionNode.text() : $(part).text(),
        );
        const examples = $(part)
          .find(".xxjs-also__text, .sense-example")
          .toArray()
          .map((example) => clean($(example).text()))
          .filter(Boolean);
        return { definition, examples };
      })
      .filter((sense) => sense.definition);
    if (!senses.length) {
      const content = root
        .find(".dict-section__body, .content")
        .first()
        .clone();
      content.find(".copyright,.reading-head,.xxjs-reading-head").remove();
      content.find("br").replaceWith("\n");
      const definition = content
        .text()
        .split(/\n+/)
        .map(clean)
        .filter(Boolean)
        .join("\n");
      if (definition) senses.push({ definition, examples: [] });
    }
    if (senses.length)
      entries.push({ headword: `${word} · ${title}`, phonetic, senses });
  });
  if (!entries.length) return null;
  return {
    summary: entries[0].senses[0].definition,
    entries,
    attributions: [
      {
        label: "汉典 ZDIC.NET",
        url: `https://zdic.net/hans/${encodeURIComponent(word)}`,
      },
      { label: "汉典声明 · CC0 1.0", url: "https://zdic.net/terms/" },
    ],
  };
}
export const zdicProvider: DictionaryProvider = {
  async lookup({ input, signal }) {
    const html = await requestHtml(
      `https://zdic.net/hans/${encodeURIComponent(input.text)}`,
      signal,
    );
    return html ? parseZdic(html, input.text) : null;
  },
};
