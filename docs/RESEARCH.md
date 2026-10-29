# v0.1 可行性与数据源调研（历史记录）

> 历史记录：以下为对应版本在验证机上的调查与验证；当前源码安装步骤见[项目首页](../README.md)。


v0.2 已新增有道、剑桥、汉典、维基百科与独立原生设置窗口。更新结论见 [UPDATE-0.2.md](UPDATE-0.2.md)，下文保留最初 MVP 调研。

核查日期：2026-10-26。以官方文档和原始开源仓库为依据；早前会话中的设想不作为已经实现的事实。

## 技术结论

Raycast 的 React / TypeScript / Node 扩展运行时可以直接调用 HTTP 服务。`List` 的 `isShowingDetail` 与 `List.Item.Detail` 能表达左侧结果、右侧完整内容；`filtering={false}` 保证查询文字不会把 Provider 名称过滤掉；搜索回调、加载状态和下拉菜单可组成查词与情景模式界面。宽度、字体、底部操作栏由 Raycast 管理，不能像网页一样自由指定 CSS 布局。[Raycast List API](https://developers.raycast.com/api-reference/user-interface/list)

系统选词使用官方 `getSelectedText()`，来源应用用 `getFrontmostApplication()`。接口的职责不包含周围段落、光标所在整句、文档标题或原文 URL。当前选区支持情况和权限取决于宿主应用，因此不能承诺“所有 App 自动抓取完整上下文”。前者也已核对安装的 `@raycast/api@2.9.0` 类型定义；后者见 [System Utilities](https://developers.raycast.com/api-reference/utilities)。截图在缓存会话里没有可读图像，因此实现依据用户明确描述的左右双栏结构，再以本机真实运行结果验证。

词典配置和密码可分别使用 LocalStorage 与 password preferences。官方说明 LocalStorage 是共享于同一扩展命令的加密存储，不适合大量内容；因此本项目把较大的生词快照放到 supportPath 文件，未宣称文件本身加密。[Storage](https://developers.raycast.com/api-reference/storage)、[Preferences](https://developers.raycast.com/api-reference/preferences)

## Saladict 的可借鉴部分

官方列出的产品能力包括多词典同时查询、按情景/语言/长度组合词典、生词本与历史、上下文和翻译、发音、WebDAV、Anki，以及论文/翻译/句库情景模式。本项目保留聚合和学习工作流，改用系统选词与原生键盘交互。[Saladict 官方介绍](https://saladict.crimx.com/)、[使用手册](https://saladict.crimx.com/manual)

检查了 `crimx/ext-saladict` 当前默认分支 `dev` 的词典层。`helpers.ts` 定义统一搜索签名及发音等结果信息，具体词典自行解析；Cambridge 引擎则取得带凭据的网页并处理人工验证情况。由此可以推断：可以借鉴 Adapter 分层，但浏览器 Cookie、DOM 与验证流程不能直接当作可靠的 Node API 移植。[统一接口源码](https://github.com/crimx/ext-saladict/blob/dev/src/components/dictionaries/helpers.ts)、[Cambridge 引擎](https://github.com/crimx/ext-saladict/blob/dev/src/components/dictionaries/cambridge/engine.ts)

原版可以管理已有词典；普通自定义链接与真正新增解析器是不同能力。本项目额外提供结构简单的 JSON API 字段映射；复杂响应仍需要专门 Provider。[Saladict 常见问题](https://saladict.crimx.com/q%26a)

## 许可证与品牌

Saladict 源码的 MIT 许可允许复制、修改和分发代码，但要求保留版权与许可声明。其名称、Logo、图标等品牌资产不随 MIT 许可授出。本项目使用独立名称和自有图标，未复制 Saladict 实现代码；若今后直接移植某个文件，必须加入该部分的原始声明。[LICENSE](https://github.com/crimx/ext-saladict/blob/dev/LICENSE)、[项目授权和品牌说明](https://github.com/crimx/ext-saladict#license-and-brand)

开源客户端许可不等于第三方词典的内容授权。对商业词典、网页抓取、音频、离线打包和同步，需要分别核实提供方条款。第一版不打包商业词典数据，不依赖绕过登录、验证码或浏览器会话。本文记录工程决策，不推断未取得的商业授权。

## 第一版数据源选择

| 来源 | 已确认内容 | 实现决策 |
| --- | --- | --- |
| Free Dictionary API | 官方公开英文查询端点；响应提供音标、词性、释义、例句、音频等字段 | 默认接入；真实响应中的出处与词条/音频许可证保留到 UI、收藏和导出 |
| 本地术语库 | 本项目原创 20 条计算机笔记 | 提供中文技术语境和离线示例，不宣传为完整词典 |
| MyMemory | 官方 GET 查询接口、源/目标语言；每次 500 UTF-8 字节；匿名 5000 字符/日 | 手动触发并检查服务状态，不将用户收藏上传至其贡献接口 |
| DeepL | 官方 POST `/v2/translate`，密钥认证，Free 与 Pro 端点 | 用户配置 Key 后手动调用；不使用网站内部接口 |
| Raycast AI | `AI.ask`，支持取消信号；账户可能没有 API 使用权限 | 调用前检查权限，默认手动，结果标为 AI 生成 |
| Cambridge 等商业/网页词典 | 已观察原引擎依赖网页解析与验证；未建立本项目的可靠授权接入 | 留给后续经授权的 Provider，不作为内置已完成功能 |

来源：[Free Dictionary API](https://dictionaryapi.dev/)、[MyMemory 接口](https://mymemory.translated.net/doc/spec.php)、[MyMemory 额度](https://mymemory.translated.net/doc/usagelimits.php)、[DeepL 翻译请求](https://developers.deepl.com/api-reference/translate/request-translation)、[Raycast AI](https://developers.raycast.com/api-reference/ai)。

Free Dictionary API 的免费服务描述不应被理解为所有底层内容均属 MIT；实现根据实际响应保留 `license`、`sourceUrls` 以及音频的独立 `license/sourceUrl`。没有来源元数据时，仍保留服务出处，不自行补造许可证。

## AnkiConnect

已读取当前官方仓库的 README 和 API_LEGACY：官方新增 API v1，并继续支持根端点 version 6。MVP 选择 version 6 以兼容已有 AnkiConnect 安装；只使用 `modelFieldNames`、`deckNames`、`addNote`，允许配置 API Key，字段不匹配时停止制卡，默认拒绝重复。后续可在独立 Anki Adapter 中切换协议。[官方 README](https://git.sr.ht/~foosoft/anki-connect/blob/master/README.md)、[兼容 API 文档](https://git.sr.ht/~foosoft/anki-connect/blob/master/API_LEGACY.md)

## 已知边界

原生界面是 Raycast 的 Markdown 和组件，不承载网页 DOM。纯 URL 搜索可以作为额外操作，但不等同于原生内容 Provider。MVP 不注入浏览器，不做网页浮窗、全文翻译、OCR 或悬浮自动取词。音频播放暂不支持 AB 循环、变速或自动口音偏好；跨设备同步也未实现。
