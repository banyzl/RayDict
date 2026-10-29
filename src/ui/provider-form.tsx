import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useState } from "react";
import {
  AppConfig,
  ConfigSchema,
  ProviderConfig,
  ProviderSchema,
} from "../core/schema";
import { validateJsonProvider } from "../providers/json";
import { perform } from "./shared";

type Fields = {
  name: string;
  endpoint: string;
  method: string;
  trigger: string;
  scope: string;
  entries: string;
  definition: string;
  headword: string;
  phonetic: string;
  partOfSpeech: string;
  example: string;
  audio: string;
  headers: string;
  body: string;
  tokenSlot: string;
  attribution: string;
  attributionUrl: string;
};
export function ProviderForm({
  provider,
  onSave,
}: {
  provider?: ProviderConfig;
  onSave: (provider: ProviderConfig) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [method, setMethod] = useState(provider?.method ?? "GET");
  const custom = !provider || provider.kind === "json";
  return (
    <Form
      navigationTitle={provider ? "配置词典" : "添加 REST JSON 词典"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="保存词典"
            onSubmit={(values: Fields) =>
              perform("无法保存词典", async () => {
                const mapping = {
                  entries: values.entries ?? "",
                  definition: values.definition ?? "",
                  headword: values.headword || undefined,
                  phonetic: values.phonetic || undefined,
                  partOfSpeech: values.partOfSpeech || undefined,
                  example: values.example || undefined,
                  audio: values.audio || undefined,
                };
                const next = ProviderSchema.parse({
                  ...(provider ?? { id: randomUUID(), kind: "json" }),
                  name: values.name.trim(),
                  trigger: values.trigger,
                  scope: values.scope,
                  ...(custom
                    ? {
                        endpoint: values.endpoint,
                        method: values.method,
                        headers: JSON.parse(values.headers || "{}"),
                        body: values.body ? JSON.parse(values.body) : undefined,
                        tokenSlot: values.tokenSlot,
                        mapping,
                        attribution: values.attribution,
                        attributionUrl: values.attributionUrl,
                      }
                    : {}),
                });
                validateJsonProvider(next);
                await onSave(next);
                pop();
              })
            }
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="显示名称"
        defaultValue={provider?.name ?? "我的词典"}
      />
      <Form.Dropdown
        id="trigger"
        title="查询方式"
        defaultValue={provider?.trigger ?? "auto"}
      >
        <Form.Dropdown.Item value="auto" title="自动 · 随输入查询" />
        <Form.Dropdown.Item value="manual" title="手动 · 按回车查询" />
      </Form.Dropdown>
      <Form.Dropdown
        id="scope"
        title="输入类型"
        defaultValue={provider?.scope ?? "any"}
      >
        <Form.Dropdown.Item value="any" title="单词与句子" />
        <Form.Dropdown.Item value="word" title="单词 / 短语（最多 4 词）" />
      </Form.Dropdown>
      {custom && (
        <>
          <Form.Separator />
          <Form.Description text="填写返回 JSON 的 API，无需编程。支持 {word}、{source}、{target} 和 {context}。输入会发送到该 API。只有返回网页 HTML 的 URL 不能直接作为原生词典。" />
          <Form.TextField
            id="endpoint"
            title="API URL"
            placeholder="https://api.example.com/lookup?q={word}"
            defaultValue={provider?.endpoint ?? ""}
          />
          <Form.Dropdown
            id="method"
            title="请求方法"
            value={method}
            onChange={(value) => setMethod(value as "GET" | "POST")}
          >
            <Form.Dropdown.Item value="GET" title="GET" />
            <Form.Dropdown.Item value="POST" title="POST JSON" />
          </Form.Dropdown>
          <Form.Dropdown
            id="tokenSlot"
            title="密钥槽位"
            defaultValue={provider?.tokenSlot ?? "none"}
          >
            <Form.Dropdown.Item value="none" title="无需密钥" />
            {["1", "2", "3"].map((n) => (
              <Form.Dropdown.Item
                key={n}
                value={n}
                title={`扩展设置中的 API 密钥 ${n}`}
              />
            ))}
          </Form.Dropdown>
          <Form.TextArea
            id="headers"
            title="请求头 JSON"
            placeholder={'{"Authorization":"Bearer {token}"}'}
            defaultValue={JSON.stringify(provider?.headers ?? {}, null, 2)}
          />
          {method === "POST" && (
            <Form.TextArea
              id="body"
              title="请求体 JSON"
              placeholder={'{"text":"{word}","target":"{target}"}'}
              defaultValue={
                provider?.body ? JSON.stringify(provider.body, null, 2) : "{}"
              }
            />
          )}
          <Form.Description text="密钥请填在扩展设置的密码字段，用 {token} 引用；不要写入 URL 或配置正文。路径支持 data.items、[0]、meanings[].definitions[].definition。留空表示当前值。" />
          <Form.TextField
            id="entries"
            title="词条数组路径"
            defaultValue={provider?.mapping?.entries ?? ""}
            placeholder="data.items（根数组留空）"
          />
          <Form.TextField
            id="definition"
            title="释义路径"
            defaultValue={provider?.mapping?.definition ?? "definition"}
          />
          <Form.TextField
            id="headword"
            title="单词路径（可选）"
            defaultValue={provider?.mapping?.headword ?? ""}
          />
          <Form.TextField
            id="phonetic"
            title="音标路径（可选）"
            defaultValue={provider?.mapping?.phonetic ?? ""}
          />
          <Form.TextField
            id="partOfSpeech"
            title="词性路径（可选）"
            defaultValue={provider?.mapping?.partOfSpeech ?? ""}
          />
          <Form.TextField
            id="example"
            title="例句路径（可选）"
            defaultValue={provider?.mapping?.example ?? ""}
          />
          <Form.TextField
            id="audio"
            title="音频 URL 路径（可选）"
            defaultValue={provider?.mapping?.audio ?? ""}
          />
          <Form.TextField
            id="attribution"
            title="来源 / 许可证说明"
            defaultValue={provider?.attribution ?? ""}
          />
          <Form.TextField
            id="attributionUrl"
            title="来源链接（可选）"
            defaultValue={provider?.attributionUrl ?? ""}
          />
        </>
      )}
    </Form>
  );
}
export function ImportProviderForm({
  onSave,
}: {
  onSave: (provider: ProviderConfig) => Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="导入 Provider 配置"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="导入词典"
            onSubmit={(values: { json: string }) =>
              perform("导入失败", async () => {
                const provider = ProviderSchema.parse({
                  ...JSON.parse(values.json),
                  id: randomUUID(),
                });
                validateJsonProvider(provider);
                await onSave(provider);
                pop();
              })
            }
          />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴可信来源的 Provider JSON。导入后会按配置向 API 发送查询；密钥槽位使用本机设置，不会包含在导出的配置中。" />
      <Form.TextArea id="json" title="Provider JSON" />
    </Form>
  );
}

export function ImportConfigForm({
  onSave,
}: {
  onSave: (config: AppConfig) => Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="恢复词典配置"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="验证并替换配置"
            onSubmit={(values: { json: string }) =>
              perform("恢复失败", async () => {
                const config = ConfigSchema.parse(JSON.parse(values.json));
                config.providers.forEach(validateJsonProvider);
                await onSave(config);
                pop();
              })
            }
          />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴之前导出的完整配置。此操作替换词典和情景模式；生词本、历史与本机密码设置不受影响。" />
      <Form.TextArea id="json" title="配置 JSON" />
    </Form>
  );
}
