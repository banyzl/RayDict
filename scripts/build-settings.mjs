import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, arch } from "node:os";
const app = "assets/RayDict Settings.app";
const extensionVersion = JSON.parse(
  readFileSync("package.json", "utf8"),
).version;
const bin = join(app, "Contents/MacOS/RayDictSettings");
const sources = [
  "native-settings/App.swift",
  "native-settings/Model.swift",
  "native-settings/Editors.swift",
  "native-settings/Selection.swift",
];
mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
mkdirSync(join(app, "Contents/Resources"), { recursive: true });
writeFileSync(
  join(app, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>RayDictSettings</string><key>CFBundleIdentifier</key><string>dev.raydict.settings</string><key>CFBundleName</key><string>RayDict Settings</string><key>CFBundleDisplayName</key><string>RayDict 设置</string><key>CFBundleVersion</key><string>4</string><key>CFBundleShortVersionString</key><string>${extensionVersion}</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
let needsBuild = true;
try {
  needsBuild = sources.some(
    (path) => statSync(path).mtimeMs > statSync(bin).mtimeMs,
  );
} catch {
  /* first build */
}
if (needsBuild) {
  const target = `${arch() === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`;
  const version = spawnSync("xcrun", ["swiftc", "--version"], {
    encoding: "utf8",
  }).stdout.match(/Swift version (\d+)\.(\d+)/);
  const sdkRoot = "/Library/Developer/CommandLineTools/SDKs";
  let sdk = process.env.RAYDICT_MACOS_SDK;
  if (!sdk) {
    const candidates = (existsSync(sdkRoot) ? readdirSync(sdkRoot) : [])
      .filter((name) => /^MacOSX\d+\.\d+\.sdk$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    sdk =
      candidates
        .map((name) => join(sdkRoot, name))
        .find((path) => {
          try {
            const built = readFileSync(
              join(
                path,
                "usr/lib/swift/Swift.swiftmodule/arm64e-apple-macos.swiftinterface",
              ),
              "utf8",
            ).match(/Swift version (\d+)\.(\d+)/);
            const compatibleVersion =
              version &&
              built &&
              (Number(built[1]) < Number(version[1]) ||
                (built[1] === version[1] &&
                  Number(built[2]) <= Number(version[2])));
            if (!compatibleVersion) return false;
            // Some SDKs require SwiftUI macro plug-ins absent from Command Line Tools.
            // Check the actual @State support rather than relying on Swift's version alone.
            return (
              spawnSync(
                "xcrun",
                [
                  "swiftc",
                  "-typecheck",
                  "-swift-version",
                  "5",
                  "-sdk",
                  path,
                  "-target",
                  target,
                  "-module-cache-path",
                  join(tmpdir(), "raydict-swift-cache"),
                  "-",
                ],
                {
                  input:
                    'import SwiftUI\nstruct RayDictProbe: View { @State private var value = false; var body: some View { Text("probe") } }\n',
                  encoding: "utf8",
                },
              ).status === 0
            );
          } catch {
            return false;
          }
        }) ??
      spawnSync("xcrun", ["--show-sdk-path"], {
        encoding: "utf8",
      }).stdout.trim();
  }
  const result = spawnSync(
    "xcrun",
    [
      "swiftc",
      "-swift-version",
      "5",
      "-O",
      "-parse-as-library",
      "-sdk",
      sdk,
      "-target",
      target,
      "-module-cache-path",
      join(tmpdir(), "raydict-swift-cache"),
      ...sources,
      "-o",
      bin,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const signed = spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", app], {
  stdio: "inherit",
});
if (signed.status !== 0) process.exit(signed.status ?? 1);
console.log(`Native settings ready (${arch()})`);
