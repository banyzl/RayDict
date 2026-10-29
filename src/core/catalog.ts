import data from "./catalog-data.json";
import {
  AppConfig,
  ConfigSchema,
  ProviderConfig,
  ProviderSchema,
} from "./schema";
export const CATALOG = data.map((item) => ({
  ...item,
  config: ProviderSchema.parse(item.config),
}));
export function providerDescription(provider: ProviderConfig) {
  return (
    CATALOG.find((item) => item.config.kind === provider.kind)?.description ??
    "自定义 REST JSON 词典"
  );
}
export function migrateCatalog(config: AppConfig): AppConfig {
  if (config.catalogVersion >= 3) return config;
  const oldKinds = ["youdao", "cambridge", "zdic", "wikipedia"];
  const newKinds = ["bing", "dictcn", "oxford", "longman", "wiktionary"];
  const additions = CATALOG.filter((item) =>
    [...(config.catalogVersion < 2 ? oldKinds : []), ...newKinds].includes(
      item.config.kind,
    ),
  );
  const providers = [...config.providers];
  for (const item of additions)
    if (!providers.some((p) => p.id === item.config.id))
      providers.push(item.config);
  const next = {
    ...config,
    catalogVersion: 3,
    providers,
    profiles: config.profiles.map((profile) =>
      config.catalogVersion < 2 && ["general", "cs"].includes(profile.id)
        ? {
            ...profile,
            providerIds: [
              ...new Set([
                ...additions
                  .filter((item) => oldKinds.includes(item.config.kind))
                  .map((item) => item.config.id),
                ...profile.providerIds,
              ]),
            ],
          }
        : profile,
    ),
  };
  return ConfigSchema.parse(next);
}
