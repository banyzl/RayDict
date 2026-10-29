import {
  DictionaryProvider,
  Profile,
  ProviderConfig,
  ProviderResult,
  QueryInput,
  ResultState,
  LookupTarget,
} from "./schema";
import { hasDefinition } from "./lookup-choices";

export class QueryCache {
  private values = new Map<string, { at: number; result: ProviderResult }>();
  get(key: string) {
    const entry = this.values.get(key);
    if (entry && Date.now() - entry.at < 300_000) return entry.result;
    this.values.delete(key);
  }
  set(key: string, result: ProviderResult) {
    this.values.delete(key);
    this.values.set(key, { at: Date.now(), result });
    if (this.values.size > 100)
      this.values.delete(this.values.keys().next().value!);
  }
}

function withAbort<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("已取消"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function normalizeQuery(text: string) {
  return text.trim().replace(/\r\n/g, "\n");
}
export function wordQuery(text: string) {
  return (
    /^[\p{L}\p{M}][\p{L}\p{M}'’ -]{0,99}$/u.test(text) &&
    text.split(/\s+/).length <= 4
  );
}

export function acceptsInput(config: ProviderConfig, text: string): boolean {
  if (config.scope === "word" && !wordQuery(text)) return false;
  if (config.inputLanguage === "han") return /\p{Script=Han}/u.test(text);
  if (config.inputLanguage === "latin")
    return /[A-Za-z]/.test(text) && !/\p{Script=Han}/u.test(text);
  return true;
}

export class QuerySession {
  private abort = new AbortController();
  private running = new Map<string, AbortController>();
  private selections = new Map<string, LookupTarget>();
  private originals = new Map<string, ResultState>();
  readonly states: Map<string, ResultState>;
  constructor(
    readonly input: QueryInput,
    readonly profile: Profile,
    readonly providers: ProviderConfig[],
    private resolve: (config: ProviderConfig) => DictionaryProvider,
    private emit: (state: ResultState[]) => void,
    private tokenFor: (config: ProviderConfig) => string | undefined = () =>
      undefined,
    private cache = new QueryCache(),
  ) {
    this.states = new Map(
      providers.map((p) => [
        p.id,
        {
          providerId: p.id,
          status: !acceptsInput(p, input.text)
            ? "skipped"
            : p.trigger === "manual"
              ? "manual"
              : "waiting",
        },
      ]),
    );
  }
  snapshot() {
    return [...this.states.values()];
  }
  async start() {
    await Promise.all(
      this.providers
        .filter((p) => p.trigger === "auto")
        .map((p) => this.run(p.id)),
    );
  }
  cancel() {
    this.abort.abort();
  }
  reset(id: string) {
    if (this.abort.signal.aborted) return;
    this.running.get(id)?.abort();
    this.running.delete(id);
    this.selections.delete(id);
    const original = this.originals.get(id);
    this.originals.delete(id);
    if (original) {
      this.states.set(id, original);
      this.emit(this.snapshot());
    } else void this.run(id, true, null);
  }
  async run(id: string, refresh = false, selection?: LookupTarget | null) {
    const config = this.providers.find((p) => p.id === id);
    if (
      !config ||
      (this.running.has(id) && selection === undefined) ||
      this.abort.signal.aborted ||
      this.states.get(id)?.status === "skipped"
    )
      return;
    if (selection !== undefined) {
      if (selection && !this.selections.has(id)) {
        const original = this.states.get(id);
        if (original?.result) this.originals.set(id, original);
      }
      this.running.get(id)?.abort();
      if (selection) this.selections.set(id, selection);
      else this.selections.delete(id);
    }
    const target = this.selections.get(id);
    const operation = new AbortController();
    this.running.set(id, operation);
    const update = (state: Omit<ResultState, "providerId">) => {
      if (this.abort.signal.aborted || this.running.get(id) !== operation)
        return;
      this.states.set(id, { providerId: id, selection: target, ...state });
      this.emit(this.snapshot());
    };
    // Configuration, context, language and prompt all affect the cache key. Tokens stay out of it.
    const input = target ? { ...this.input, text: target.query } : this.input;
    const key = JSON.stringify([config, input, this.profile, target]);
    const cached = !refresh && this.cache.get(key);
    if (cached) {
      update({
        status: hasDefinition(cached)
          ? "success"
          : cached.choices?.length
            ? "choices"
            : "empty",
        result: cached,
      });
      if (this.running.get(id) === operation) this.running.delete(id);
      return;
    }
    update({ status: "loading" });
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), config.timeoutMs);
    const signal = AbortSignal.any([
      this.abort.signal,
      timeout.signal,
      operation.signal,
    ]);
    try {
      const result = await withAbort(
        () =>
          this.resolve(config).lookup({
            config,
            input,
            profile: this.profile,
            signal,
            token: this.tokenFor(config),
            selection: target,
          }),
        signal,
      );
      if (result) {
        if (
          result.retention !== "session" &&
          (hasDefinition(result) || result.choices?.length)
        )
          this.cache.set(key, result);
        update({
          status: hasDefinition(result)
            ? "success"
            : result.choices?.length
              ? "choices"
              : "empty",
          result,
        });
      } else update({ status: "empty", message: "该词典没有找到结果" });
    } catch (error) {
      update({
        status: "error",
        message: timeout.signal.aborted
          ? "请求超时，可重试"
          : error instanceof Error && error.name === "ZodError"
            ? "服务返回的数据格式有变化"
            : error instanceof Error
              ? error.message.slice(0, 250)
              : "查询失败",
      });
    } finally {
      clearTimeout(timer);
      if (this.running.get(id) === operation) this.running.delete(id);
    }
  }
}
