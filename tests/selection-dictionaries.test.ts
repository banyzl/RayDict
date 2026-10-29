import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { acquiredText } from "../src/core/acquired-text";
import { migrateCatalog } from "../src/core/catalog";
import { ConfigSchema, DEFAULT_CONFIG } from "../src/core/schema";
import {
  parseBing,
  parseDictcn,
  parseOxford,
  parseLongman,
  parseWiktionary,
  oxfordProvider,
} from "../src/providers/more-dictionaries";

test("selection and clipboard inputs reject missing and oversized text before querying", () => {
  assert.equal(acquiredText("  example\n"), "example");
  for (const value of [undefined, null, 1, {}, "  "])
    assert.throws(() => acquiredText(value), /没有可查询/);
  assert.equal(acquiredText("x".repeat(3000)).length, 3000);
  assert.throws(() => acquiredText("x".repeat(3001)), /3000/);
});
test("Bing extracts bilingual senses and examples, resolving only safe pronunciation URLs", () => {
  const html = `<div class="qdef"><div class="hd_area"><h1>example</h1><span class="hd_prUS">美 /test/</span><a id="bigaud_uk" data-mp3link="/audio.mp3"></a><a data-mp3link="javascript:alert(1)"></a></div><ul><li><span class="pos">n.</span><span class="def">示例 &amp; 用例</span></li></ul><aside>advertisement</aside></div><div class="se_li1"><span class="sen_en">A sample.</span><span class="sen_cn">一个例子。</span></div><script>bad()</script>`;
  const found = parseBing(html, "example")!;
  assert.equal(found.entries[0].senses[0].definition, "示例 & 用例");
  assert.deepEqual(found.entries[0].senses[0].examples, [
    "A sample.\n一个例子。",
  ]);
  assert.equal(found.audio?.[0].url, "https://cn.bing.com/audio.mp3");
  assert.equal(found.audio?.length, 1);
  assert.equal(found.retention, "session");
  assert(!JSON.stringify(found).includes("advertisement"));
  assert.equal(
    parseBing('<div class="qdef"><h1>Related searches</h1></div>', "x"),
    null,
  );
});
test("Dict.cn keeps Chinese and English definitions without scripts or duplicate example prose", () => {
  const found = parseDictcn(
    `<div class="word"><h1>test</h1><div class="phonetic">/test/</div></div><ul class="dict-basic-ul"><li><span>n.</span><strong>测试</strong></li><li><script>ad()</script></li></ul><div class="layout en"><span>Noun:</span><ol><li>A trial.<p>A first trial.</p></li></ol></div><div class="layout sort"><ol><li>A test.<br>一次测试。</li></ol></div>`,
    "test",
  )!;
  assert.equal(found.entries[0].senses.length, 2);
  assert.equal(found.entries[0].senses[1].definition, "A trial.");
  assert.deepEqual(found.entries[0].senses[1].examples, ["A first trial."]);
  assert.deepEqual(found.entries[0].senses[0].examples, [
    "A test.\n一次测试。",
  ]);
  assert.equal(parseDictcn("<strong>Navigation</strong>", "x"), null);
});
test("Oxford isolates nested senses and headword audio from related-entry and advertisement content", () => {
  const url =
    "https://www.oxfordlearnersdictionaries.com/definition/english/test";
  const found = parseOxford(
    `<section class="entry"><div class="top-container"><h1 class="headword">test</h1><span class="pos">noun</span><span class="phon">/test/</span><span class="sound pron-uk" data-src-mp3="/test.mp3"></span></div><li class="sense"><span class="def">A trial.</span><span class="x">Try a test.</span><li class="sense"><span class="def">An examination.</span><span class="x">Sit a test.</span></li><div>advertisement</div></li></section><span class="def">not an entry</span>`,
    "test",
    url,
  )!;
  assert.equal(found.entries[0].senses.length, 2);
  assert.equal(found.entries[0].senses[0].definition, "A trial.");
  assert.deepEqual(found.entries[0].senses[0].examples, ["Try a test."]);
  assert.equal(found.audio?.[0].label, "英式发音");
  assert(!JSON.stringify(found).includes("advertisement"));
  assert.equal(
    parseOxford('<div class="entry"><h1>Nothing found</h1></div>', "x", url),
    null,
  );
});
test("Longman parses dictionary definitions and excludes example recordings from headword audio", () => {
  const url = "https://www.ldoceonline.com/dictionary/test";
  const found = parseLongman(
    `<div class="dictionary"><span class="ldoceEntry"><span class="Head"><span class="HWD">test</span><span class="POS">noun</span><span class="PRON">test</span><span class="speaker brefile" data-src-mp3="/uk.mp3"></span></span><span class="Sense"><span class="DEF">A check.</span><span class="EXAMPLE"><span class="speaker" data-src-mp3="/example.mp3"></span>Check this.</span></span></span></div>`,
    "test",
    url,
  )!;
  assert.equal(found.entries[0].senses[0].definition, "A check.");
  assert.deepEqual(found.entries[0].senses[0].examples, ["Check this."]);
  assert.equal(found.audio?.length, 1);
  assert.equal(found.audio?.[0].url, "https://www.ldoceonline.com/uk.mp3");
  assert.equal(
    parseLongman('<span class="DEF">Other words</span>', "x", url),
    null,
  );
});
test("Wiktionary renders English definitions as text and preserves source and license links", () => {
  const found = parseWiktionary(
    {
      en: [
        {
          partOfSpeech: "Noun",
          definitions: [
            {
              definition:
                'A <a href="/wiki/test">trial</a>.<style>bad{}</style><script>bad()</script>',
              examples: ["A <b>trial</b>."],
            },
          ],
        },
      ],
      fr: [],
    },
    "test",
  )!;
  assert.equal(found.entries[0].senses[0].definition, "A trial.");
  assert.deepEqual(found.entries[0].senses[0].examples, ["A trial."]);
  assert.equal(found.attributions.length, 2);
  assert.equal(found.retention, "session");
  assert.equal(parseWiktionary(null, "x"), null);
  assert.equal(parseWiktionary({ fr: [] }, "x"), null);
  assert.throws(() =>
    parseWiktionary({ en: [{ definitions: "invalid" }] }, "x"),
  );
});
test("v2 migration adds optional dictionaries without changing custom settings or enabled order", () => {
  const kinds = ["bing", "dictcn", "oxford", "longman", "wiktionary"];
  const legacy = ConfigSchema.parse({
    ...DEFAULT_CONFIG,
    catalogVersion: 2,
    providers: DEFAULT_CONFIG.providers.filter((p) => !kinds.includes(p.kind)),
  });
  legacy.providers[0].timeoutMs = 2345;
  legacy.profiles[0].providerIds = ["cs-glossary", "youdao"];
  const original = structuredClone(legacy);
  const migrated = migrateCatalog(legacy);
  assert.equal(migrated.catalogVersion, 3);
  assert.deepEqual(migrated.profiles, original.profiles);
  assert.deepEqual(
    migrated.providers.slice(0, original.providers.length),
    original.providers,
  );
  assert.deepEqual(legacy, original);
  assert.equal(migrated.providers.length, original.providers.length + 5);
  assert.equal(migrateCatalog(migrated), migrated);
  const deleted = {
    ...migrated,
    providers: migrated.providers.filter((p) => p.id !== "bing"),
  };
  assert.equal(migrateCatalog(deleted), deleted);
});
test("capitalized dictionary lookup retries lowercase only when the exact entry is absent", async () => {
  const calls: string[] = [];
  const fetch = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof globalThis.fetch>[0]) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response("", { status: 404 })
        : new Response(
            '<section class="entry"><div class="top-container"><h1 class="headword">run</h1></div><span class="sense"><span class="def">A test definition.</span></span></section>',
          );
    },
  );
  try {
    const found = await oxfordProvider.lookup({
      input: { text: "Run" },
      profile: DEFAULT_CONFIG.profiles[0],
      config: DEFAULT_CONFIG.providers.find((p) => p.kind === "oxford")!,
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(found?.entries[0].headword, "run");
    assert.deepEqual(
      calls.map((url) => new URL(url).pathname),
      ["/definition/english/Run", "/definition/english/run"],
    );
  } finally {
    fetch.mock.restore();
  }
});
