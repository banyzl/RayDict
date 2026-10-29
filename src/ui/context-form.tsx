import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { QueryInput } from "../core/schema";

export function ContextForm({
  input,
  onSave,
}: {
  input: QueryInput;
  onSave: (input: QueryInput) => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="补充阅读上下文"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="应用上下文"
            onSubmit={(values: {
              context: string;
              sourceApp: string;
              sourceUrl: string;
            }) => {
              onSave({ ...input, ...values });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="系统只能可靠地提供选中的文字。可在这里补充整句、来源应用和原文链接；上下文也会传给支持它的 Provider。" />
      <Form.TextArea
        id="context"
        title="上下文"
        defaultValue={input.context ?? ""}
      />
      <Form.TextField
        id="sourceApp"
        title="来源"
        defaultValue={input.sourceApp ?? ""}
      />
      <Form.TextField
        id="sourceUrl"
        title="原文链接"
        defaultValue={input.sourceUrl ?? ""}
      />
    </Form>
  );
}
