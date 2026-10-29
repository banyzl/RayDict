import { z } from "zod";
import { DictionaryProvider, ProviderResult } from "../core/schema";
import { requestJson, safeUrl } from "../core/http";

const License = z.object({ name: z.string(), url: z.string().optional() });
const ResponseSchema = z.array(
  z.object({
    word: z.string(),
    phonetic: z.string().optional(),
    phonetics: z
      .array(
        z.object({
          text: z.string().optional(),
          audio: z.string().optional(),
          sourceUrl: z.string().optional(),
          license: License.optional(),
        }),
      )
      .default([]),
    meanings: z.array(
      z.object({
        partOfSpeech: z.string(),
        synonyms: z.array(z.string()).default([]),
        definitions: z.array(
          z.object({ definition: z.string(), example: z.string().optional() }),
        ),
      }),
    ),
    sourceUrls: z.array(z.string()).default([]),
    license: License.optional(),
  }),
);
export function parseDictionaryApi(data: unknown): ProviderResult | null {
  if (data === null) return null;
  const rows = ResponseSchema.parse(data);
  const entries = rows
    .map((entry) => ({
      headword: entry.word,
      phonetic: entry.phonetic || entry.phonetics.find((p) => p.text)?.text,
      senses: entry.meanings.flatMap((meaning) =>
        meaning.definitions.map((d) => ({
          definition: d.definition,
          partOfSpeech: meaning.partOfSpeech,
          examples: d.example ? [d.example] : [],
          synonyms: meaning.synonyms,
        })),
      ),
    }))
    .filter((entry) => entry.senses.length);
  if (!entries.length) return null;
  const attributions = [
    { label: "Free Dictionary API", url: "https://dictionaryapi.dev/" },
    ...rows.flatMap((r) => [
      ...r.sourceUrls.map((url) => ({ label: "词条来源", url: safeUrl(url) })),
      ...(r.license
        ? [
            {
              label: r.license.name,
              url: r.license.url ? safeUrl(r.license.url) : undefined,
            },
          ]
        : []),
      ...r.phonetics.flatMap((p) => [
        ...(p.sourceUrl
          ? [{ label: "音频来源", url: safeUrl(p.sourceUrl) }]
          : []),
        ...(p.license
          ? [
              {
                label: `音频 · ${p.license.name}`,
                url: p.license.url ? safeUrl(p.license.url) : undefined,
              },
            ]
          : []),
      ]),
    ]),
  ];
  return {
    summary: entries[0].senses[0].definition,
    entries,
    audio: rows.flatMap((r) =>
      r.phonetics.flatMap((p) => {
        const url = p.audio ? safeUrl(p.audio) : undefined;
        return url
          ? [
              {
                url,
                label: /[-_]us[_.-]/i.test(url)
                  ? "美式发音"
                  : /[-_]uk[_.-]|[-_]gb[_.-]/i.test(url)
                    ? "英式发音"
                    : "词典发音",
              },
            ]
          : [];
      }),
    ),
    attributions: [
      ...new Map(attributions.map((a) => [`${a.label}:${a.url}`, a])).values(),
    ],
  };
}
export const dictionaryApiProvider: DictionaryProvider = {
  async lookup({ input, signal }) {
    return parseDictionaryApi(
      await requestJson(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(input.text)}`,
        signal,
      ),
    );
  },
};
