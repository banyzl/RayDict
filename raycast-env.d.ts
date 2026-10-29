/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** 本地历史 - 在本机保存查询和手动添加的上下文，可在历史命令中清空。 */
  "recordHistory": boolean,
  /** DeepL API Key - 可选。仅在手动运行 DeepL 时使用；:fx 密钥使用 Free 端点。 */
  "deeplKey"?: string,
  /** 自定义 API 密钥 1 - 由自定义 Provider 的 token slot 1 引用。 */
  "apiToken1"?: string,
  /** 自定义 API 密钥 2 - 由自定义 Provider 的 token slot 2 引用。 */
  "apiToken2"?: string,
  /** 自定义 API 密钥 3 - 由自定义 Provider 的 token slot 3 引用。 */
  "apiToken3"?: string,
  /** AnkiConnect 地址 - 仅支持本机回环地址。需要安装 AnkiConnect 并运行 Anki。 */
  "ankiEndpoint": string,
  /** AnkiConnect API Key - 可选，与 AnkiConnect 配置中的 apiKey 一致。 */
  "ankiKey"?: string,
  /** Anki 牌组 - 使用已存在的牌组。 */
  "ankiDeck": string,
  /** Anki 笔记类型 - 必须包含下列正面和背面字段。 */
  "ankiModel": string,
  /** Anki 正面字段 - 笔记类型中的准确字段名。 */
  "ankiFront": string,
  /** Anki 背面字段 - 笔记类型中的准确字段名。 */
  "ankiBack": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search` command */
  export type Search = ExtensionPreferences & {}
  /** Preferences accessible in the `lookup-selected` command */
  export type LookupSelected = ExtensionPreferences & {}
  /** Preferences accessible in the `lookup-copy` command */
  export type LookupCopy = ExtensionPreferences & {}
  /** Preferences accessible in the `lookup-clipboard` command */
  export type LookupClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-providers` command */
  export type ManageProviders = ExtensionPreferences & {}
  /** Preferences accessible in the `notebook` command */
  export type Notebook = ExtensionPreferences & {}
  /** Preferences accessible in the `history` command */
  export type History = ExtensionPreferences & {}
  /** Preferences accessible in the `settings` command */
  export type Settings = ExtensionPreferences & {}
  /** Preferences accessible in the `api-settings` command */
  export type ApiSettings = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search` command */
  export type Search = {
  /** 单词或句子（可留空） */
  "query": string
}
  /** Arguments passed to the `lookup-selected` command */
  export type LookupSelected = {}
  /** Arguments passed to the `lookup-copy` command */
  export type LookupCopy = {}
  /** Arguments passed to the `lookup-clipboard` command */
  export type LookupClipboard = {}
  /** Arguments passed to the `manage-providers` command */
  export type ManageProviders = {}
  /** Arguments passed to the `notebook` command */
  export type Notebook = {}
  /** Arguments passed to the `history` command */
  export type History = {}
  /** Arguments passed to the `settings` command */
  export type Settings = {}
  /** Arguments passed to the `api-settings` command */
  export type ApiSettings = {}
}

