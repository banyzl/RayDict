import { ProviderResult, SavedRecord } from "./schema";
import { safeUrl } from "./http";

export function escapeMarkdown(text: string) {
  // Raycast treats escaped square/round brackets as math delimiters.
  // Entities preserve literal dictionary text, including spaces in parentheticals.
  const entities: Record<string, string> = {
    "[": "&#91;",
    "]": "&#93;",
    "(": "&#40;",
    ")": "&#41;",
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  };
  return text.replace(
    /[&<>\\`*_{}[\]()#+.!|~-]/g,
    (character) => entities[character] ?? `\\${character}`,
  );
}
function link(label: string, url?: string) {
  const safe = url && safeUrl(url);
  return safe
    ? `[${escapeMarkdown(label)}](${safe.replace(/[()]/g, (c) => encodeURIComponent(c))})`
    : escapeMarkdown(label);
}
export function renderResult(result: ProviderResult): string {
  const parts: string[] = [];
  if (result.generated) parts.push("> AI 生成内容，请结合原文核实。\n");
  for (const entry of result.entries) {
    parts.push(
      `# ${escapeMarkdown(entry.headword)}`,
      entry.phonetic ? `**${escapeMarkdown(entry.phonetic)}**` : "",
    );
    for (const sense of entry.senses) {
      parts.push(
        `${sense.partOfSpeech ? `*${escapeMarkdown(sense.partOfSpeech)}* · ` : ""}${escapeMarkdown(sense.definition)}`,
      );
      for (const example of sense.examples ?? [])
        parts.push(`> ${escapeMarkdown(example).replace(/\n/g, "\n> ")}`);
    }
    const synonyms = [
      ...new Set(entry.senses.flatMap((sense) => sense.synonyms ?? [])),
    ];
    if (synonyms.length)
      parts.push(`相关近义词：${synonyms.map(escapeMarkdown).join(" · ")}`);
  }
  if (result.translation)
    parts.push("## 翻译", escapeMarkdown(result.translation));
  // Treat generated prose as text; remote images and executable links are not rendered.
  if (result.explanation) parts.push(escapeMarkdown(result.explanation));
  if (result.choicePrompt)
    parts.push("## 请选择词条", escapeMarkdown(result.choicePrompt));
  if (result.choices?.length) {
    if (!result.choicePrompt) parts.push("## 词形与可选词条");
    parts.push(
      ...result.choices
        .slice(0, 8)
        .map(
          (choice) =>
            `- **${escapeMarkdown(choice.title)}**${choice.description ? ` — ${escapeMarkdown(choice.description.slice(0, 180))}` : ""}`,
        ),
    );
    parts.push(
      result.entries.length
        ? "按 ⌘J 选择词条，仅切换当前词典。"
        : "按回车选择词条；可在候选列表中输入文字筛选。仅切换当前词典。",
    );
  }
  if (result.retention === "session")
    parts.push(
      "本次网页结果不写入缓存或生词本快照；收藏会保留查询、笔记和来源链接。",
    );
  parts.push(
    "---",
    result.attributions.map((a) => link(a.label, a.url)).join(" · "),
  );
  return parts.filter(Boolean).join("\n\n");
}
export function renderRecord(record: SavedRecord): string {
  return [
    `# ${escapeMarkdown(record.text)}`,
    record.context ? `## 上下文\n\n${escapeMarkdown(record.context)}` : "",
    record.note ? `## 笔记\n\n${escapeMarkdown(record.note)}` : "",
    `来源：${escapeMarkdown(record.sourceApp ?? "手动输入")}`,
    record.sourceUrl ? link("原文", record.sourceUrl) : "",
    ...record.results.map(
      (r) =>
        `## ${escapeMarkdown(r.providerName)}\n\n${renderResult(r.result)}`,
    ),
    ...(record.references ?? []).map((a) => link(a.label, a.url)),
    `保存于 ${record.createdAt} · ${escapeMarkdown(record.profileName)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function ankiFields(record: SavedRecord) {
  const text = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");
  const attributions = [
    ...(record.references ?? []).map(
      (a) => `${a.label}${a.url ? ` — ${a.url}` : ""}`,
    ),
    ...record.results.flatMap((r) =>
      r.result.attributions.map(
        (a) => `${a.label}${a.url ? ` — ${a.url}` : ""}`,
      ),
    ),
  ];
  return {
    front: `${text(record.text)}${record.context ? `<hr>${text(record.context)}` : ""}`,
    back: [
      ...record.results.map(({ providerName, result }) =>
        [
          `<h3>${text(providerName)}</h3>`,
          result.generated ? "<p>AI 生成内容，请结合原文核实。</p>" : "",
          ...result.entries.map(
            (entry) =>
              `<p><b>${text(entry.headword)}</b> ${text(entry.phonetic ?? "")}</p><ol>${entry.senses.map((sense) => `<li>${sense.partOfSpeech ? `<i>${text(sense.partOfSpeech)}</i> · ` : ""}${text(sense.definition)}${(sense.examples ?? []).map((example) => `<blockquote>${text(example)}</blockquote>`).join("")}</li>`).join("")}</ol>`,
          ),
          result.translation ? `<p>${text(result.translation)}</p>` : "",
          result.explanation ? `<p>${text(result.explanation)}</p>` : "",
        ].join("\n"),
      ),
      record.note ? `<hr>${text(record.note)}` : "",
      `<hr>${text(record.sourceApp ?? "RayDict")}`,
      record.sourceUrl ? text(record.sourceUrl) : "",
      text(attributions.join("\n")),
    ].join("\n"),
  };
}
