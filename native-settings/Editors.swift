import SwiftUI

struct CatalogView: View {
    @ObservedObject var model: SettingsModel
    let onCustom: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    var body: some View {
        VStack(spacing: 0) {
            HStack { VStack(alignment: .leading, spacing: 5) { Text("词典目录").font(.title2.bold()); Text("添加到「\(model.active?.name ?? "当前情景")」").foregroundStyle(.secondary) }; Spacer(); Button("完成") { dismiss() }.keyboardShortcut(.cancelAction) }.padding(22)
            TextField("搜索名称、语言或类别", text: $search).textFieldStyle(.roundedBorder).padding(.horizontal, 22).padding(.bottom, 15)
            Divider()
            ScrollView { LazyVStack(spacing: 12) {
                ForEach(model.catalog.indices.filter { index in search.isEmpty || String(describing: model.catalog[index]).localizedCaseInsensitiveContains(search) }, id: \.self) { index in
                    let item = model.catalog[index]; let provider = ProviderItem(raw: item["config"] as? [String: Any] ?? [:])
                    HStack(alignment: .top, spacing: 14) {
                        Image(systemName: item["icon"] as? String ?? "book").font(.title2).foregroundStyle(.teal).frame(width: 38, height: 38)
                        VStack(alignment: .leading, spacing: 6) { HStack { Text(provider.name).font(.headline); Text(item["access"] as? String ?? "").font(.caption).foregroundStyle(.secondary).padding(.horizontal, 7).padding(.vertical, 3).background(.quaternary, in: Capsule()) }; Text(item["description"] as? String ?? "").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                        Spacer()
                        Button(model.enabled(provider.id) ? "已启用" : "添加") { _ = model.saveProvider(model.providers.first { $0.id == provider.id }?.raw ?? provider.raw, enable: true) }.disabled(model.enabled(provider.id))
                    }.padding(16).background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
                }
            }.padding(22) }
            Divider()
            HStack { Button { onCustom() } label: { Label("添加自定义 API…", systemImage: "network") }; Spacer(); if !model.error.isEmpty { Text(model.error).font(.caption).foregroundStyle(.red) } }.padding(18)
        }.frame(width: 720, height: 630)
    }
}
struct ProviderEditor: View {
    @ObservedObject var model: SettingsModel
    let provider: ProviderItem
    @Environment(\.dismiss) private var dismiss
    @State private var draft: [String: Any]
    @State private var headers: String
    @State private var bodyJSON: String
    @State private var error = ""
    init(model: SettingsModel, provider: ProviderItem) {
        self.model = model; self.provider = provider
        _draft = State(initialValue: provider.raw)
        _headers = State(initialValue: Self.jsonString(provider.raw["headers"] ?? [:]))
        _bodyJSON = State(initialValue: Self.jsonString(provider.raw["body"] ?? [:]))
    }
    static func jsonString(_ value: Any) -> String { guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed]) else { return "{}" }; return String(data: data, encoding: .utf8) ?? "{}" }
    func field(_ key: String, _ fallback: String = "") -> Binding<String> { Binding(get: { draft[key] as? String ?? fallback }, set: { draft[key] = $0 }) }
    func mapping(_ key: String, _ fallback: String = "") -> Binding<String> { Binding(get: { (draft["mapping"] as? [String: String])?[key] ?? fallback }, set: { var values = draft["mapping"] as? [String: String] ?? [:]; values[key] = $0; draft["mapping"] = values }) }
    var body: some View {
        VStack(spacing: 0) {
            HStack { Text(provider.kind == "json" ? "配置自定义词典" : "配置词典").font(.title2.bold()); Spacer() }.padding(22)
            Divider()
            Form {
                Section("基本设置") {
                    TextField("显示名称", text: field("name"))
                    Picker("查询方式", selection: field("trigger", "auto")) { Text("随输入自动查询").tag("auto"); Text("按回车手动查询").tag("manual") }
                    Picker("输入类型", selection: field("scope", "any")) { Text("单词 / 短语").tag("word"); Text("单词与句子").tag("any") }
                    Picker("适用文字", selection: field("inputLanguage", "any")) { Text("不限").tag("any"); Text("英文").tag("latin"); Text("中文").tag("han") }
                    if ["cambridge", "wikipedia"].contains(provider.kind) {
                        Picker("内容语言", selection: field("language", "auto")) { Text(provider.kind == "cambridge" ? "英汉双语" : "跟随查询文字").tag("auto"); Text("英文").tag("en"); Text(provider.kind == "cambridge" ? "英汉双语" : "中文").tag("zh") }
                    }
                    HStack { Text("超时"); Spacer(); Stepper(value: Binding(get: { (draft["timeoutMs"] as? Int ?? 12000) / 1000 }, set: { draft["timeoutMs"] = $0 * 1000 }), in: 1...60) { Text("\((draft["timeoutMs"] as? Int ?? 12000) / 1000) 秒").monospacedDigit() } }
                }
                if provider.kind == "json" {
                    Section("API 与结果") {
                        TextField("API 地址", text: field("endpoint"), prompt: Text("https://api.example.com/search?q={word}"))
                        Picker("请求方式", selection: field("method", "GET")) { Text("GET").tag("GET"); Text("POST JSON").tag("POST") }
                        Text("支持 {word}、{source}、{target}、{context}，地址变量会自动编码。").font(.caption).foregroundStyle(.secondary)
                        TextField("词条数组路径", text: mapping("entries"), prompt: Text("data.entries；根数组留空"))
                        TextField("释义路径", text: mapping("definition", "definition"))
                        DisclosureGroup("音标、词性、例句和发音") { TextField("单词路径", text: mapping("headword")); TextField("音标路径", text: mapping("phonetic")); TextField("词性路径", text: mapping("partOfSpeech")); TextField("例句路径", text: mapping("example")); TextField("音频路径", text: mapping("audio")) }
                        Text("路径示例：meaning、examples[]、meanings[].definitions[].definition。留空表示当前值。").font(.caption).foregroundStyle(.secondary)
                    }
                    Section("认证与高级设置") {
                        Picker("API 密钥", selection: field("tokenSlot", "none")) { Text("不需要").tag("none"); ForEach(1...3, id: \.self) { index in Text("Raycast 密钥槽位 \(index)").tag(String(index)) } }
                        Text("真实密钥仍保存在 Raycast 密码设置中，通过请求头中的 {token} 引用。").font(.caption).foregroundStyle(.secondary)
                        Button("打开 API 密钥设置…") { openKeys() }
                        DisclosureGroup("请求头与请求体") {
                            Text("请求头 JSON").font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                            TextEditor(text: $headers).font(.system(.caption, design: .monospaced)).frame(height: 90).border(.quaternary)
                            if field("method", "GET").wrappedValue == "POST" { Text("POST JSON 请求体").font(.caption).frame(maxWidth: .infinity, alignment: .leading); TextEditor(text: $bodyJSON).font(.system(.caption, design: .monospaced)).frame(height: 100).border(.quaternary) }
                        }
                        TextField("来源名称", text: field("attribution")); TextField("来源链接", text: field("attributionUrl"))
                    }
                }
            }.formStyle(.grouped)
            Divider()
            if !error.isEmpty { Text(error).foregroundStyle(.red).font(.callout).padding(.horizontal, 22).padding(.top, 12).frame(maxWidth: .infinity, alignment: .leading) }
            HStack { Button("取消") { model.error = ""; dismiss() }.keyboardShortcut(.cancelAction); Spacer(); Button("保存修改") { save() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction) }.padding(20)
        }.frame(width: 620, height: provider.kind == "json" ? 740 : 510)
    }
    func save() {
        do {
            if provider.kind == "json" {
                guard let data = headers.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: data) as? [String: String] else { throw SettingsError(message: "请求头需要是字符串键值对的 JSON 对象") }
                draft["headers"] = value
                if draft["method"] as? String == "POST" { guard let data = bodyJSON.data(using: .utf8) else { return }; draft["body"] = try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) }
                else { draft.removeValue(forKey: "body") }
                var paths = draft["mapping"] as? [String: String] ?? [:]; if paths["entries"] == nil { paths["entries"] = "" }; if paths["definition"] == nil { paths["definition"] = "definition" }
                for key in ["headword", "phonetic", "partOfSpeech", "example", "audio"] where paths[key]?.isEmpty == true { paths.removeValue(forKey: key) }; draft["mapping"] = paths
            }
            draft["name"] = (draft["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let exists = model.providers.contains { $0.id == provider.id }
            if model.saveProvider(draft, enable: !exists) { dismiss() } else { error = model.error }
        } catch { self.error = error.localizedDescription }
    }
}
struct ProfileEditor: View {
    @ObservedObject var model: SettingsModel
    let profile: ProfileItem
    @Environment(\.dismiss) private var dismiss
    @State private var draft: [String: Any]
    @State private var error = ""
    init(model: SettingsModel, profile: ProfileItem) { self.model = model; self.profile = profile; _draft = State(initialValue: profile.raw) }
    func field(_ key: String, _ fallback: String = "") -> Binding<String> { Binding(get: { draft[key] as? String ?? fallback }, set: { draft[key] = $0 }) }
    var body: some View {
        VStack(spacing: 0) {
            HStack { Text("阅读情景设置").font(.title2.bold()); Spacer() }.padding(22)
            Form { TextField("名称", text: field("name")); TextField("源语言", text: field("sourceLanguage", "en")); TextField("目标语言", text: field("targetLanguage", "zh-CN")); Text("AI 情景要求").font(.headline); TextEditor(text: field("aiPrompt")).frame(height: 140); Text("词典组合和顺序在主窗口中调整。语言代码需符合翻译服务要求。").font(.caption).foregroundStyle(.secondary) }.formStyle(.grouped)
            if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal, 20) }
            HStack {
                Button("取消") { model.error = ""; dismiss() }.keyboardShortcut(.cancelAction)
                if model.profiles.count > 1, model.profiles.contains(where: { $0.id == profile.id }) { Button("删除情景", role: .destructive) { model.removeProfile(profile.id); if model.error.isEmpty { dismiss() } else { error = model.error } } }
                Spacer(); Button("保存修改") { if model.saveProfile(draft) { dismiss() } else { error = model.error } }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
            }.padding(20)
        }.frame(width: 590, height: 510)
    }
}
