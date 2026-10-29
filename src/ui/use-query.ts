import { useEffect, useRef, useState } from "react";
import {
  Profile,
  ProviderConfig,
  QueryInput,
  ResultState,
  LookupTarget,
} from "../core/schema";
import { normalizeQuery, QueryCache, QuerySession } from "../core/query";
import { resolveProvider } from "../providers/registry";
import { preferences } from "./shared";

export function useQuery(
  input: QueryInput,
  profile: Profile,
  providers: ProviderConfig[],
) {
  const key = JSON.stringify([input, profile, providers]);
  const [state, setState] = useState<{ key: string; rows: ResultState[] }>({
    key,
    rows: [],
  });
  const session = useRef<QuerySession | undefined>(undefined);
  const cache = useRef(new QueryCache());
  useEffect(() => {
    const [query, mode, sources] = JSON.parse(key) as [
      QueryInput,
      Profile,
      ProviderConfig[],
    ];
    query.text = normalizeQuery(query.text);
    if (!query.text || query.text.length > 3000) {
      session.current = undefined;
      setState({ key, rows: [] });
      return;
    }
    const prefs = preferences();
    const current = new QuerySession(
      query,
      mode,
      sources,
      resolveProvider,
      (rows) => setState({ key, rows }),
      (config) =>
        config.kind === "deepl"
          ? prefs.deeplKey
          : config.tokenSlot === "none"
            ? undefined
            : prefs[`apiToken${config.tokenSlot}`],
      cache.current,
    );
    session.current = current;
    setState({ key, rows: current.snapshot() });
    const timer = setTimeout(() => void current.start(), 400);
    return () => {
      clearTimeout(timer);
      current.cancel();
    };
  }, [key]);
  return {
    rows: state.key === key ? state.rows : [],
    run: (id: string) => session.current?.run(id, true),
    select: (id: string, target: LookupTarget) =>
      session.current?.run(id, true, target),
    reset: (id: string) => session.current?.reset(id),
  };
}
