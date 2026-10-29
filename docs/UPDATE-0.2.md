# v0.2：新增词典与独立图形设置

> 历史记录：以下为对应版本在验证机上的调查与验证；当前源码安装步骤见[项目首页](../README.md)。


日期：2026-10-26。

新增网易有道、剑桥英汉、汉典与维基百科四个 Provider，已用公开测试词真实查询。原有 Free Dictionary、本地计算机术语、MyMemory、DeepL 与 Raycast AI 保留。

管理界面增加独立 SwiftUI 应用：情景侧栏、可搜索词典列表、直接勾选启停、右侧配置、上移/下移、词典目录、自定义 API 表单及配置导入/导出。窗口由 Raycast「词典设置窗口」或查词时 `⌘M` 启动。原来的 Raycast 列表管理作为简易入口保留。

## 数据源的实际接入方式

| 来源 | 当前覆盖 | 已知边界 |
| --- | --- | --- |
| 有道 | 公开页面中的基础释义、音标、英美发音和双语例句 | 未完整覆盖其柯林斯、专业释义等所有板块；并非官方商业词典 API |
| 剑桥 | 英文/简体中文词条的释义、翻译、词性、例句与音频 | 网页结构、验证、限流或重定向可能导致查询失败；并非官方授权 API |
| 汉典 | 当前与旧版内容结构，拼音、基本/词语/详细解释 | 原典等扩展板块尚未逐项规范化；多字音频暂用系统朗读 |
| 维基百科 | MediaWiki API，准确标题查询与单条搜索回退，导言与来源 | 默认按查询文字选择中文/英文；同名词条可能是消歧义页 |

HTML 只作为解析输入，不嵌入网页，不执行脚本、获取浏览器凭据或绕过验证。结果统一为 ProviderResult，查询、展示与学习工作流继续复用已有架构。

官方有道词典 API 是需要申请的另一种服务，文档说明了接入与内容使用限制。本次没有把公开网页适配误称为该官方 API 的集成。[有道官方文档](https://ai.youdao.com/DOCSIRMA/html/dictionary/api/ydcd/index.html)

剑桥另有正式 API 与数据许可渠道。当前网页适配用于本机个人实验，不代表已取得公开发行所需的内容授权。有道和剑桥采用仅当前会话展示的保守策略，不进入缓存或收藏快照；收藏仍保留查询、上下文、笔记与来源。[剑桥接入说明](https://dictionary.cambridge.org/develop.html)、[网站条款](https://www.cambridge.org/pr/legal/website-terms-of-use)

汉典当前官方条款声明采用 CC0 1.0；实现保留词条和声明链接，没有沿用旧资料中的其他许可说法。[汉典条款](https://zdic.net/terms/)

百科使用公开 MediaWiki API，并保留文章和适用版权条款链接。[MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page)、[Wikipedia 版权](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)

## 原生设置与共享配置

| 文件/目录 | 职责 |
| --- | --- |
| `src/core/catalog-data.json` | 统一目录，生成默认配置和设置窗口目录 |
| `src/providers/web-dictionaries.ts` | 网页词典解析 |
| `src/providers/wikipedia.ts` | 百科 API |
| `src/core/catalog.ts` | 旧目录迁移 |
| `src/storage/config-file.ts` | 共享配置锁、修订比较、原子保存 |
| `src/core/native-settings.ts` | 启动设置应用并传入真实配置位置 |
| `native-settings/` | SwiftUI 窗口与配置模型 |
| `scripts/build-settings.mjs` | SDK 选择、编译和本机签名 |

配置位于 supportPath 的 `settings-v1.json`。外层保存递增 revision，内层使用 schemaVersion 1 和 catalogVersion 2。首次加载从旧 LocalStorage 迁移，原值保留。两边使用同一锁目录，检查修订/旧配置后原子替换；过期编辑会被拒绝。

Raycast 命令运行期间每秒检查配置，未变化时不重置查询。修改词典、语言或顺序后取消旧查询并使用新配置。真实 API 密钥仍交给 Raycast 密码偏好设置，共享文件只保存槽位引用。

新增来源在原来的日常/计算机情景中启用一次。后续启停、删除或排序不会被默认值恢复，翻译情景保持原组合。汉典仅对含汉字的查询启动；剑桥仅对英文查询启动。

## 验证与边界

22 项 Node 测试覆盖查询、解析、语言条件、迁移及并发配置。原生设置自检覆盖启停、顺序、自定义词典、情景、冲突和模板校验，输出通过扩展端配置校验。

真实窗口中已验证启动、目录、API 表单、无效输入拒绝、上移/下移持久保存。系统列表拖放已接入，但自动鼠标拖动未取得可靠验证，日常排序以明确的上移/下移按钮为已验证路径。

DeepL、AI 和真实 Anki 用户环境的验证边界沿用 v0.1。本次没有新增远程同步或完整离线词库。交付设置二进制为 Apple Silicon arm64；Intel Mac 需要本机构建。
