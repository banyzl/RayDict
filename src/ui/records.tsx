import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { randomUUID } from "node:crypto";
import { SavedRecord } from "../core/schema";
import { renderRecord } from "../core/render";
import { sendToAnki } from "../core/anki";
import { historyStore, notebookStore } from "../storage";
import { Loading, perform, preferences } from "./shared";
import { SearchView } from "./search";

export function RecordsView({ kind }: { kind: "history" | "notebook" }) {
  const store = kind === "history" ? historyStore : notebookStore;
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  async function reload() {
    try {
      setRecords(await store.list());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [kind]);
  if (error) return <Loading error={error} retry={reload} />;
  const actions = (
    <>
      <Action.CopyToClipboard
        title="复制 JSON 备份"
        content={JSON.stringify({ schemaVersion: 1, kind, records }, null, 2)}
      />
      <Action.CopyToClipboard
        title="复制 Markdown 导出"
        content={records.map(renderRecord).join("\n\n---\n\n")}
      />
      <Action title="刷新" icon={Icon.ArrowClockwise} onAction={reload} />
      <Action
        title={kind === "history" ? "清空历史" : "清空生词本"}
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={() =>
          perform("清空失败", async () => {
            if (
              await confirmAlert({
                title: "清空全部记录？",
                message: "建议先复制 JSON 备份。此操作无法撤销。",
                primaryAction: {
                  title: "清空",
                  style: Alert.ActionStyle.Destructive,
                },
              })
            ) {
              await store.clear();
              await reload();
            }
          })
        }
      />
      <Action
        title="扩展设置"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </>
  );
  return (
    <List
      isLoading={loading || sending}
      isShowingDetail
      navigationTitle={kind === "history" ? "查词历史" : "生词本"}
      searchBarPlaceholder="搜索单词、上下文、笔记…"
    >
      <List.EmptyView
        icon={Icon.Bookmark}
        title={kind === "history" ? "暂无查词历史" : "还没有收藏的单词"}
        description="查询后按 ⌘S 保存到生词本。"
        actions={<ActionPanel>{actions}</ActionPanel>}
      />
      {records.map((record) => (
        <List.Item
          key={record.id}
          title={record.text}
          subtitle={record.note || record.results[0]?.result.summary}
          keywords={[
            record.context ?? "",
            record.note ?? "",
            record.sourceApp ?? "",
          ]}
          detail={<List.Item.Detail markdown={renderRecord(record)} />}
          actions={
            <ActionPanel>
              <Action.Push
                title="重新查询"
                icon={Icon.MagnifyingGlass}
                target={<SearchView initial={record} />}
              />
              {kind === "notebook" ? (
                <>
                  <Action.Push
                    title="编辑上下文与笔记"
                    icon={Icon.Pencil}
                    target={
                      <RecordForm
                        record={record}
                        onSave={async (next) => {
                          await store.put(next);
                          await reload();
                        }}
                      />
                    }
                  />
                  <Action
                    title="发送到 Anki"
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                    onAction={() => {
                      if (sending) return;
                      setSending(true);
                      return perform("Anki 制卡失败", async () => {
                        const prefs = preferences();
                        await sendToAnki(record, {
                          endpoint:
                            prefs.ankiEndpoint || "http://127.0.0.1:8765",
                          key: prefs.ankiKey,
                          deck: prefs.ankiDeck || "Default",
                          model: prefs.ankiModel || "Basic",
                          front: prefs.ankiFront || "Front",
                          back: prefs.ankiBack || "Back",
                        });
                        await showToast({
                          style: Toast.Style.Success,
                          title: "已创建 Anki 卡片",
                        });
                      }).finally(() => setSending(false));
                    }}
                  />
                </>
              ) : (
                <Action
                  title="将历史记录加入生词本"
                  icon={Icon.Bookmark}
                  onAction={() =>
                    perform("保存失败", async () => {
                      await notebookStore.put({
                        ...record,
                        id: randomUUID(),
                        updatedAt: new Date().toISOString(),
                      });
                      await showToast({
                        title: "已保存查询与上下文，重新查询后可保存释义",
                      });
                    })
                  }
                />
              )}
              <Action.CopyToClipboard
                title="复制此条 Markdown"
                content={renderRecord(record)}
              />
              <Action
                title="删除此条"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() =>
                  perform("删除失败", async () => {
                    await store.remove(record.id);
                    await reload();
                  })
                }
              />
              {actions}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
function RecordForm({
  record,
  onSave,
}: {
  record: SavedRecord;
  onSave: (record: SavedRecord) => Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={record.text}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="保存笔记"
            onSubmit={(values: {
              context: string;
              note: string;
              sourceApp: string;
              sourceUrl: string;
            }) =>
              perform("保存失败", async () => {
                await onSave({
                  ...record,
                  ...values,
                  updatedAt: new Date().toISOString(),
                });
                pop();
              })
            }
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="context"
        title="上下文"
        defaultValue={record.context ?? ""}
      />
      <Form.TextArea id="note" title="笔记" defaultValue={record.note ?? ""} />
      <Form.TextField
        id="sourceApp"
        title="来源"
        defaultValue={record.sourceApp ?? ""}
      />
      <Form.TextField
        id="sourceUrl"
        title="原文链接"
        defaultValue={record.sourceUrl ?? ""}
      />
    </Form>
  );
}
