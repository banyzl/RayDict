import SwiftUI
import AppKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) { NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
@main struct RayDictSettingsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model: SettingsModel
    init() {
        let args = CommandLine.arguments
        func argument(_ key: String) -> String? { guard let index = args.firstIndex(of: key), args.indices.contains(index + 1) else { return nil }; return args[index + 1] }
        if args.contains("--capture-selection") { SelectionCapture.run(bundle: argument("--bundle") ?? "") }
        if args.contains("--selection-self-test") { SelectionCapture.selfTest() }
        if args.contains("--self-test") {
            guard let config = argument("--config"), let catalog = argument("--catalog") else { exit(2) }
            let model = SettingsModel(configPath: config, catalogPath: catalog)
            func check(_ condition: Bool, _ name: String) { if !condition { print("FAILED: \(name): \(model.error)"); exit(1) }; print("OK: \(name)") }
            check(model.error.isEmpty, "load")
            let original = model.active?.providerIds ?? []
            model.setEnabled("zdic", false); check(!model.enabled("zdic"), "disable")
            model.setEnabled("zdic", true); check(model.enabled("zdic"), "enable")
            if let first = model.active?.providerIds.first { model.move("zdic", to: first); check(model.active?.providerIds.first == "zdic", "reorder") }
            let custom: [String: Any] = ["id":"native-selftest", "name":"Test API", "kind":"json", "endpoint":"https://example.com/{word}", "mapping":["entries":"", "definition":"meaning"]]
            check(model.saveProvider(custom, enable: true), "custom provider")
            model.removeProvider("native-selftest"); check(!model.providers.contains(where: { $0.id == "native-selftest" }), "remove provider")
            let profile: [String: Any] = ["id":"test-profile", "name":"测试情景", "providerIds":original, "sourceLanguage":"en", "targetLanguage":"zh-CN", "aiPrompt":"解释"]
            check(model.saveProfile(profile), "add profile")
            model.removeProfile("test-profile"); check(!model.profiles.contains(where: { $0.id == "test-profile" }), "remove profile")
            let competitor = SettingsModel(configPath: config, catalogPath: catalog)
            model.setEnabled("zdic", false)
            check(!competitor.commit(competitor.config) && competitor.error.contains("另一窗口"), "conflict rejected")
            var invalid = custom; invalid["endpoint"] = "https://example.com/?key={token}"
            var next = model.config; next["providers"] = model.providers.map(\.raw) + [invalid]
            do { try SettingsModel.validate(next); check(false, "unsafe token rejected") } catch { print("OK: unsafe token rejected") }
            exit(0)
        }
        let configPath = argument("--config") ?? UserDefaults.standard.string(forKey: "configPath") ?? "/nonexistent/raydict-settings.json"
        let catalogPath = argument("--catalog") ?? UserDefaults.standard.string(forKey: "catalogPath") ?? ""
        if argument("--config") != nil { UserDefaults.standard.set(configPath, forKey: "configPath"); UserDefaults.standard.set(catalogPath, forKey: "catalogPath") }
        _model = StateObject(wrappedValue: SettingsModel(configPath: configPath, catalogPath: catalogPath))
    }
    var body: some Scene {
        Window("RayDict 设置", id: "settings") { SettingsView(model: model).frame(minWidth: 1040, minHeight: 680) }
            .defaultSize(width: 1150, height: 760)
            .commands { CommandGroup(replacing: .newItem) {} }
    }
}

struct SettingsView: View {
    @ObservedObject var model: SettingsModel
    @State private var selected: String?
    @State private var search = ""
    @State private var showCatalog = false
    @State private var editing: ProviderItem?
    @State private var editingProfile: ProfileItem?
    var body: some View {
        HSplitView {
            sidebar.frame(minWidth: 190, idealWidth: 210, maxWidth: 260)
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) { Text(model.active?.name ?? "词典设置").font(.title2.bold()); Text("选择词典组合，在右侧调整查询顺序").foregroundStyle(.secondary) }
                    Spacer()
                    Button { showCatalog = true } label: { Label("添加词典", systemImage: "plus") }.buttonStyle(.borderedProminent)
                }.padding(22)
                Divider()
                HSplitView {
                    VStack(spacing: 0) {
                        TextField("搜索我的词典", text: $search).textFieldStyle(.roundedBorder).padding(12)
                        List(selection: $selected) {
                            Section("已启用 · \(model.active?.providerIds.count ?? 0)") { ForEach(filtered(true)) { provider in row(provider).tag(provider.id) }.onMove { offsets, destination in
                                guard search.isEmpty else { return }
                                var ids = model.active?.providerIds ?? []; ids.move(fromOffsets: offsets, toOffset: destination); model.setOrder(ids)
                            } }
                            Section("未启用") { ForEach(filtered(false)) { provider in row(provider).tag(provider.id) } }
                        }.listStyle(.inset)
                    }.frame(minWidth: 270, idealWidth: 320, maxWidth: 430)
                    detail.frame(minWidth: 380, maxWidth: .infinity, maxHeight: .infinity)
                }
                Divider()
                HStack { if model.error.isEmpty { Label(model.status, systemImage: "checkmark.circle").foregroundStyle(.secondary) } else { Label(model.error, systemImage: "exclamationmark.triangle").foregroundStyle(.red).textSelection(.enabled) }; Spacer() }.font(.caption).padding(12)
            }
        }
        .sheet(isPresented: $showCatalog) { CatalogView(model: model, onCustom: { showCatalog = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { editing = ProviderItem(raw: ["id": UUID().uuidString, "name": "我的词典", "kind": "json", "trigger": "auto", "scope": "any", "method": "GET", "tokenSlot": "none", "mapping": ["entries": "", "definition": "definition"]]) } }) }
        .sheet(item: $editing) { provider in ProviderEditor(model: model, provider: provider) }
        .sheet(item: $editingProfile) { profile in ProfileEditor(model: model, profile: profile) }
        .onAppear { selected = model.ordered.first?.id }
        .onChange(of: model.activeID) { _ in selected = model.ordered.first?.id }
    }
    var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack { Image(systemName: "books.vertical.fill").font(.title2).foregroundStyle(.teal); VStack(alignment: .leading) { Text("RayDict").font(.title3.bold()); Text("词典与阅读情景").font(.caption).foregroundStyle(.secondary) } }.padding(20)
            Text("情景模式").font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.horizontal, 20)
            List(selection: Binding<String?>(get: { model.activeID }, set: { if let value = $0 { model.activate(value) } })) {
                ForEach(model.profiles) { profile in Label(profile.name, systemImage: profile.id == "cs" ? "desktopcomputer" : profile.id == "translation" ? "character.bubble" : "book.closed").tag(profile.id) }
            }.listStyle(.sidebar)
            HStack { Button { editingProfile = ProfileItem(raw: ["id": UUID().uuidString, "name": "新的阅读情景", "providerIds": model.active?.providerIds ?? [], "sourceLanguage": "en", "targetLanguage": "zh-CN", "aiPrompt": "用中文解释词义，提供例句与常见搭配。"] ) } label: { Image(systemName: "plus") }.help("添加情景（沿用当前词典组合）"); Button("编辑情景") { editingProfile = model.active } }.padding(.horizontal, 16).padding(.bottom, 15)
            Divider()
            VStack(alignment: .leading, spacing: 12) {
                Button { model.exportConfig() } label: { Label("导出配置", systemImage: "square.and.arrow.up") }
                Button { model.importConfig() } label: { Label("导入配置", systemImage: "square.and.arrow.down") }
                Button { do { try model.reload() } catch { model.error = error.localizedDescription } } label: { Label("刷新设置", systemImage: "arrow.clockwise") }
                Button { openKeys() } label: { Label("API 密钥设置…", systemImage: "key") }
            }.buttonStyle(.plain).font(.callout).padding(20)
        }.frame(maxHeight: .infinity).background(.quaternary.opacity(0.35))
    }
    func filtered(_ enabled: Bool) -> [ProviderItem] { model.ordered.filter { model.enabled($0.id) == enabled && (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)) } }
    func row(_ provider: ProviderItem) -> some View {
        HStack(spacing: 10) {
            Toggle("启用 \(provider.name)", isOn: Binding(get: { model.enabled(provider.id) }, set: { model.setEnabled(provider.id, $0) })).labelsHidden().toggleStyle(.checkbox)
            Image(systemName: model.metadata(provider)["icon"] as? String ?? "network").foregroundStyle(.teal).frame(width: 22)
            VStack(alignment: .leading, spacing: 4) { Text(provider.name); Text(provider.raw["trigger"] as? String == "manual" ? "手动查询" : "自动查询").font(.caption).foregroundStyle(.secondary) }
            Spacer()
            if model.enabled(provider.id) { Image(systemName: "line.3.horizontal").font(.caption).foregroundStyle(.tertiary).help("调整查询顺序") }
        }.padding(.vertical, 6)
    }
    @ViewBuilder var detail: some View {
        if let provider = model.providers.first(where: { $0.id == selected }) {
            ScrollView { VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 14) { Image(systemName: model.metadata(provider)["icon"] as? String ?? "network").font(.largeTitle).foregroundStyle(.teal).frame(width: 58, height: 58).background(.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 14)); VStack(alignment: .leading, spacing: 6) { Text(provider.name).font(.title2.bold()); Text(model.metadata(provider)["category"] as? String ?? "自定义词典").foregroundStyle(.secondary) } }
                Text(model.metadata(provider)["description"] as? String ?? "使用你配置的 REST JSON 接口。支持地址模板、字段映射与请求头认证。").foregroundStyle(.secondary).lineSpacing(4)
                GroupBox {
                    VStack(alignment: .leading, spacing: 18) {
                        Toggle("在「\(model.active?.name ?? "当前情景")」中启用", isOn: Binding(get: { model.enabled(provider.id) }, set: { model.setEnabled(provider.id, $0) }))
                        Divider()
                        Picker("查询方式", selection: Binding(get: { provider.raw["trigger"] as? String ?? "auto" }, set: { value in var next = provider.raw; next["trigger"] = value; model.saveProvider(next) })) { Text("随输入自动查询").tag("auto"); Text("选中后按回车查询").tag("manual") }.pickerStyle(.menu)
                        if model.enabled(provider.id) {
                            Divider()
                            HStack {
                                Text("查询顺序"); Spacer()
                                Button { model.nudge(provider.id, by: -1) } label: { Label("上移", systemImage: "arrow.up") }.disabled(model.active?.providerIds.first == provider.id)
                                Button { model.nudge(provider.id, by: 1) } label: { Label("下移", systemImage: "arrow.down") }.disabled(model.active?.providerIds.last == provider.id)
                            }
                        }
                    }.padding(10)
                }
                HStack { Button("配置词典…") { editing = provider }; if let website = model.metadata(provider)["website"] as? String, let url = URL(string: website), !website.isEmpty { Link("查看来源", destination: url) } }
                if ["youdao", "cambridge"].contains(provider.kind) { Text("直接读取公开词条页，内容在 Raycast 原生界面显示。页面改版、限流或验证可能影响查询；网页结果仅在本次显示，收藏保留单词、笔记与来源链接。").font(.caption).foregroundStyle(.secondary).lineSpacing(4) }
                Divider()
                Text("配置对所有情景共享；启用状态和顺序仅属于当前情景。").font(.caption).foregroundStyle(.secondary)
                Button("删除此词典…", role: .destructive) { let alert = NSAlert(); alert.messageText = "删除「\(provider.name)」？"; alert.informativeText = "将从所有情景移除。内置词典可从目录重新添加。"; alert.addButton(withTitle: "删除"); alert.addButton(withTitle: "取消"); if alert.runModal() == .alertFirstButtonReturn { model.removeProvider(provider.id); selected = model.ordered.first?.id } }
            }.padding(26).frame(maxWidth: .infinity, alignment: .leading) }
        } else { VStack(spacing: 14) { Image(systemName: "books.vertical").font(.largeTitle).foregroundStyle(.secondary); Text("选择一个词典查看和修改设置"); Button("浏览词典目录") { showCatalog = true } }.frame(maxWidth: .infinity, maxHeight: .infinity) }
    }
}
func openKeys() { if let url = URL(string: "raycast://extensions/local-developer/raydict-native/api-settings") { NSWorkspace.shared.open(url) } }
