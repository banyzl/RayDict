# RayDict 长期本地使用说明

> 历史记录：以下为对应版本在验证机上的调查与验证；当前源码安装步骤见[项目首页](../README.md)。


验证日期：2026-10-26。Raycast 2.9.0.0 / API 2.9.0 / macOS Apple Silicon。

## 已完成的处理

本机已通过 Raycast 官方「Manage Extensions → RayDict → Actions → Stop Development」结束后台开发监听。实测空白主界面不再显示 Development 分组；搜索 RayDict 时，7 个命令列在 Results 中。扩展保留在 Raycast 中，终端关闭后可继续使用。

停止开发监听不会卸载已经导入的扩展。[官方入门文档](https://developers.raycast.com/basics/create-your-first-extension)明确说明，停止 `npm run dev` 后扩展仍然可用；[CLI 文档](https://developers.raycast.com/information/developer-tools/cli)说明开发模式会把扩展放在根搜索顶部。本机操作已验证停止监听即可移除这个正在开发的分组。

## 项目检查结果

- `package.json` 中的扩展标识为 `raydict-native`，显示名称为 RayDict，版本为 0.2.1。
- 7 个命令：查词、查询选中文字、词典设置窗口、管理词典与情景模式、生词本、查词历史、API 密钥设置。
- `src/` 包含 Raycast 原生界面、词典来源、共享设置、生词本及历史；`native-settings/` 是独立 SwiftUI 设置窗口；`assets/` 内含该窗口程序及词典目录。
- 原 `dev` 脚本构建设置窗口后执行 `ray develop`，会持续监听并启用 Development 分组。
- 原 `build` 使用 `ray build -e dist -o dist`，只生成构建文件，不更新本机已加载的扩展。
- 依赖为固定的 Raycast API 2.9.0，保留已有锁文件，没有升级依赖。

## 以后怎么使用和更新

日常直接在 Raycast 使用，**无需启动开发命令，无需常驻终端**。

已在原项目新增并实际执行：

```sh
npm run install:local
```

此命令先构建独立设置窗口，再执行官方 `ray build -e dist`。关键是省略 `-o`：当前 CLI 会将构建写入默认本地扩展目录，并通知 Raycast 刷新；完成后退出，不创建开发监听。它使用优化构建，但不会改变扩展的本地身份。

本机原项目位置：

```text
/path/to/RayDict
```

今后修改源码或取得新版后，在同一项目文件夹执行：

```sh
npm run update:local
```

`update:local` 是 `install:local` 的别名，只更新当前源码，不下载远程版本。新版若更新了依赖锁文件，先执行 `npm ci`。

在另一台 Mac 安装源码包：解压，先在 Raycast 的 **Import Extension** 选择 `raydict` 文件夹，再在该文件夹执行 `npm ci` 和 `npm run install:local`。需要 Node.js 22.22.2+；包内设置程序为 arm64，Intel Mac 需要 Apple Command Line Tools 重新编译。

只有开发时才运行 `npm run dev`。开发完成后，在启动它的终端按 `Ctrl+C`，或通过 **Manage Extensions → RayDict → Actions → Stop Development** 停止。若监听已在后台运行，先停止再安装优化构建，防止监听再次覆盖文件。

## 本地使用与正式发布的边界

| 方式 | 是否需要常驻开发进程 | 更新方式 | 当前结论 |
| --- | --- | --- | --- |
| 导入源码、一次性构建并停止开发 | 否 | 获得新源码后执行本地更新命令 | 本机已实施并验证；Development 根搜索分组消失 |
| `ray build -e dist -o dist` | 否 | 只输出文件，不更新已加载扩展 | 保留用于校验和构建 |
| `ray bundle` 生成 `.rayext` | 否 | 仅能确认是扩展构建归档 | 不能把打包成功等同于当前客户端支持正式本地安装 |
| 公共 Raycast Store | 否 | 商店分发 | 需要官方发布与审核流程 |
| 组织私有商店 | 否 | 组织商店分发 | 需要真实组织与相应发布权限 |

[官方 CLI 文档](https://developers.raycast.com/information/developer-tools/cli)已经提供 `ray bundle`，生成 `.rayext` 归档。但本机 Raycast 的文件关联仅声明 `.rayconfig`，[官方安装指南](https://developers.raycast.com/basics/install-an-extension)说明的是 Store 安装流程。本次未发现、也未验证能将未发布扩展作为 Store 同等身份安装的官方本地入口。因此不把 `.rayext` 冒充可双击安装的正式扩展，也没有向商店发布。

停止开发后，Raycast 仍知道这是导入的本地扩展，部分位置可能保留本地或开发身份图标；这与已经移除的 Development 根搜索分组不同。不能承诺消除所有内部身份标记。需要完整商店身份时，使用[公共发布](https://developers.raycast.com/basics/publish-an-extension)或[组织私有发布](https://developers.raycast.com/teams/publish-a-private-extension)。其中 `private: true` 是 npm 包字段；Raycast 私有发布需要 `owner` 等组织配置，不能靠改这个布尔值实现。

## 数据、设置和自动更新

扩展名称、作者、7 个命令标识、全部偏好字段及依赖保持原样，仅增加本地安装/更新脚本并修改说明。没有重命名扩展、卸载再安装、修改 Raycast 数据库或伪造 Store 身份，也没有改动 Raycast 的自动更新设置。

本地源码扩展原本没有 Store 远程自动更新；本次没有移除任何既有自动更新器。Raycast 本身和其他 Store 扩展继续沿用各自的更新机制。若未来迁移到商店，应另行验证商店分配的扩展身份、偏好与数据路径，不能假定当前数据会自动迁移。

安装前后对已有 7 个数据文件计算校验值，全部一致，包括共享词典配置、生词本和历史目录中的已有文件；未导出文件正文或 API 密钥。查词验证可能正常更新查询历史，这不属于安装脚本的数据迁移。

## 验证记录

- 从官方界面停止开发后，RayDict 后台 `ray develop`、日志监听及其构建子进程退出。
- 主界面 Development 分组消失；搜索可见全部 7 个原命令。
- 22/22 项既有测试通过；TypeScript、ESLint、格式检查通过。
- 7 个命令入口优化构建成功，独立设置程序构建成功。
- 原生设置自检：载入、启停、排序、自定义词典、情景管理、写入冲突、密钥模板限制及扩展 schema 兼容性通过。
- `npm run install:local` 实际成功退出；已安装清单与源码清单一致，没有开发进程 PID 文件。
- 停止监听后，`abstraction` 查询返回有道、剑桥、维基百科及本地术语结果。
- 安装优化构建后，从 Raycast 成功打开独立设置窗口，原词典组合与情景可见。
- 安装前后已有数据文件校验值一致。

未在本次重新验证真实 DeepL 密钥、AI 权限、Anki 牌组、所有宿主应用的选区及系统重启；这些功能的实现和配置入口未作修改。
