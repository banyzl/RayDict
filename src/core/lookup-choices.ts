import { LookupChoice, ProviderResult } from "./schema";

export function uniqueChoices(
  choices: LookupChoice[],
  limit = 100,
): LookupChoice[] {
  const seen = new Set<string>();
  return choices
    .filter((choice) => {
      const key = JSON.stringify([choice.target.query, choice.target.language]);
      if (
        !choice.target.query.trim() ||
        choice.target.query.length > 3000 ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
export function hasDefinition(result: ProviderResult) {
  return (
    result.entries.some((entry) =>
      entry.senses.some((sense) => sense.definition.trim()),
    ) || Boolean(result.translation?.trim() || result.explanation?.trim())
  );
}
