import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { AppConfig } from "../core/schema";
import { loadConfig, saveConfig } from "../storage";

export function preferences() {
  return getPreferenceValues<{
    recordHistory: boolean;
    deeplKey?: string;
    apiToken1?: string;
    apiToken2?: string;
    apiToken3?: string;
    ankiEndpoint?: string;
    ankiKey?: string;
    ankiDeck?: string;
    ankiModel?: string;
    ankiFront?: string;
    ankiBack?: string;
  }>();
}
export async function perform(title: string, task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title,
      message:
        error instanceof Error ? error.message.slice(0, 300) : "操作失败",
    });
  }
}
export function useConfig() {
  const [config, setConfig] = useState<AppConfig>();
  const [error, setError] = useState<string>();
  async function reload() {
    try {
      setConfig(await loadConfig());
      setError(undefined);
    } catch {
      setError("无法读取词典配置。已有数据已保留，请检查配置后重试。");
    }
  }
  useEffect(() => {
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const next = await loadConfig();
        if (active) {
          setConfig((old) =>
            JSON.stringify(old) === JSON.stringify(next) ? old : next,
          );
          setError(undefined);
        }
      } catch {
        if (active)
          setError("无法读取词典配置。已有数据已保留，请检查配置后重试。");
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function update(next: AppConfig, expected = config) {
    await saveConfig(next, expected);
    setConfig(next);
  }
  return { config, update, error, reload };
}
export function Loading({
  error,
  retry,
}: {
  error?: string;
  retry?: () => void;
}) {
  return (
    <Detail
      isLoading={!error}
      markdown={error ?? "正在加载 RayDict…"}
      actions={
        error && retry ? (
          <ActionPanel>
            <Action title="重试" onAction={retry} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
