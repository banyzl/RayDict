import { LaunchProps } from "@raycast/api";
import { SearchView } from "./ui/search";
export default function Command({
  arguments: args,
  launchContext,
}: LaunchProps<{
  arguments: { query?: string };
  launchContext: { text?: string; sourceApp?: string };
}>) {
  return (
    <SearchView
      initial={{
        text: launchContext?.text ?? args.query ?? "",
        sourceApp: launchContext?.sourceApp,
      }}
    />
  );
}
