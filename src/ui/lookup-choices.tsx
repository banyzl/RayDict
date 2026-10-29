import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { LookupChoice } from "../core/schema";

const labels: Record<LookupChoice["kind"], string> = {
  article: "百科词条",
  form: "词形关系",
  spelling: "拼写候选",
  related: "相关词条",
};
export function LookupChoicesView({
  choices,
  providerName,
  onChoose,
}: {
  choices: LookupChoice[];
  providerName: string;
  onChoose: (choice: LookupChoice) => unknown;
}) {
  const { pop } = useNavigation();
  return (
    <List
      navigationTitle={`${providerName} · 选择词条`}
      searchBarPlaceholder="筛选候选词条…"
    >
      <List.EmptyView
        title="没有匹配的候选"
        description="可更改筛选文字，或返回重新输入查询。"
      />
      {choices.map((choice, index) => (
        <List.Item
          key={`${choice.target.language ?? ""}:${choice.target.query}`}
          title={choice.title}
          subtitle={choice.description}
          keywords={[choice.target.query, labels[choice.kind]]}
          icon={choice.kind === "spelling" ? Icon.MagnifyingGlass : Icon.Book}
          accessories={[{ text: labels[choice.kind] }]}
          actions={
            <ActionPanel>
              <Action
                title="在当前词典查看"
                onAction={() => {
                  onChoose(choice);
                  pop();
                }}
              />
              <Action.CopyToClipboard
                title="复制词条名称"
                content={choice.target.query}
              />
            </ActionPanel>
          }
          id={String(index)}
        />
      ))}
    </List>
  );
}
