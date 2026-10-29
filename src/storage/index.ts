import { environment, LocalStorage } from "@raycast/api";
import { join } from "node:path";
import { AppConfig, ConfigSchema, DEFAULT_CONFIG } from "../core/schema";
import { migrateCatalog } from "../core/catalog";
import { FileRecordStore } from "./files";
import { ConfigFile } from "./config-file";
export const configPath = join(environment.supportPath, "settings-v1.json");
export const configFile = new ConfigFile(configPath);
const configKey = "raydict.config.v1";
export async function loadConfig(): Promise<AppConfig> {
  let saved = await configFile.read();
  if (!saved) {
    const legacy = await LocalStorage.getItem<string>(configKey);
    const initial = legacy
      ? ConfigSchema.parse(JSON.parse(legacy))
      : structuredClone(DEFAULT_CONFIG);
    try {
      saved = await configFile.write(migrateCatalog(initial), null);
    } catch (error) {
      saved = await configFile.read();
      if (!saved) throw error;
    }
  }
  const next = migrateCatalog(saved.config);
  if (next !== saved.config)
    return (await configFile.write(next, saved.config)).config;
  return saved.config;
}
export async function saveConfig(config: AppConfig, expected?: AppConfig) {
  const current = expected ?? (await loadConfig());
  return configFile.write(config, current);
}
export const notebookStore = new FileRecordStore(
  join(environment.supportPath, "notebook-v1"),
);
export const historyStore = new FileRecordStore(
  join(environment.supportPath, "history-v1"),
);
