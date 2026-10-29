import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  parseWikipedia,
  parseWikipediaDisambiguation,
  parseWikipediaSearch,
  wikipediaProvider,
} from "../src/providers/wikipedia";
import { parseYoudao } from "../src/providers/web-dictionaries";
import {
  parseDictcn,
  parseOxford,
  parseWiktionary,
  oxfordProvider,
} from "../src/providers/more-dictionaries";
import {
  DEFAULT_CONFIG,
  ProviderResult,
  ProviderSchema,
} from "../src/core/schema";
import { QueryCache, QuerySession } from "../src/core/query";
import { renderResult } from "../src/core/render";

const entry = (word: string): ProviderResult => ({
  summary: word,
  entries: [
    { headword: word, senses: [{ definition: `Definition of ${word}` }] },
  ],
  attributions: [],
});
const candidates: ProviderResult = {
  summary: "Choose",
  entries: [],
  choices: [
    {
      title: "Running",
      kind: "article",
      target: { query: "Running", language: "en" },
    },
  ],
  choicePrompt: "Please choose",
  attributions: [],
};
const provider = (id: string) =>
  ProviderSchema.parse({ id, name: id, kind: "glossary" });

test("Wikipedia recognizes an empty disambiguation flag instead of rendering the introductory stub", () => {
  assert.equal(
    parseWikipedia(
      {
        query: {
          pages: [
            {
              title: "Run",
              extract: "Run may refer to",
              pageprops: { disambiguation: "" },
            },
          ],
        },
      },
      "en",
    ),
    null,
  );
  assert.equal(
    parseWikipedia(
      {
        query: {
          pages: [{ title: "Running", extract: "An article.", pageprops: {} }],
        },
      },
      "en",
    )?.entries[0].headword,
    "Running",
  );
});
test("Wikipedia choices follow article order and exclude navigation, offsite, missing and incidental links", () => {
  const found = parseWikipediaDisambiguation(
    {
      parse: {
        title: "Run",
        text: `<div class="mw-parser-output"><table><tr><td><ul><li><a href="/wiki/Navigation">Navigation</a></li></ul></td></tr></table><ul><li><a href="/wiki/Running">Running</a>, movement on foot</li><li><a href="/wiki/Run_(film)">Run</a>, a film</li><li>Run, a film starring <a href="/wiki/Actor">Actor</a></li><li><a href="https://elsewhere.example/wiki/Foreign">Foreign</a></li><li><a class="new" href="/wiki/Missing">Missing</a></li><li><a href="/wiki/Help:Run">Help</a></li><li><a href="/wiki/Running">Running</a> duplicate</li></ul><script>bad()</script></div>`,
        links: ["Running", "Run (film)", "Actor", "Navigation", "Missing"]
          .map((title) => ({ title, ns: 0, exists: true }))
          .concat([{ title: "Help:Run", ns: 12, exists: true }]),
      },
    },
    "en",
  );
  assert.deepEqual(
    found.map((c) => c.target.query),
    ["Running", "Run (film)"],
  );
  assert.equal(found[0].description, "Running, movement on foot");
  assert.equal(found[0].target.language, "en");
});
test("Wikipedia suggestions are explicit candidates, with snippets stripped to text", () => {
  const found = parseWikipediaSearch(
    {
      query: {
        searchinfo: { suggestion: "python" },
        search: [
          {
            ns: 0,
            title: "Python (programming language)",
            snippet:
              '<span class="searchmatch">Python</span> is a language.<script>bad()</script>',
          },
          { ns: 14, title: "Category:Python" },
        ],
      },
    },
    "en",
    "pythno",
  );
  assert.deepEqual(
    found.map((c) => c.kind),
    ["spelling", "article"],
  );
  assert.equal(found[1].description, "Python is a language.");
});
test("Wikipedia missing titles do not silently substitute the first search hit", async () => {
  const urls: URL[] = [];
  const fetch = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = new URL(String(input));
      urls.push(url);
      return Response.json(
        url.searchParams.get("list") === "search"
          ? {
              query: {
                searchinfo: { suggestion: "python" },
                search: [{ title: "Python (programming language)", ns: 0 }],
              },
            }
          : { query: { pages: [{ title: "Pythno", missing: true }] } },
      );
    },
  );
  try {
    const found = await wikipediaProvider.lookup({
      input: { text: "pythno" },
      config: DEFAULT_CONFIG.providers.find((p) => p.kind === "wikipedia")!,
      profile: DEFAULT_CONFIG.profiles[0],
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(found?.entries.length, 0);
    assert.equal(found?.choices?.[0].target.query, "python");
    assert.equal(urls.length, 2);
    assert(!urls.some((url) => url.searchParams.has("generator")));
  } finally {
    fetch.mock.restore();
  }
});
test("a chosen Wikipedia title keeps its original language even when the title is Latin", async () => {
  const fetch = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof globalThis.fetch>[0]) => {
      assert.equal(new URL(String(input)).hostname, "zh.wikipedia.org");
      return Response.json({
        query: { pages: [{ title: "ABC", extract: "中文条目正文。" }] },
      });
    },
  );
  try {
    const found = await wikipediaProvider.lookup({
      input: { text: "ABC" },
      selection: { query: "ABC", language: "zh" },
      config: DEFAULT_CONFIG.providers.find((p) => p.kind === "wikipedia")!,
      profile: DEFAULT_CONFIG.profiles[0],
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(found?.entries[0].senses[0].definition, "中文条目正文。");
    assert.equal(fetch.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
  }
});
test("Wikipedia service outages stay explicit instead of inventing or silently substituting choices", async () => {
  const fetch = mock.method(
    globalThis,
    "fetch",
    async () => new Response("Service unavailable", { status: 503 }),
  );
  try {
    await assert.rejects(
      () =>
        wikipediaProvider.lookup({
          input: { text: "run" },
          config: DEFAULT_CONFIG.providers.find((p) => p.kind === "wikipedia")!,
          profile: DEFAULT_CONFIG.profiles[0],
          signal: AbortSignal.timeout(1000),
        }),
      /服务暂时不可用/,
    );
    assert.equal(fetch.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
  }
});
test("Youdao offers only explicitly stated base forms, without stripping suffixes heuristically", () => {
  const html = (text: string) =>
    `<div id="phrsListTab"><span class="keyword">ran</span><div class="trans-container"><ul><li>${text}</li></ul></div></div>`;
  assert.equal(
    parseYoudao(html("v. 跑（run 的过去式）"), "ran")?.choices?.[0].target
      .query,
    "run",
  );
  assert.equal(
    parseYoudao(html("n. 孩子（child 的复数）"), "children")?.choices?.[0]
      .target.query,
    "child",
  );
  assert.equal(parseYoudao(html("n. 气体"), "gas")?.choices?.length, 0);
});
test("Wiktionary retains multiple explicit English lemmas and ignores ordinary or foreign-language links", () => {
  const form = (word: string) =>
    `<span class="form-of-definition">past of <span class="form-of-definition-link"><a href="/wiki/${word}#English">${word}</a></span></span>`;
  const found = parseWiktionary(
    {
      en: [
        {
          definitions: [
            { definition: form("go") },
            { definition: form("wend") },
            { definition: '<a href="/wiki/road">road</a>' },
          ],
        },
      ],
      fr: [{ definitions: [{ definition: form("foreign") }] }],
    },
    "went",
  );
  assert.deepEqual(
    found?.choices?.map((c) => c.target.query),
    ["go", "wend"],
  );
});
test("Oxford and Dict.cn expose their supplied spelling options without treating them as definitions", () => {
  const oxford = parseOxford(
    '<ul class="result-list"><li><a class="dym-link" href="https://www.oxfordlearnersdictionaries.com/search/english/?q=receive">receive</a></li><li><a class="dym-link" href="https://bad.example/search/english/?q=bad">bad</a></li></ul>',
    "receve",
    "https://www.oxfordlearnersdictionaries.com/definition/english/receve",
  );
  assert.equal(oxford?.entries.length, 0);
  assert.deepEqual(
    oxford?.choices?.map((c) => c.target.query),
    ["receive"],
  );
  const dictcn = parseDictcn(
    '<div class="unfind"><div class="ifufind">Did you mean</div><ul><li><a href="/receive">receive</a>收到</li><li><a href="https://bad.example/unsafe">unsafe</a></li></ul></div>',
    "receve",
  );
  assert.equal(dictcn?.entries.length, 0);
  assert.deepEqual(
    dictcn?.choices?.map((c) => c.target.query),
    ["receive"],
  );
});
test("Oxford reads suggestions from a 404 response without requiring another service", async () => {
  const fetch = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        '<ul class="result-list"><a class="dym-link" href="https://www.oxfordlearnersdictionaries.com/search/english/?q=receive">receive</a></ul>',
        { status: 404 },
      ),
  );
  try {
    const found = await oxfordProvider.lookup({
      input: { text: "receve" },
      config: DEFAULT_CONFIG.providers.find((p) => p.kind === "oxford")!,
      profile: DEFAULT_CONFIG.profiles[0],
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(found?.choices?.[0].target.query, "receive");
    assert.equal(fetch.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
  }
});
test("choosing and returning update only one provider and preserve other results", async () => {
  const calls: string[] = [];
  const session = new QuerySession(
    { text: "run", context: "original context" },
    DEFAULT_CONFIG.profiles[0],
    [provider("wiki"), provider("other")],
    (p) => ({
      lookup: async ({ input }) => {
        calls.push(`${p.id}:${input.text}`);
        assert.equal(input.context, "original context");
        return p.id === "wiki" && input.text === "run"
          ? candidates
          : entry(input.text);
      },
    }),
    () => undefined,
  );
  await session.start();
  const other = session.snapshot()[1];
  assert.equal(session.snapshot()[0].status, "choices");
  await session.run("wiki", true, { query: "Running", language: "en" });
  assert.equal(session.snapshot()[0].result?.entries[0].headword, "Running");
  assert.equal(session.snapshot()[1], other);
  await session.run("wiki", true);
  assert.equal(calls.at(-1), "wiki:Running");
  session.reset("wiki");
  assert.equal(session.snapshot()[0].status, "choices");
  assert.equal(session.snapshot()[0].selection, undefined);
  assert.equal(calls.filter((call) => call.startsWith("other:")).length, 1);
  assert.equal(calls.filter((call) => call === "wiki:run").length, 1);
});
test("late choice responses cannot override a newer choice or a return to the original query", async () => {
  let releaseA: () => void = () => undefined;
  let releaseB: () => void = () => undefined;
  const pendingA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const session = new QuerySession(
    { text: "run" },
    DEFAULT_CONFIG.profiles[0],
    [provider("wiki")],
    () => ({
      lookup: async ({ input }) => {
        if (input.text === "run") return candidates;
        if (input.text === "A") await pendingA;
        if (input.text === "B") await pendingB;
        return entry(input.text);
      },
    }),
    () => undefined,
  );
  await session.start();
  const a = session.run("wiki", true, { query: "A" });
  await delay(1);
  const b = session.run("wiki", true, { query: "B" });
  await delay(1);
  releaseB();
  await b;
  releaseA();
  await a;
  assert.equal(session.snapshot()[0].result?.entries[0].headword, "B");
  session.reset("wiki");
  assert.equal(session.snapshot()[0].result, candidates);
  const late = session.run("wiki", true, { query: "A" });
  session.reset("wiki");
  await late;
  assert.equal(session.snapshot()[0].status, "choices");
});
test("the selected article cache cannot replace the original disambiguation cache", async () => {
  const cache = new QueryCache();
  let calls = 0;
  const make = () =>
    new QuerySession(
      { text: "run" },
      DEFAULT_CONFIG.profiles[0],
      [provider("wiki")],
      () => ({
        lookup: async ({ input }) => {
          calls++;
          return input.text === "run" ? candidates : entry(input.text);
        },
      }),
      () => undefined,
      () => undefined,
      cache,
    );
  const first = make();
  await first.start();
  await first.run("wiki", true, { query: "Running", language: "en" });
  const second = make();
  await second.start();
  assert.equal(second.snapshot()[0].status, "choices");
  assert.equal(calls, 2);
  assert(!renderResult(candidates).includes("Definition of"));
});
