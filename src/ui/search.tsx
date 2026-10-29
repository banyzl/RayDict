import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  Keyboard,
  launchCommand,
  LaunchType,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppConfig, QueryInput, SavedRecord } from "../core/schema";
import { escapeMarkdown, renderResult } from "../core/render";
import { playAudio } from "../core/audio";
import { historyStore, notebookStore } from "../storage";
import { useQuery } from "./use-query";
import { Loading, perform, preferences, useConfig } from "./shared";
import { ContextForm } from "./context-form";
import { ProviderManager } from "./manager";
import { openNativeSettings } from "../core/native-settings";
import { RecordsView } from "./records";
import { LookupChoicesView } from "./lookup-choices";

export function SearchView({
  initial = { text: "" },
}: {
  initial?: QueryInput;
}) {
  const state = useConfig();
  return state.config ? (
    <SearchReady
      config={state.config}
      update={state.update}
      initial={initial}
    />
  ) : (
    <Loading error={state.error} retry={state.reload} />
  );
}
function SearchReady({
  config,
  update,
  initial,
}: {
  config: AppConfig;
  update: (config: AppConfig, expected?: AppConfig) => Promise<void>;
  initial: QueryInput;
}) {
  const [input, setInput] = useState<QueryInput>({
    text: initial.text,
    context: initial.context,
    sourceApp: initial.sourceApp,
    sourceUrl: initial.sourceUrl,
  });
  const profile = config.profiles.find((p) => p.id === config.activeProfileId)!;
  const providers = profile.providerIds.map((id) =>
    config.providers.find((p) => p.id === id)!,
  );
  const { rows, run, select, reset } = useQuery(input, profile, providers);
  const complete =
    rows.length > 0 &&
    !rows.some((r) => ["waiting", "loading"].includes(r.status));
  const successful = rows.filter((r) => r.status === "success" && r.result);
  const record: SavedRecord = {
    ...input,
    text: input.text.trim(),
    id: randomUUID(),
    profileId: profile.id,
    profileName: profile.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    references: successful.flatMap((r) =>
      r.result?.retention === "session" ? r.result.attributions : [],
    ),
    results: successful
      .filter((r) => r.result?.retention !== "session")
      .map((r) => ({
        providerId: r.providerId,
        providerName: providers.find((p) => p.id === r.providerId)!.name,
        result: r.result!,
      })),
  };
  const historyKey = JSON.stringify([
    input,
    profile.id,
    complete,
    successful.length,
  ]);
  useEffect(() => {
    if (!complete || !successful.length || !preferences().recordHistory) return;
    const timer = setTimeout(
      () =>
        void perform("保存历史失败", async () => {
          const id = createHash("sha256")
            .update(JSON.stringify([input, profile.id]))
            .digest("hex");
          // History keeps the query and context. Dictionary snapshots belong in the notebook.
          await historyStore.put({ ...record, id, results: [] });
          const history = await historyStore.list();
          await Promise.all(
            history.slice(300).map((row) => historyStore.remove(row.id)),
          );
        }),
      600,
    );
    return () => clearTimeout(timer);
    // This key intentionally ignores timestamps generated while rendering.
  }, [historyKey]);
  const navigationActions = (
    <>
      <Action
        title="剪贴板查词（先确认文字）"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
        onAction={() =>
          perform("无法打开剪贴板查词", () =>
            launchCommand({
              name: "lookup-clipboard",
              type: LaunchType.UserInitiated,
            }),
          )
        }
      />
      <Action
        title="打开独立设置窗口"
        icon={Icon.Gear}
        shortcut={{ modifiers: ["cmd"], key: "m" }}
        onAction={() => perform("无法打开设置", openNativeSettings)}
      />
      <Action.Push
        title="Raycast 内简易管理"
        icon={Icon.Gear}
        target={<ProviderManager config={config} update={update} />}
      />
      <Action.Push
        title="打开生词本"
        icon={Icon.Bookmark}
        target={<RecordsView kind="notebook" />}
      />
      <Action.Push
        title="查看历史"
        icon={Icon.Clock}
        target={<RecordsView kind="history" />}
      />
      <Action
        title="扩展设置与密钥"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </>
  );
  const sharedActions = (
    <>
      {successful.length > 0 && (
        <Action
          title="保存到生词本"
          icon={Icon.Bookmark}
          shortcut={Keyboard.Shortcut.Common.Save}
          onAction={() =>
            perform("保存失败", async () => {
              await notebookStore.put(record);
              await showToast({
                style: Toast.Style.Success,
                title: "已保存单词、上下文与来源",
              });
            })
          }
        />
      )}
      <Action.Push
        title="编辑上下文与来源"
        icon={Icon.Pencil}
        target={<ContextForm input={input} onSave={setInput} />}
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
      />
      <Action
        title="系统朗读"
        icon={Icon.SpeakerHigh}
        onAction={() =>
          perform("朗读失败", () =>
            promisify(execFile)("/usr/bin/say", ["--", input.text]),
          )
        }
      />
      {navigationActions}
    </>
  );
  const labels: Record<string, string> = {
    waiting: "等待查询…",
    manual: "按回车查询",
    loading: "查询中…",
    empty: "暂无结果",
    choices: "按回车选择词条",
    error: "查询失败 · 回车重试",
    skipped: "当前内容不适用于此词典",
    success: "",
  };
  const readingContext = [
    input.context ? `### 阅读上下文\n\n${escapeMarkdown(input.context)}` : "",
    input.sourceApp ? `来源应用：${escapeMarkdown(input.sourceApp)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return (
    <List
      isShowingDetail={Boolean(input.text.trim())}
      filtering={false}
      searchText={input.text}
      onSearchTextChange={(text) => setInput((old) => ({ ...old, text }))}
      isLoading={rows.some((r) => r.status === "loading")}
      searchBarPlaceholder="输入单词、短语或句子…"
      navigationTitle="RayDict"
      searchBarAccessory={
        <List.Dropdown
          tooltip="情景模式"
          value={profile.id}
          onChange={(id) =>
            void perform("切换模式失败", () =>
              update({ ...config, activeProfileId: id }),
            )
          }
        >
          {config.profiles.map((p) => (
            <List.Dropdown.Item key={p.id} value={p.id} title={p.name} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.Book}
        title={
          input.text.length > 3000
            ? "单次最多 3000 字符"
            : !providers.length
              ? "此情景模式尚未启用词典"
              : "查词，从一个词开始"
        }
        description="↑↓ 切换词典 · ⌘P 切换模式 · ⌘M 管理词典"
        actions={<ActionPanel>{navigationActions}</ActionPanel>}
      />
      {rows.map((row) => {
        const provider = providers.find((p) => p.id === row.providerId)!;
        const choices = row.result?.choices ?? [];
        const chooser =
          choices.length > 0 ? (
            <Action.Push
              title={row.status === "choices" ? "选择词条" : "词形与可选词条"}
              icon={Icon.List}
              shortcut={{ modifiers: ["cmd"], key: "j" }}
              target={
                <LookupChoicesView
                  choices={choices}
                  providerName={provider.name}
                  onChoose={(choice) => select(provider.id, choice.target)}
                />
              }
            />
          ) : undefined;
        const content = row.result
          ? renderResult(row.result)
          : `# ${escapeMarkdown(provider.name)}\n\n${escapeMarkdown(row.message ?? labels[row.status])}${row.status === "manual" ? "\n\n按回车将当前文本发送给此服务；翻译与 AI 可能需要密钥或账户权限。" : ""}`;
        const markdown = row.selection
          ? `> 当前词条：${escapeMarkdown(row.selection.query)} · 可通过操作菜单返回原查询。\n\n${content}`
          : content;
        return (
          <List.Item
            key={provider.id}
            id={provider.id}
            title={provider.name}
            subtitle={row.result?.summary.slice(0, 100) ?? labels[row.status]}
            icon={{
              source:
                row.status === "error"
                  ? Icon.ExclamationMark
                  : row.status === "success"
                    ? Icon.CheckCircle
                    : row.status === "choices"
                      ? Icon.List
                      : provider.kind === "ai"
                        ? Icon.Stars
                        : Icon.Book,
              tintColor:
                row.status === "error"
                  ? Color.Orange
                  : row.status === "success"
                    ? Color.Green
                    : row.status === "choices"
                      ? Color.Blue
                      : Color.SecondaryText,
            }}
            detail={
              <List.Item.Detail
                markdown={
                  readingContext
                    ? `${markdown}\n\n---\n\n${readingContext}`
                    : markdown
                }
              />
            }
            actions={
              <ActionPanel>
                {row.status === "choices" && chooser}
                {row.status !== "success" &&
                  row.status !== "skipped" &&
                  row.status !== "choices" && (
                    <Action
                      title={
                        row.status === "manual" ? "查询此词典" : "重试此词典"
                      }
                      icon={Icon.MagnifyingGlass}
                      onAction={() => run(provider.id)}
                    />
                  )}
                {row.result && row.status === "success" && (
                  <Action.CopyToClipboard
                    title="复制此词典结果"
                    content={renderResult(row.result)}
                  />
                )}
                {row.status !== "choices" && chooser}
                {row.selection && (
                  <Action
                    title="返回原查询"
                    icon={Icon.ArrowLeft}
                    onAction={() => reset(provider.id)}
                  />
                )}
                {provider.kind === "wikipedia" && row.status === "error" && (
                  <Action.OpenInBrowser
                    title="在维基百科原站查看"
                    url={`https://${row.selection?.language ?? (provider.language === "auto" ? (/\p{Script=Han}/u.test(input.text) ? "zh" : "en") : provider.language)}.wikipedia.org/wiki/${encodeURIComponent(row.selection?.query ?? input.text)}`}
                  />
                )}
                {row.result?.audio?.map((audio, i) => (
                  <Action
                    key={`${audio.url}-${i}`}
                    title={`播放${audio.label}`}
                    icon={Icon.SpeakerHigh}
                    onAction={() =>
                      perform("音频播放失败", () => playAudio(audio.url))
                    }
                  />
                ))}
                {sharedActions}
                {(row.status === "success" || row.status === "choices") && (
                  <Action
                    title="重新查询此词典"
                    icon={Icon.ArrowClockwise}
                    onAction={() => run(provider.id)}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
