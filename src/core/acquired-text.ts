/** Selection and clipboard input must pass the same limit before any provider runs. */
export function acquiredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("没有可查询的文字，请先选中并复制文字。");
  const text = value.trim();
  if (text.length > 3000)
    throw new Error("单次最多查询 3000 字符，请缩小选区后重试。");
  return text;
}
