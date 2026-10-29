import { openNativeSettings } from "./core/native-settings";
import { perform } from "./ui/shared";
export default async function Command() {
  await perform("无法打开设置窗口", openNativeSettings);
}
