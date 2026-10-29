import {
  closeMainWindow,
  environment,
  getFrontmostApplication,
  launchCommand,
  LaunchProps,
  LaunchType,
} from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { acquiredText } from "./core/acquired-text";

type Source = { sourceBundle?: string; sourceApp?: string };
export default async function Command(
  props: LaunchProps<{ launchContext: Source }>,
) {
  let source = props.launchContext ?? {};
  try {
    if (!source.sourceBundle) {
      const app = await getFrontmostApplication();
      source = { sourceBundle: app.bundleId, sourceApp: app.name };
    }
    if (!source.sourceBundle || source.sourceBundle.startsWith("com.raycast."))
      throw new Error("请回到微信选中文字，再运行兼容取词。");
    await closeMainWindow();
    const executable = join(
      environment.assetsPath,
      "RayDict Settings.app/Contents/MacOS/RayDictSettings",
    );
    const { stdout } = await promisify(execFile)(
      executable,
      ["--capture-selection", "--bundle", source.sourceBundle],
      { timeout: 7000, maxBuffer: 100_000 },
    );
    const capture: unknown = JSON.parse(stdout);
    if (!capture || typeof capture !== "object")
      throw new Error("取词没有返回内容");
    const data = capture as { text?: unknown; error?: unknown };
    if (typeof data.error === "string") throw new Error(data.error);
    await launchCommand({
      name: "lookup-clipboard",
      type: LaunchType.UserInitiated,
      context: {
        capturedText: acquiredText(data.text),
        sourceApp: source.sourceApp,
      },
    });
  } catch (error) {
    await launchCommand({
      name: "lookup-selected",
      type: LaunchType.UserInitiated,
      context: {
        ...source,
        failure:
          error instanceof Error
            ? error.message
            : "兼容取词失败，请先手动复制。",
      },
    });
  }
}
