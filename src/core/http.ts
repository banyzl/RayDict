export function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.username || url.password) return undefined;
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return url.toString();
  } catch {
    /* invalid URL */
  }
  return undefined;
}

export async function requestJson(
  url: string,
  signal: AbortSignal,
  options: RequestInit = {},
): Promise<unknown> {
  const endpoint = safeUrl(url);
  if (!endpoint) throw new Error("仅支持 HTTPS 或本机 HTTP 地址");
  // Prevent credentials from being forwarded to a different host on redirects.
  const response = await fetch(endpoint, {
    ...options,
    signal,
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "密钥无效",
      403: "无访问权限",
      429: "请求限流，请稍后重试",
      456: "翻译额度已用完",
    };
    throw new Error(
      messages[response.status] ?? `服务返回 HTTP ${response.status}`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("服务未返回内容");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_000_000) throw new Error("结果超过 2 MB 限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("服务未返回有效 JSON");
  }
}

/** Public dictionary HTML only. No cookies, script execution or challenge bypass. */
export async function requestHtml(
  url: string,
  signal: AbortSignal,
  options: { readNotFound?: boolean } = {},
): Promise<string | null> {
  const endpoint = safeUrl(url);
  if (!endpoint) throw new Error("无效的词典地址");
  let current = endpoint;
  let response: Response;
  for (let hops = 0; ; hops++) {
    const next = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": "RayDict/0.3 (personal native dictionary)",
        Accept: "text/html",
      },
    });
    if (![301, 302, 303, 307, 308].includes(next.status)) {
      response = next;
      break;
    }
    const location = next.headers.get("location");
    await next.body?.cancel();
    if (!location || hops >= 3) throw new Error("词典跳转次数过多或地址缺失");
    const target = safeUrl(new URL(location, current).href);
    // Canonical word URLs may redirect, but public HTML must stay on its original site.
    if (!target || new URL(target).origin !== new URL(endpoint).origin)
      throw new Error("词典跳转到了不同站点，本次查询已停止");
    current = target;
  }
  if (response.status === 404 && !options.readNotFound) return null;
  if ([403, 429].includes(response.status))
    throw new Error("词典暂时拒绝访问或需要验证，请稍后再试");
  if (!response.ok && !(response.status === 404 && options.readNotFound))
    throw new Error(`词典返回 HTTP ${response.status}`);
  if (!response.body) throw new Error("词典没有返回内容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw new Error("词典页面超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const html = Buffer.concat(chunks).toString("utf8");
  if (
    /just a moment|verify you are human|验证码|人机验证/i.test(
      html.slice(0, 15000),
    ) &&
    !/ddef_d|phrsListTab|dict-section__body/.test(html)
  )
    throw new Error("词典需要人工验证，本次查询已停止");
  return html;
}
