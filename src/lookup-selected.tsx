import {
  Action,
  ActionPanel,
  Detail,
  getFrontmostApplication,
  getSelectedText,
  Icon,
  launchCommand,
  LaunchProps,
  LaunchType,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { acquiredText } from "./core/acquired-text";
import { QueryInput } from "./core/schema";
import { escapeMarkdown } from "./core/render";
import { SearchView } from "./ui/search";
import { Loading, perform } from "./ui/shared";

type Context = { failure?: string; sourceBundle?: string; sourceApp?: string };
export default function Command(
  props: LaunchProps<{ launchContext: Context }>,
) {
  const [input, setInput] = useState<QueryInput>();
  const [failure, setFailure] = useState<Context | undefined>(
    props.launchContext?.failure ? props.launchContext : undefined,
  );
  useEffect(() => {
    if (props.launchContext?.failure) return;
    let active = true;
    void Promise.allSettled([
      getSelectedText(),
      getFrontmostApplication(),
    ]).then(async ([selection, app]) => {
      if (!active) return;
      const source = {
        sourceBundle:
          app.status === "fulfilled" ? app.value.bundleId : undefined,
        sourceApp: app.status === "fulfilled" ? app.value.name : undefined,
      };
      if (selection.status === "fulfilled" && selection.value.trim()) {
        try {
          setInput({
            text: acquiredText(selection.value),
            sourceApp: source.sourceApp,
          });
        } catch (error) {
          setFailure({ ...source, failure: String(error) });
        }
        return;
      }
      if (source.sourceBundle?.startsWith("com.tencent.xinWeChat")) {
        try {
          await launchCommand({
            name: "lookup-copy",
            type: LaunchType.UserInitiated,
            context: source,
          });
          return;
        } catch {
          /* Keep recovery choices if the compatibility command is disabled. */
        }
      }
      if (active)
        setFailure({
          ...source,
          failure: "当前应用没有提供可读取的选中文字。",
        });
    });
    return () => {
      active = false;
    };
  }, [props.launchContext]);
  if (input) return <SearchView initial={input} />;
  if (!failure) return <Loading />;
  const launch = (name: string, context?: Context) =>
    perform("无法打开取词入口", () =>
      launchCommand({ name, context, type: LaunchType.UserInitiated }),
    );
  return (
    <Detail
      navigationTitle="微信与应用取词"
      markdown={[
        "# 未能直接读取选中文字",
        escapeMarkdown(failure.failure ?? ""),
        "## 微信聊天消息的可靠用法",
        "1. 回到微信，在消息里拖选所需文字。\n2. 按 **⌘C**；若快捷键无效，右键选择 **复制**。\n3. 打开 **RayDict → 剪贴板查词**，确认文字后查询。",
        "如果微信没有提供复制菜单，Raycast 无法凭选区高亮强行取得文字。聊天消息、输入框和公众号页面的支持情况可能不同。",
        "也可尝试下面的兼容取词，它只调用原应用的「复制」菜单，并在读取后恢复原剪贴板；不会把旧剪贴板自动当作选中文字。",
        "若所有应用都无法取词，请在系统设置 → 隐私与安全性 → 辅助功能中检查 Raycast 权限。",
      ].join("\n\n")}
      actions={
        <ActionPanel>
          <Action
            title="剪贴板查词（先确认文字）"
            icon={Icon.Clipboard}
            onAction={() => launch("lookup-clipboard")}
          />
          {failure.sourceBundle && (
            <Action
              title="重试兼容取词（菜单复制）"
              icon={Icon.CopyClipboard}
              onAction={() => launch("lookup-copy", failure)}
            />
          )}
          <Action
            title="直接输入查询"
            icon={Icon.Pencil}
            onAction={() => launch("search")}
          />
          <Action.OpenInBrowser
            title="打开辅助功能设置"
            url="x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
          />
        </ActionPanel>
      }
    />
  );
}
