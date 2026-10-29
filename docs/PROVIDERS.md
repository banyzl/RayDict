# 添加与开发 Provider

> 历史记录：以下为对应版本在验证机上的调查与验证；当前源码安装步骤见[项目首页](../README.md)。


v0.2 的主要添加入口是「词典设置窗口 → 添加词典 → 添加自定义 API」。Raycast 内简易管理也继续保留。内置词典的目录配置位于 `core/catalog-data.json`，新增 Provider 还应在此登记名称、描述与默认选项。

## 无代码 REST JSON

管理词典 → 添加 REST API 词典。支持 GET、POST JSON，URL 占位符和结构化请求体、请求头、密钥槽位以及以下映射字段：

| 字段 | 例子 | 作用 |
| --- | --- | --- |
| 词条数组 | `data.entries`、`[0].items`、留空 | 定位一个对象或一组词条 |
| 释义 | `meaning`、`definitions[].text`、留空 | 必填映射；留空表示词条本身为字符串 |
| 单词 | `word` | 缺省使用查询文字 |
| 音标 | `phonetic` | 可选 |
| 词性 | `partOfSpeech` | 可选 |
| 例句 | `examples[]` | 字符串或字符串数组 |
| 音频 | `audio`、`phonetics[].audio` | HTTPS URL |

根响应是数组时，词条数组路径留空即可。`[]` 展开数组，`[0]` 选择数组元素。路径不支持过滤表达式、计算、脚本或原型访问。含点号的 JSON 字段名以及需要合并多个层级关系的复杂响应不属于第一版映射能力；编写专用 Provider 更合适。每个映射对象的词性和例句会用于该对象产生的全部释义，存在多词性时应将 entries 指到相应的词性对象。

变量：`{word}` 为查询，`{context}` 为用户提供的上下文，`{source}` / `{target}` 为 Profile 语言。URL 变量自动百分号编码，POST JSON 变量按解析后的数据结构替换，避免引号和换行破坏 JSON。`{token}` 只允许在请求头中使用，引用扩展设置中的密码槽位；当前支持三个通用密钥槽位。

自定义 API 需要 HTTPS；本机服务允许 `http://127.0.0.1`、`localhost` 或 `[::1]`。拒绝 URL 内用户名/密码、跨站重定向和超过 2 MB 的 JSON 响应。用户依然需要确认所填 API 的数据使用条款。输入与配置了占位符的上下文会发往该 API。

`examples/custom-json-provider.json` 展示完整配置，但地址是占位地址，需要换成实际服务。可以用「导入 Provider JSON」导入，再用表单编辑。Provider JSON 不是可执行插件，不包含代码。

## 编写复杂 Provider

1. 在 `src/providers/` 新建模块，实现 `DictionaryProvider.lookup`。
2. 在 `ProviderSchema.kind` 和 `registry.ts` 中登记新的 kind。
3. 在默认配置加入实例，或通过配置导入创建实例。
4. 使用录制的 JSON fixture 测试规范化，确保保留来源、许可证、发音和例句；运行 `npm run check`。

接口示意：

```ts
import type { DictionaryProvider } from "../core/schema";
import { requestJson } from "../core/http";

export const customProvider: DictionaryProvider = {
  async lookup({ input, signal, token, profile }) {
    // Use an authorized API and validate its response before normalization.
    const data = await requestJson(
      `https://your-api.example/lookup?q=${encodeURIComponent(input.text)}`,
      signal,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    // Validate and convert data into ProviderResult here.
    // Return null for no result; throw a useful Error for failure.
    void data;
    void profile;
    return null;
  },
};
```

该示意需要替换地址和解析逻辑，内置的 `dictionary-api.ts` 是可运行的完整例子。网络请求应传递取消信号，不依赖 DOM、window、浏览器 Cookie 或网页视图。不要在错误信息和日志中包含 token。不要把原始 HTML 直接塞入原生 Markdown。取得 HTML 数据是否允许使用、如何解析和归属出处，都属于该 Provider 的责任。

统一结果结构位于 `core/schema.ts`：

```ts
interface DictionaryProvider {
  lookup(context: ProviderContext): Promise<ProviderResult | null>;
}
```

ProviderResult 中的 `summary` 用于左侧预览，`entries` 用于完整词条，`translation` 用于翻译，`explanation/generated` 用于 AI 说明，`attributions` 用于可追溯来源。结果转换完毕后，查询界面、收藏、导出和 Anki 自动复用这一结构。

MVP 通过编译期注册支持复杂 Provider。添加 TypeScript 文件后需要重新构建，不支持把任意脚本拖进应用立即执行。未来可以增加受约束的配置分发和开发工具，但应保持密钥与分享配置隔离。
