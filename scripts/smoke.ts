import { DEFAULT_CONFIG } from "../src/core/schema";
import { dictionaryApiProvider } from "../src/providers/dictionary-api";
import { glossaryProvider } from "../src/providers/glossary";
import { myMemoryProvider } from "../src/providers/translation";
import {
  cambridgeProvider,
  youdaoProvider,
  zdicProvider,
} from "../src/providers/web-dictionaries";
import { wikipediaProvider } from "../src/providers/wikipedia";
import {
  bingProvider,
  dictcnProvider,
  oxfordProvider,
  longmanProvider,
  wiktionaryProvider,
} from "../src/providers/more-dictionaries";
async function main() {
  const sources = [
    { kind: "youdao", provider: youdaoProvider, word: "abstraction" },
    { kind: "cambridge", provider: cambridgeProvider, word: "abstraction" },
    { kind: "zdic", provider: zdicProvider, word: "抽象" },
    { kind: "wikipedia", provider: wikipediaProvider, word: "abstraction" },
    {
      kind: "dictionaryapi",
      provider: dictionaryApiProvider,
      word: "abstraction",
    },
    { kind: "glossary", provider: glossaryProvider, word: "abstraction" },
    { kind: "mymemory", provider: myMemoryProvider, word: "abstraction" },
    { kind: "bing", provider: bingProvider, word: "abstraction" },
    { kind: "dictcn", provider: dictcnProvider, word: "abstraction" },
    { kind: "oxford", provider: oxfordProvider, word: "abstraction" },
    { kind: "longman", provider: longmanProvider, word: "abstraction" },
    { kind: "wiktionary", provider: wiktionaryProvider, word: "abstraction" },
  ];
  await Promise.all(
    sources.map(async ({ kind, provider, word }) => {
      const config = DEFAULT_CONFIG.providers.find((p) => p.kind === kind)!;
      try {
        const result = await provider.lookup({
          input: { text: word },
          profile: DEFAULT_CONFIG.profiles[0],
          config,
          signal: AbortSignal.timeout(20000),
        });
        if (!result) throw new Error("没有结果");
        console.log(
          `${config.name}: OK — ${result.entries.length} 个词条，${result.entries.reduce((n, entry) => n + entry.senses.length, 0)} 个义项，${result.audio?.length ?? 0} 个发音`,
        );
      } catch (error) {
        console.error(`${config.name}: FAILED — ${String(error)}`);
        process.exitCode = 1;
      }
    }),
  );
}
void main();
