import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useState } from "react";
import {
  AppConfig,
  DEFAULT_CONFIG,
  Profile,
  ProfileSchema,
  ProviderConfig,
} from "../core/schema";
import { escapeMarkdown } from "../core/render";
import { providerDescription } from "../core/catalog";
import {
  ImportConfigForm,
  ImportProviderForm,
  ProviderForm,
} from "./provider-form";
import { perform } from "./shared";

export function ProviderManager({
  config: initial,
  update: persist,
}: {
  config: AppConfig;
  update: (config: AppConfig, expected?: AppConfig) => Promise<void>;
}) {
  const [config, setConfig] = useState(initial);
  async function update(next: AppConfig) {
    await persist(next, config);
    setConfig(next);
  }
  const profile = config.profiles.find((p) => p.id === config.activeProfileId)!;
  const ordered = [
    ...profile.providerIds.map((id) =>
      config.providers.find((p) => p.id === id)!,
    ),
    ...config.providers.filter((p) => !profile.providerIds.includes(p.id)),
  ];
  async function saveProvider(provider: ProviderConfig) {
    const exists = config.providers.some((p) => p.id === provider.id);
    await update({
      ...config,
      providers: exists
        ? config.providers.map((p) => (p.id === provider.id ? provider : p))
        : [...config.providers, provider],
      profiles: exists
        ? config.profiles
        : config.profiles.map((p) =>
            p.id === profile.id
              ? { ...p, providerIds: [...p.providerIds, provider.id] }
              : p,
          ),
    });
  }
  function profileWith(ids: string[]) {
    return config.profiles.map((p) =>
      p.id === profile.id ? { ...p, providerIds: ids } : p,
    );
  }
  async function move(id: string, by: number) {
    const ids = [...profile.providerIds];
    const from = ids.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await update({ ...config, profiles: profileWith(ids) });
  }
  const globalActions = (
    <>
      <Action.Push
        title="添加 REST API 词典"
        icon={Icon.Plus}
        target={<ProviderForm onSave={saveProvider} />}
        shortcut={Keyboard.Shortcut.Common.New}
      />
      <Action.Push
        title="导入 Provider JSON"
        icon={Icon.Download}
        target={<ImportProviderForm onSave={saveProvider} />}
      />
      <Action.Push
        title="添加情景模式"
        icon={Icon.Plus}
        target={
          <ProfileForm
            onSave={async (next) =>
              update({
                ...config,
                activeProfileId: next.id,
                profiles: [...config.profiles, next],
              })
            }
          />
        }
      />
      <Action.Push
        title="编辑此情景模式"
        icon={Icon.Pencil}
        target={
          <ProfileForm
            profile={profile}
            onSave={async (next) =>
              update({
                ...config,
                profiles: config.profiles.map((p) =>
                  p.id === next.id ? next : p,
                ),
              })
            }
          />
        }
      />
      <Action.CopyToClipboard
        title="复制完整配置备份"
        content={JSON.stringify(config, null, 2)}
      />
      <Action.Push
        title="从备份恢复词典配置"
        icon={Icon.Download}
        target={<ImportConfigForm onSave={update} />}
      />
      <ActionPanel.Submenu title="恢复已删除的内置词典" icon={Icon.Plus}>
        {DEFAULT_CONFIG.providers
          .filter((p) => !config.providers.some((item) => item.id === p.id))
          .map((p) => (
            <Action
              key={p.id}
              title={p.name}
              onAction={() => perform("恢复失败", () => saveProvider(p))}
            />
          ))}
      </ActionPanel.Submenu>
      {config.profiles.length > 1 && (
        <Action
          title="删除此情景模式"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          onAction={() =>
            perform("删除失败", () =>
              update({
                ...config,
                activeProfileId: config.profiles.find(
                  (p) => p.id !== profile.id,
                )!.id,
                profiles: config.profiles.filter((p) => p.id !== profile.id),
              }),
            )
          }
        />
      )}
    </>
  );
  return (
    <List
      navigationTitle="词典与情景模式"
      isShowingDetail
      searchBarPlaceholder="搜索词典…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="编辑哪个情景模式"
          value={profile.id}
          onChange={(id) =>
            void perform("切换失败", () =>
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
        title="尚未添加词典"
        actions={<ActionPanel>{globalActions}</ActionPanel>}
      />
      {ordered.map((provider) => {
        const enabled = profile.providerIds.includes(provider.id);
        return (
          <List.Item
            key={provider.id}
            title={provider.name}
            subtitle={
              enabled
                ? `${profile.providerIds.indexOf(provider.id) + 1} · ${provider.trigger === "auto" ? "自动" : "手动"}`
                : "此模式未启用"
            }
            icon={{
              source: enabled ? Icon.CheckCircle : Icon.Circle,
              tintColor: enabled ? Color.Green : Color.SecondaryText,
            }}
            detail={
              <List.Item.Detail
                markdown={`# ${escapeMarkdown(provider.name)}\n\n类型：${providerDescription(provider)}\n\n${provider.kind === "json" ? `API：${escapeMarkdown(provider.endpoint ?? "")}` : provider.kind === "glossary" ? "本地原创术语笔记，可离线使用。" : "查询时直接调用服务，无需浏览器。"}\n\n${provider.trigger === "auto" ? "随输入自动查询。" : "手动按回车查询。"}\n\n词典组合和排序属于当前情景模式；Provider 配置由所有模式共享。`}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title={enabled ? "从此模式停用" : "在此模式启用"}
                  icon={enabled ? Icon.Minus : Icon.Plus}
                  onAction={() =>
                    perform("更新失败", () =>
                      update({
                        ...config,
                        profiles: profileWith(
                          enabled
                            ? profile.providerIds.filter(
                                (id) => id !== provider.id,
                              )
                            : [...profile.providerIds, provider.id],
                        ),
                      }),
                    )
                  }
                />
                <Action.Push
                  title="配置此词典"
                  icon={Icon.Gear}
                  target={
                    <ProviderForm provider={provider} onSave={saveProvider} />
                  }
                />
                {enabled && (
                  <>
                    <Action
                      title="上移"
                      icon={Icon.ArrowUp}
                      shortcut={Keyboard.Shortcut.Common.MoveUp}
                      onAction={() =>
                        perform("排序失败", () => move(provider.id, -1))
                      }
                    />
                    <Action
                      title="下移"
                      icon={Icon.ArrowDown}
                      shortcut={Keyboard.Shortcut.Common.MoveDown}
                      onAction={() =>
                        perform("排序失败", () => move(provider.id, 1))
                      }
                    />
                  </>
                )}
                <Action.CopyToClipboard
                  title="复制此 Provider 配置"
                  content={JSON.stringify(provider, null, 2)}
                />
                {globalActions}
                <Action
                  title="删除此词典（所有模式）"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() =>
                    perform("删除失败", () =>
                      update({
                        ...config,
                        providers: config.providers.filter(
                          (p) => p.id !== provider.id,
                        ),
                        profiles: config.profiles.map((p) => ({
                          ...p,
                          providerIds: p.providerIds.filter(
                            (id) => id !== provider.id,
                          ),
                        })),
                      }),
                    )
                  }
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
function ProfileForm({
  profile,
  onSave,
}: {
  profile?: Profile;
  onSave: (profile: Profile) => Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="情景模式"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="保存情景模式"
            onSubmit={(values: {
              name: string;
              sourceLanguage: string;
              targetLanguage: string;
              aiPrompt: string;
            }) =>
              perform("保存失败", async () => {
                await onSave(
                  ProfileSchema.parse({
                    ...values,
                    id: profile?.id ?? randomUUID(),
                    providerIds: profile?.providerIds ?? [],
                  }),
                );
                pop();
              })
            }
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="模式名称"
        defaultValue={profile?.name ?? "我的阅读模式"}
      />
      <Form.TextField
        id="sourceLanguage"
        title="源语言"
        defaultValue={profile?.sourceLanguage ?? "en"}
      />
      <Form.TextField
        id="targetLanguage"
        title="目标语言"
        defaultValue={profile?.targetLanguage ?? "zh-CN"}
      />
      <Form.TextArea
        id="aiPrompt"
        title="AI 情景要求"
        defaultValue={
          profile?.aiPrompt ?? "用中文解释词义，提供词性、例句与常见搭配。"
        }
      />
      <Form.Description text="新模式创建后，可在词典列表中启用并排序词典。语言代码需符合所使用 API 的要求。" />
    </Form>
  );
}
