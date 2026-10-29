import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  ProviderSchema,
} from "../src/core/schema";
import { migrateCatalog } from "../src/core/catalog";
import { ConfigFile } from "../src/storage/config-file";
import {
  parseCambridge,
  parseYoudao,
  parseZdic,
} from "../src/providers/web-dictionaries";
import { parseWikipedia } from "../src/providers/wikipedia";
import { acceptsInput, QueryCache, QuerySession } from "../src/core/query";
import { ankiFields, renderRecord } from "../src/core/render";

test("Youdao renders native definitions, two pronunciations and paired examples without scripts", () => {
  const html = `<div id="phrsListTab"><span class="keyword">test</span><span class="pronounce">英 <span class="phonetic">/test/</span><a class="dictvoice" data-rel="test&type=1"></a></span><span class="pronounce">美 /test/<a class="dictvoice" data-rel="test&type=2"></a></span><div class="trans-container"><ul><li>n. 示例释义</li></ul></div></div><div id="bilingual"><ul class="ol"><li><p>Example sentence.</p><p>示例句子。</p></li></ul></div><script>alert(1)</script>`;
  const result = parseYoudao(html, "test");
  assert.equal(result?.entries[0].headword, "test");
  assert.equal(result?.audio?.length, 2);
  assert.equal(
    result?.entries[0].senses[0].examples?.[0],
    "Example sentence.\n示例句子。",
  );
  assert.equal(result?.retention, "session");
  assert.equal(parseYoudao("<div>no entry</div>", "test"), null);
});
test("Cambridge keeps English definitions, Chinese translations, POS and examples", () => {
  const html = `<div class="entry-body__el"><div class="pos-header"><span class="hw dhw">test</span><span class="pos dpos">noun</span><span class="ipa">test</span><source type="audio/mpeg" src="/media/uk_test.mp3"></div><div class="def-block ddef_block"><div class="def ddef_d">An example definition.</div><div class="def-body"><span class="trans dtrans">示例释义</span><div class="examp dexamp">Example sentence. 示例句子。</div></div></div></div>`;
  const result = parseCambridge(
    html,
    "test",
    "https://dictionary.cambridge.org/dictionary/english/test",
  );
  assert.equal(
    result?.entries[0].senses[0].definition,
    "An example definition.\n示例释义",
  );
  assert.equal(result?.entries[0].senses[0].partOfSpeech, "noun");
  assert.equal(
    result?.audio?.[0].url,
    "https://dictionary.cambridge.org/media/uk_test.mp3",
  );
  assert.equal(
    parseCambridge("<h1>Just a moment</h1>", "test", "https://example.com"),
    null,
  );
});
test("Zdic supports current sections and retains its published attribution", () => {
  const html = `<span class="meta-pinyin">cè shì<button>play</button></span><section class="dict-section" data-section="词语解释"><div class="dict-section__body"><li class="xxjs-item"><div class="xxjs-item__def">示例释义</div><span class="xxjs-also__text">例句</span></li><div class="dict-section__footer">反馈广告</div></div></section>`;
  const result = parseZdic(html, "测试");
  assert.equal(result?.entries[0].phonetic, "cè shì");
  assert.equal(result?.entries[0].senses[0].definition, "示例释义");
  assert(!JSON.stringify(result).includes("反馈广告"));
  assert(result?.attributions.some((source) => source.label.includes("CC0")));
});
test("Wikipedia handles missing titles and API failures, with source and license links", () => {
  assert.equal(
    parseWikipedia({ query: { pages: [{ title: "x", missing: true }] } }, "en"),
    null,
  );
  assert.throws(() => parseWikipedia({ error: { info: "limited" } }, "en"));
  const result = parseWikipedia(
    {
      query: {
        pages: [
          {
            title: "Example",
            extract: "Example introduction.",
            fullurl: "https://en.wikipedia.org/wiki/Example",
          },
        ],
      },
    },
    "en",
  );
  assert.equal(
    result?.entries[0].senses[0].definition,
    "Example introduction.",
  );
  assert.equal(result?.attributions.length, 2);
});
test("input conditions avoid sending English to Zdic and Chinese to Cambridge", () => {
  const zdic = DEFAULT_CONFIG.providers.find((p) => p.kind === "zdic")!;
  const cambridge = DEFAULT_CONFIG.providers.find(
    (p) => p.kind === "cambridge",
  )!;
  assert(acceptsInput(zdic, "抽象"));
  assert(!acceptsInput(zdic, "abstraction"));
  assert(acceptsInput(cambridge, "abstraction"));
  assert(!acceptsInput(cambridge, "抽象"));
});
test("catalog migration is idempotent and preserves custom providers and translation profile", () => {
  const legacy = ConfigSchema.parse({
    ...DEFAULT_CONFIG,
    catalogVersion: 1,
    providers: DEFAULT_CONFIG.providers.filter(
      (p) => !["youdao", "cambridge", "zdic", "wikipedia"].includes(p.kind),
    ),
    profiles: DEFAULT_CONFIG.profiles.map((p) => ({
      ...p,
      providerIds: ["free-dictionary"],
    })),
  });
  const next = migrateCatalog(legacy);
  assert.equal(next.catalogVersion, 3);
  assert.equal(
    new Set(next.providers.map((p) => p.id)).size,
    next.providers.length,
  );
  assert.deepEqual(
    next.profiles.find((p) => p.id === "translation")?.providerIds,
    ["free-dictionary"],
  );
  assert.equal(migrateCatalog(next), next);
});
test("shared config rejects stale writes and survives simultaneous edits", async () => {
  const folder = await mkdtemp(join(tmpdir(), "raydict-config-"));
  try {
    const path = join(folder, "settings-v1.json");
    const first = new ConfigFile(path);
    const second = new ConfigFile(path);
    await first.write(DEFAULT_CONFIG, null);
    const a = (await first.read())!;
    const b = (await second.read())!;
    const next = { ...a.config, activeProfileId: "cs" };
    await first.write(next, a.config);
    await assert.rejects(
      () =>
        second.write({ ...b.config, activeProfileId: "translation" }, b.config),
      /另一窗口/,
    );
    assert.equal((await second.read())?.config.activeProfileId, "cs");
    const current = (await first.read())!;
    const writes = await Promise.allSettled([
      first.write(
        { ...current.config, activeProfileId: "general" },
        current.config,
      ),
      second.write(
        { ...current.config, activeProfileId: "translation" },
        current.config,
      ),
    ]);
    assert.equal(
      writes.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal((await first.read())?.revision, 2);
    const saved = await readFile(path, "utf8");
    const beforeInvalid = (await first.read())!.config;
    await assert.rejects(() =>
      first.write({ ...DEFAULT_CONFIG, profiles: [] }, beforeInvalid),
    );
    assert.equal(await readFile(path, "utf8"), saved);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("session-only website results are never cached and references survive notebook and Anki rendering", async () => {
  let calls = 0;
  const cache = new QueryCache();
  const provider = ProviderSchema.parse({
    id: "site",
    name: "Site",
    kind: "youdao",
  });
  for (let i = 0; i < 2; i++) {
    const session = new QuerySession(
      { text: "test" },
      DEFAULT_CONFIG.profiles[0],
      [provider],
      () => ({
        lookup: async () => {
          calls++;
          return {
            summary: "test",
            entries: [],
            retention: "session",
            attributions: [],
          };
        },
      }),
      () => undefined,
      () => undefined,
      cache,
    );
    await session.start();
  }
  assert.equal(calls, 2);
  const record = {
    id: "test",
    text: "test",
    profileId: "general",
    profileName: "General",
    createdAt: "",
    updatedAt: "",
    results: [],
    references: [{ label: "Source", url: "https://example.com" }],
  };
  assert(renderRecord(record).includes("https://example.com"));
  assert(ankiFields(record).back.includes("https://example.com"));
});
