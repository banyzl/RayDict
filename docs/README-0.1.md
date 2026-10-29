# RayDict v0.1 使用说明（历史记录）

> 历史记录：以下为对应版本在验证机上的调查与验证；当前源码安装步骤见[项目首页](../README.md)。


当前版本与入口见 [v0.2 使用说明](../README.md)。下文保留最初 MVP 的说明。

以 Saladict 的多词典、情景模式和语境学习工作流为设计参考，重新实现的独立 Raycast 扩展。所有查询、内容展示和管理界面都在 Raycast 内完成，不需要安装或打开浏览器。

## 立即使用

本项目已经在当前 Mac 的 Raycast 中加载。搜索 **RayDict** 可看到 5 个命令：

| 命令 | 用途 |
| --- | --- |
| 查词 / Search | 输入单词、短语或句子，左右双栏查词 |
| 查询选中文字 | 读取当前应用选区，直接进入相同查询界面 |
| 管理词典与情景模式 | 添加、导入、配置、排序、启停或删除词典 |
| 生词本 | 阅读结果快照、编辑笔记、导出、发送 Anki |
| 查词历史 | 重新查询、导出和删除本地历史 |

在 Raycast Settings → Extensions → RayDict，为「查询选中文字」绑定你喜欢的全局快捷键，例如 ⌥D。快捷键由用户在 Raycast 内指定，插件不会抢占现有热键。系统选词需要 Raycast 的辅助功能权限，而且取决于原应用是否支持文本选区。

可以先搜索 `abstraction`、`implicitly` 或 `polymorphism`，无需密钥即可看到英文词典与本地计算机解释。左侧 ↑↓ 切换结果，右侧显示完整词条；某个服务失败不会阻止其他词典返回。

常用操作：

- `⌘P` 切换情景模式；`⌘M` 管理词典。
- `⌘S` 保存当前已经返回的所有结果及上下文。
- `⌘⇧E` 补充上下文、来源应用和原文链接。
- 选中手动 Provider 后按回车查询。`⌘K` 展示更多操作。
- 在生词本内通过「发送到 Anki」制卡，或复制 Markdown / JSON 导出。

## 从源码运行

需要 macOS、Raycast、Node.js 22.22.2 或更高版本和 npm。无需另外启动 Web 服务。

```sh
npm ci
npm run dev
```

`npm run dev` 会编译并注册开发扩展。保持终端运行可以自动加载修改。已有依赖时可以直接运行此命令。`npm run build` 生成 `dist/`，通过 Raycast 的 Import Extension 导入本项目目录可以重新安装。不要把 `dist` 当成独立 macOS 应用。

```sh
npm run check    # 类型检查、14 项测试、代码检查、生产构建
npm run smoke    # 用公开词 abstraction 验证在线词典和翻译 API
```

测试中的模拟词典和 Anki 服务只监听本机随机端口，不操作真实 Anki 收藏。

## 第一版已实现

| 功能 | v0.1 状态 |
| --- | --- |
| 原生左侧 Provider 结果 + 右侧完整内容 | 已实现并在 Raycast 中验证 |
| 多 Provider 并行查询 | 独立加载、失败隔离、取消旧查询、超时、400 ms 防抖 |
| 单词 / 句子、音标、词性、释义、例句 | 按数据源提供的字段显示 |
| 发音 | 词典音频下载后用系统播放器播放；另有 macOS 系统朗读 |
| 用户添加词典 | REST GET / POST JSON 表单、数据路径映射、JSON 导入 |
| 词典启停 / 删除 / 排序 / 配置 | 已实现；排序和组合按 Profile 保存 |
| 日常、计算机、翻译情景模式 | 可新建、编辑、删除，配置语言和 AI 提示要求 |
| 历史 | 最近 300 条成功查询，默认开启，可在扩展设置关闭 |
| 生词本 | 结果快照、上下文、来源、笔记、Markdown / JSON 导出 |
| AnkiConnect | 本机 version 6 兼容协议、可配置牌组/模型/字段/API Key |
| 翻译 / AI | MyMemory、DeepL、Raycast AI；默认手动触发 |
| 后续同步 | 已规划；当前未实现远程同步 |

## 内置 Provider 与数据边界

| Provider | 配置 | 内容与限制 |
| --- | --- | --- |
| Free Dictionary API | 无需密钥，默认自动 | 英英词典；音标、例句和音频依具体词条而定。保留响应中的词条/音频来源与许可 |
| 本地计算机术语 | 无需联网，默认自动 | **20 个原创词条的示范库**，不是完整英汉词典 |
| MyMemory | 无需密钥，默认手动 | 英译中等翻译；源/目标语言跟随 Profile，单次最多 500 UTF-8 字节，匿名额度见官方限制 |
| DeepL | 扩展设置中的 DeepL Key | `:fx` 密钥使用 Free 端点，其余使用 Pro；账户自行承担 API 费用和额度 |
| Raycast AI | Raycast AI API 使用权限 | 按 Profile 解释或翻译，内容标为 AI 生成；并不要求额外 OpenAI Key |

普通网页链接返回的是 HTML，无法只填一个链接就显示完整原生词条。第一版的无代码接入明确面向 JSON API。复杂网页解析、签名、分页、登录、特殊协议需要编写 Provider，并核实数据使用权。Cambridge、Oxford、Bing 等没有被假装实现，也没有把网页嵌入结果区。

“不依赖浏览器”不代表所有词典都能离线工作。在线 API、翻译和 AI 仍需网络。系统选词不能可靠取得周围整句或原文 URL，因此第一版自动保存选中文本和来源应用，整句及 URL 由用户补充。全文翻译和鼠标旁 DOM 浮窗不在本项目范围内。

## 添加自己的词典

在管理界面按 `⌘N`，填写服务 URL 和结果路径。例如响应：

```json
{"data":{"entries":[{"word":"abstraction","meaning":"抽象","ipa":"/…/","examples":["An abstraction hides details."]}]}}
```

可填写：词条数组 `data.entries`，释义 `meaning`，单词 `word`，音标 `ipa`，例句 `examples[]`。URL 中的 `{word}` 会自动编码。POST 请求体中的占位符在解析后的 JSON 中替换，能正确处理引号和换行。

请求密钥请放进扩展设置的「自定义 API 密钥 1–3」密码字段，选择对应槽位，并使用请求头 `{"Authorization":"Bearer {token}"}`。导出的配置只保存槽位引用。不要把真实密钥写入配置正文。

详见 [Provider 开发说明](PROVIDERS.md) 和 [JSON 配置示例](../examples/custom-json-provider.json)。

## Anki 设置

安装并启用 [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect)，打开 Anki，然后在 RayDict 扩展设置中填写已经存在的牌组、笔记类型和两个字段名。默认值是 `Default`、`Basic`、`Front`、`Back`；中文 Anki 或自建笔记类型的名称可能不同。插件会先验证模型字段和牌组，再创建卡片，默认拒绝重复。

正面包含单词和上下文，背面包含已保存释义、例句、笔记和出处。v0.1 不自动下载音频到 Anki，也不做 Cloze、媒体同步或批量同步。当前官方仍支持根端点的 version 6 协议；后续可迁移其新的 API v1。真实 Anki、DeepL 密钥和 AI 账户调用需要在用户配置后验证。

## 本地数据

词典配置使用 Raycast LocalStorage；密码通过 Raycast 的密码偏好设置读取。生词本和历史是扩展 supportPath 内的 `notebook-v1/`、`history-v1/` JSON 文件，每条记录单独原子写入，目录权限 700、文件权限 600。这些记录文件未额外加密。内存结果缓存最多 100 项、有效期 5 分钟，不写磁盘。

默认自动查询会把查询文字发给启用的远程词典。上下文仅传给支持它的 Provider（DeepL、AI 和配置了 `{context}` 的自定义 API）。翻译和 AI 默认手动触发。关闭历史后不再新建历史，已有记录可从历史界面清空。保存和导出会包含当时 API 返回的出处与许可。

## 设计与后续

- [技术可行性、Saladict 调研与授权边界](RESEARCH.md)
- [架构、数据流和迭代路线](ARCHITECTURE.md)
- [Provider 接口与无代码映射](PROVIDERS.md)
- [验证记录](VALIDATION.md)

RayDict 是独立项目，与 Saladict 官方没有隶属或授权关系。实现参考其产品理念，没有复制其代码、词典数据或品牌资产。项目代码采用 MIT；第三方词典与音频内容保留各自许可证。
