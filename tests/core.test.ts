import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  ProviderSchema,
  ProviderResult,
  ResultState,
} from "../src/core/schema";
import { QueryCache, QuerySession } from "../src/core/query";
import {
  mapJsonResult,
  substitute,
  validateJsonProvider,
  valuesAt,
} from "../src/providers/json";
import { parseDictionaryApi } from "../src/providers/dictionary-api";
import { ankiFields, renderResult } from "../src/core/render";
import { safeUrl } from "../src/core/http";

const result: ProviderResult = {
  summary: "抽象",
  entries: [{ headword: "abstraction", senses: [{ definition: "抽象" }] }],
  attributions: [{ label: "Original notes" }],
};
const config = (id: string, extra = {}) =>
  ProviderSchema.parse({ id, name: id, kind: "glossary", ...extra });
const profile = DEFAULT_CONFIG.profiles[0];

test("parallel results publish independently in configured order and isolate errors", async () => {
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const snapshots: ResultState[][] = [];
  const session = new QuerySession(
    { text: "abstraction" },
    profile,
    [config("slow"), config("fast"), config("broken")],
    (p) => ({
      lookup: async () => {
        if (p.id === "slow") await blocked;
        if (p.id === "broken") throw new Error("network unavailable");
        return result;
      },
    }),
    (rows) => snapshots.push(rows),
  );
  const work = session.start();
  await delay(5);
  assert.deepEqual(
    session.snapshot().map((r) => r.status),
    ["loading", "success", "error"],
  );
  release();
  await work;
  assert.deepEqual(
    session.snapshot().map((r) => r.providerId),
    ["slow", "fast", "broken"],
  );
  assert(
    snapshots.some(
      (rows) => rows[1].status === "success" && rows[0].status === "loading",
    ),
  );
});
test("manual providers never run automatically and sentence-ineligible providers are skipped", async () => {
  let calls = 0;
  const session = new QuerySession(
    { text: "This sentence contains more than four words." },
    profile,
    [
      config("word", { scope: "word" }),
      config("manual", { trigger: "manual" }),
    ],
    () => ({
      lookup: async () => {
        calls++;
        return result;
      },
    }),
    () => undefined,
  );
  await session.start();
  assert.equal(calls, 0);
  assert.deepEqual(
    session.snapshot().map((r) => r.status),
    ["skipped", "manual"],
  );
  await session.run("manual");
  assert.equal(calls, 1);
});
test("cancelling an old session suppresses all late result publications", async () => {
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rows: ResultState[][] = [];
  const session = new QuerySession(
    { text: "old" },
    profile,
    [config("x")],
    () => ({
      lookup: async () => {
        await blocked;
        return result;
      },
    }),
    (value) => rows.push(value),
  );
  const pending = session.start();
  await delay(2);
  session.cancel();
  const count = rows.length;
  release();
  await pending;
  await delay(2);
  assert.equal(rows.length, count);
});
test("timeout completes even when a provider ignores its abort signal", async () => {
  const session = new QuerySession(
    { text: "test" },
    profile,
    [config("x", { timeoutMs: 100 })],
    () => ({ lookup: () => new Promise(() => undefined) }),
    () => undefined,
  );
  await session.start();
  assert.equal(session.snapshot()[0].status, "error");
  assert.match(session.snapshot()[0].message!, /超时/);
});
test("cache includes profile, query context and provider configuration", async () => {
  const cache = new QueryCache();
  let calls = 0;
  const run = async (context: string, prompt: string) => {
    const session = new QuerySession(
      { text: "abstraction", context },
      { ...profile, aiPrompt: prompt },
      [config("x")],
      () => ({
        lookup: async () => {
          calls++;
          return result;
        },
      }),
      () => undefined,
      () => undefined,
      cache,
    );
    await session.start();
  };
  await run("first", "a");
  await run("first", "a");
  assert.equal(calls, 1);
  await run("second", "a");
  await run("second", "b");
  assert.equal(calls, 3);
});
test("JSON paths traverse nested arrays without scripts or prototype access", () => {
  assert.deepEqual(
    valuesAt(
      { items: [{ defs: [{ value: "one" }, { value: "two" }] }] },
      "items[].defs[].value",
    ),
    ["one", "two"],
  );
  assert.deepEqual(valuesAt([{ value: "one" }], "[0].value"), ["one"]);
  assert.throws(() => valuesAt({}, "a.__proto__"));
  assert.throws(() => valuesAt({}, "x[?(@.x)]"));
  const source = config("custom", {
    kind: "json",
    endpoint: "https://example.com/{word}",
    mapping: { entries: "data", definition: "meaning", example: "examples[]" },
    attribution: "Example",
  });
  validateJsonProvider(source);
  assert.equal(
    mapJsonResult(
      { data: [{ meaning: "抽象", examples: ["example"] }] },
      source,
      "abstraction",
    )?.entries[0].senses[0].examples?.[0],
    "example",
  );
});
test("template substitution preserves JSON escaping and rejects URL credentials", () => {
  const input = 'line "one"\n\\two';
  assert.deepEqual(
    JSON.parse(JSON.stringify(substitute({ text: "{word}" }, { word: input }))),
    { text: input },
  );
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("https://user:pass@example.com"), undefined);
  assert.equal(safeUrl("http://remote.example.com"), undefined);
  assert(safeUrl("http://127.0.0.1:8765"));
  assert.throws(() =>
    validateJsonProvider(
      config("bad", {
        kind: "json",
        endpoint: "https://example.com/?key={token}",
        mapping: { definition: "text" },
      }),
    ),
  );
});
test("configuration rejects duplicate IDs, unknown profile references and missing active profile", () => {
  assert(ConfigSchema.safeParse(DEFAULT_CONFIG).success);
  assert(
    !ConfigSchema.safeParse({
      ...DEFAULT_CONFIG,
      providers: [...DEFAULT_CONFIG.providers, DEFAULT_CONFIG.providers[0]],
    }).success,
  );
  assert(
    !ConfigSchema.safeParse({ ...DEFAULT_CONFIG, activeProfileId: "missing" })
      .success,
  );
  assert(
    !ConfigSchema.safeParse({
      ...DEFAULT_CONFIG,
      profiles: [{ ...profile, providerIds: ["missing"] }],
    }).success,
  );
});
test("dictionary normalization preserves phonetics, examples, audio licensing and source attribution", () => {
  const parsed = parseDictionaryApi([
    {
      word: "test",
      phonetics: [
        {
          text: "/test/",
          audio: "https://example.com/test.mp3",
          license: { name: "CC BY-SA", url: "https://example.com/license" },
        },
      ],
      meanings: [
        {
          partOfSpeech: "noun",
          definitions: [{ definition: "a trial", example: "Take a test." }],
        },
      ],
      license: { name: "CC BY-SA 3.0" },
      sourceUrls: ["https://example.com/source"],
    },
  ]);
  assert.equal(parsed?.entries[0].phonetic, "/test/");
  assert.equal(parsed?.entries[0].senses[0].examples?.[0], "Take a test.");
  assert(parsed?.attributions.some((a) => a.label.includes("音频")));
  assert.equal(parsed?.audio?.length, 1);
});
test("remote prose is escaped in native Markdown and Anki HTML", () => {
  const malicious: ProviderResult = {
    ...result,
    explanation:
      "![tracking](https://bad.example/pixel) <script>alert(1)</script>",
  };
  assert(renderResult(malicious).includes("\\!&#91;tracking&#93;"));
  assert(renderResult(malicious).includes("&lt;script&gt;"));
  const fields = ankiFields({
    id: "x",
    text: "<img src=x>",
    profileId: "general",
    profileName: "General",
    createdAt: "",
    updatedAt: "",
    results: [{ providerId: "x", providerName: "Example", result: malicious }],
  });
  assert(!fields.front.includes("<img"));
  assert(!fields.back.includes("<script>"));
  assert(fields.back.includes("Original notes"));
});
