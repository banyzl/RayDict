import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  LaunchProps,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { acquiredText } from "./core/acquired-text";
import { SearchView } from "./ui/search";
import { Loading } from "./ui/shared";

export default function Command({
  launchContext,
}: LaunchProps<{
  launchContext: { capturedText?: string; sourceApp?: string };
}>) {
  const captured = launchContext?.capturedText;
  const [text, setText] = useState<string | undefined>(captured);
  const [sourceApp, setSourceApp] = useState(launchContext?.sourceApp);
  const [query, setQuery] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (captured !== undefined) return;
    let active = true;
    void Clipboard.readText().then(
      (value) => {
        if (active) setText(value ?? "");
      },
      () => {
        if (active) {
          setText("");
          setError("无法读取剪贴板，请重新复制或直接输入。");
        }
      },
    );
    return () => {
      active = false;
    };
  }, [captured]);
  if (query !== undefined)
    return <SearchView initial={{ text: query, sourceApp }} />;
  if (text === undefined) return <Loading />;
  return (
    <Form
      navigationTitle={captured !== undefined ? "确认选中文字" : "剪贴板查词"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="查询这段文字"
            onSubmit={() => {
              try {
                setQuery(acquiredText(text));
              } catch (error) {
                setError(error instanceof Error ? error.message : "请检查文字");
              }
            }}
          />
          <Action
            title="重新读取剪贴板"
            onAction={async () => {
              try {
                setText((await Clipboard.readText()) ?? "");
                setSourceApp(undefined);
                setError(undefined);
              } catch {
                setError("无法读取剪贴板");
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          captured !== undefined
            ? "已通过兼容方式读取文字，请确认后查询。如果包含整条消息，可先删去不需要的部分。提交后才会发送给已启用的词典。"
            : "微信聊天消息：先选中文字，按 ⌘C 复制，再打开此命令。请确认下面是要查询的文字，提交后才会发送给已启用的词典。"
        }
      />
      <Form.TextArea
        id="text"
        title={captured !== undefined ? "选中文字" : "当前剪贴板文字"}
        value={text}
        onChange={(value) => {
          setText(value);
          setError(undefined);
        }}
        error={error}
      />
    </Form>
  );
}
