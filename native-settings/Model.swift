import Foundation
import AppKit

struct ProviderItem: Identifiable {
    var raw: [String: Any]
    var id: String { raw["id"] as? String ?? "" }
    var name: String { raw["name"] as? String ?? "未命名词典" }
    var kind: String { raw["kind"] as? String ?? "json" }
}
struct ProfileItem: Identifiable {
    var raw: [String: Any]
    var id: String { raw["id"] as? String ?? "" }
    var name: String { raw["name"] as? String ?? "未命名情景" }
    var providerIds: [String] { raw["providerIds"] as? [String] ?? [] }
}
struct SettingsError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

@MainActor final class SettingsModel: ObservableObject {
    @Published var config: [String: Any] = [:]
    @Published var catalog: [[String: Any]] = []
    @Published var error = ""
    @Published var status = ""
    let url: URL
    var revision = -1
    init(configPath: String, catalogPath: String) {
        url = URL(fileURLWithPath: configPath)
        do {
            let data = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: catalogPath))) as? [String: Any] ?? [:]
            catalog = data["items"] as? [[String: Any]] ?? []
            try reload()
        } catch { self.error = error.localizedDescription }
    }
    var providers: [ProviderItem] { (config["providers"] as? [[String: Any]] ?? []).map { ProviderItem(raw: $0) } }
    var profiles: [ProfileItem] { (config["profiles"] as? [[String: Any]] ?? []).map { ProfileItem(raw: $0) } }
    var activeID: String { config["activeProfileId"] as? String ?? "" }
    var active: ProfileItem? { profiles.first { $0.id == activeID } }
    var ordered: [ProviderItem] {
        let ids = active?.providerIds ?? []
        return ids.compactMap { id in providers.first { $0.id == id } } + providers.filter { !ids.contains($0.id) }
    }
    func metadata(_ provider: ProviderItem) -> [String: Any] { catalog.first { ($0["config"] as? [String: Any])?["kind"] as? String == provider.kind } ?? [:] }
    func enabled(_ id: String) -> Bool { active?.providerIds.contains(id) ?? false }
    func reload() throws {
        let envelope = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] ?? [:]
        guard let next = envelope["config"] as? [String: Any], let version = envelope["revision"] as? Int else { throw SettingsError(message: "无法读取配置文件。请从 Raycast 的设置命令打开此窗口。") }
        try Self.validate(next)
        config = next; revision = version; error = ""; status = "配置已载入"
    }
    static func validate(_ config: [String: Any]) throws {
        func reject(_ message: String) throws { throw SettingsError(message: message) }
        guard config["schemaVersion"] as? Int == 1, let providers = config["providers"] as? [[String: Any]], let profiles = config["profiles"] as? [[String: Any]], !profiles.isEmpty, profiles.count <= 30, providers.count <= 80 else { try reject("配置格式无效或超出数量限制"); return }
        let ids = providers.compactMap { $0["id"] as? String }; let profileIDs = profiles.compactMap { $0["id"] as? String }
        guard ids.count == providers.count, Set(ids).count == ids.count, profileIDs.count == profiles.count, Set(profileIDs).count == profileIDs.count, let active = config["activeProfileId"] as? String, profileIDs.contains(active) else { try reject("词典或情景 ID 重复，或当前情景不存在"); return }
        if let version = config["catalogVersion"] as? Int, !(1...3).contains(version) { try reject("不支持的词典目录版本") }
        let allowedProviderKeys: Set<String> = ["id","name","kind","trigger","scope","language","inputLanguage","timeoutMs","endpoint","method","headers","body","tokenSlot","mapping","attribution","attributionUrl"]
        let kinds = ["youdao", "cambridge", "zdic", "wikipedia", "dictionaryapi", "glossary", "mymemory", "deepl", "ai", "json", "bing", "dictcn", "oxford", "longman", "wiktionary"]
        for provider in providers {
            guard Set(provider.keys).isSubset(of: allowedProviderKeys), let id = provider["id"] as? String, !id.isEmpty, id.count <= 100 else { try reject("词典含有未知字段或无效 ID"); return }
            for key in ["id","name","kind","trigger","scope","language","inputLanguage","endpoint","method","tokenSlot","attribution","attributionUrl"] { if let value = provider[key], !(value is String) { try reject("词典字段类型无效：\(key)") } }
            if let value = provider["timeoutMs"], !(value is Int) { try reject("超时必须是整数") }
            if let value = provider["headers"], !(value is [String: String]) { try reject("请求头必须是字符串键值对") }
            if let value = provider["mapping"], !(value is [String: String]) { try reject("结果映射必须是字段路径") }
            let name = provider["name"] as? String ?? ""
            guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 100, kinds.contains(provider["kind"] as? String ?? "") else { try reject("请填写有效的词典名称和类型"); return }
            if let trigger = provider["trigger"] as? String, !["auto", "manual"].contains(trigger) { try reject("无效的查询方式") }
            if let timeout = provider["timeoutMs"] as? Int, !(100...60000).contains(timeout) { try reject("超时必须在 0.1 到 60 秒之间") }
            for (key, choices) in ["scope": ["word","any"], "language": ["auto","en","zh"], "inputLanguage": ["any","han","latin"], "method": ["GET","POST"], "tokenSlot": ["none","1","2","3"]] { if let value = provider[key] as? String, !choices.contains(value) { try reject("无效的词典选项：\(key)") } }
            if provider["kind"] as? String == "json" {
                let endpoint = provider["endpoint"] as? String ?? ""
                let testURL = endpoint.replacingOccurrences(of: "\\{\\w+\\}", with: "test", options: .regularExpression)
                guard let url = URL(string: testURL), url.user == nil, url.password == nil, url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "[::1]"].contains(url.host ?? "")), let mapping = provider["mapping"] as? [String: String], mapping["definition"] != nil else { try reject("请填写 HTTPS API 地址和释义映射；本机服务也可使用 HTTP。"); return }
                let bodyString = provider["body"].flatMap { try? JSONSerialization.data(withJSONObject: $0, options: .fragmentsAllowed) }.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                if let headers = provider["headers"] as? [String: Any], headers.values.contains(where: { !($0 is String) }) { try reject("请求头的值必须是字符串") }
                if (provider["tokenSlot"] as? String ?? "none") == "none", let headers = provider["headers"] as? [String: String], headers.values.contains(where: { $0.contains("{token}") }) { try reject("请为请求头选择一个密钥槽位") }
                if endpoint.contains("{token}") || bodyString.contains("{token}") { try reject("密钥只能通过请求头传递") }
                for value in mapping.values where !value.isEmpty {
                    guard value.count <= 300, value.range(of: "^(?:[\\w-]+|\\[\\d*\\])(?:\\.[\\w-]+|\\[\\d*\\])*$", options: .regularExpression) != nil, !value.components(separatedBy: CharacterSet(charactersIn: ".[]")).contains(where: { ["__proto__", "constructor", "prototype"].contains($0) }) else { try reject("无效的数据路径：\(value)"); return }
                }
            }
        }
        for profile in profiles {
            guard let id = profile["id"] as? String, !id.isEmpty, id.count <= 100 else { try reject("无效的情景 ID"); return }
            for key in ["id","name","sourceLanguage","targetLanguage","aiPrompt"] { if let value = profile[key], !(value is String) { try reject("情景字段类型无效：\(key)") } }
            if let prompt = profile["aiPrompt"] as? String, prompt.count > 4000 { try reject("AI 情景要求最多 4000 字符") }
            guard let name = profile["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 100, let enabled = profile["providerIds"] as? [String], enabled.count <= 40, Set(enabled).count == enabled.count, enabled.allSatisfy({ ids.contains($0) }) else { try reject("情景名称、词典组合或顺序无效"); return }
            for key in ["sourceLanguage", "targetLanguage"] { if let value = profile[key] as? String, !(2...20).contains(value.count) { try reject("请填写有效的语言代码，例如 en 或 zh-CN") } }
        }
    }
    @discardableResult func commit(_ next: [String: Any]) -> Bool {
        let lock = URL(fileURLWithPath: url.path + ".lock")
        var locked = false
        do {
            try Self.validate(next)
            do { try FileManager.default.createDirectory(at: lock, withIntermediateDirectories: false); locked = true } catch { throw SettingsError(message: "另一窗口正在保存，请稍后重试。") }
            defer { if locked { try? FileManager.default.removeItem(at: lock) } }
            let current = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] ?? [:]
            guard current["revision"] as? Int == revision else { throw SettingsError(message: "配置已在另一窗口修改。本次修改未写入，请先点击刷新再重试。") }
            let data = try JSONSerialization.data(withJSONObject: ["revision": revision + 1, "config": next], options: [.prettyPrinted, .sortedKeys])
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
            config = next; revision += 1; error = ""; status = "已保存 · 查词界面将自动更新"
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func activate(_ id: String) { var next = config; next["activeProfileId"] = id; _ = commit(next) }
    func setEnabled(_ id: String, _ enabled: Bool) {
        var next = config; var modes = profiles.map(\.raw)
        guard let index = profiles.firstIndex(where: { $0.id == activeID }) else { return }
        var ids = active?.providerIds ?? []; ids.removeAll { $0 == id }; if enabled { ids.append(id) }
        modes[index]["providerIds"] = ids; next["profiles"] = modes; _ = commit(next)
    }
    func move(_ id: String, to target: String) {
        var ids = active?.providerIds ?? []
        guard id != target, let from = ids.firstIndex(of: id), let to = ids.firstIndex(of: target) else { return }
        ids.remove(at: from); ids.insert(id, at: min(to, ids.count))
        var next = config; var modes = profiles.map(\.raw); guard let index = profiles.firstIndex(where: { $0.id == activeID }) else { return }
        modes[index]["providerIds"] = ids; next["profiles"] = modes; _ = commit(next)
    }
    func setOrder(_ ids: [String]) {
        guard Set(ids) == Set(active?.providerIds ?? []), ids.count == active?.providerIds.count else { return }
        var next = config; var modes = profiles.map(\.raw)
        guard let index = profiles.firstIndex(where: { $0.id == activeID }) else { return }
        modes[index]["providerIds"] = ids; next["profiles"] = modes; _ = commit(next)
    }
    func nudge(_ id: String, by distance: Int) {
        var ids = active?.providerIds ?? []
        guard let index = ids.firstIndex(of: id), ids.indices.contains(index + distance) else { return }
        ids.swapAt(index, index + distance); setOrder(ids)
    }
    @discardableResult func saveProvider(_ provider: [String: Any], enable: Bool = false) -> Bool {
        var next = config; var sources = providers.map(\.raw)
        guard let id = provider["id"] as? String else { return false }
        if let index = providers.firstIndex(where: { $0.id == id }) { sources[index] = provider } else { sources.append(provider) }
        next["providers"] = sources
        if enable { var modes = profiles.map(\.raw); if let index = profiles.firstIndex(where: { $0.id == activeID }) { var ids = active?.providerIds ?? []; if !ids.contains(id) { ids.append(id) }; modes[index]["providerIds"] = ids; next["profiles"] = modes } }
        return commit(next)
    }
    func removeProvider(_ id: String) {
        var next = config; next["providers"] = providers.filter { $0.id != id }.map(\.raw)
        next["profiles"] = profiles.map { profile in var value = profile.raw; value["providerIds"] = profile.providerIds.filter { $0 != id }; return value }
        _ = commit(next)
    }
    @discardableResult func saveProfile(_ profile: [String: Any]) -> Bool {
        var next = config; var modes = profiles.map(\.raw); let id = profile["id"] as? String ?? ""
        if let index = profiles.firstIndex(where: { $0.id == id }) { modes[index] = profile } else { modes.append(profile) }
        next["profiles"] = modes; next["activeProfileId"] = id; return commit(next)
    }
    func removeProfile(_ id: String) {
        guard profiles.count > 1 else { return }; var next = config
        let remaining = profiles.filter { $0.id != id }; next["profiles"] = remaining.map(\.raw)
        if activeID == id { next["activeProfileId"] = remaining[0].id }; _ = commit(next)
    }
    func exportConfig() {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "RayDict-词典配置.json"
        if panel.runModal() == .OK, let target = panel.url { do { let data = try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys]); try data.write(to: target, options: .atomic); status = "配置已导出" } catch { self.error = error.localizedDescription } }
    }
    func importConfig() {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        if panel.runModal() == .OK, let target = panel.url {
            do { let value = try JSONSerialization.jsonObject(with: Data(contentsOf: target)) as? [String: Any] ?? [:]; let next = value["config"] as? [String: Any] ?? value; try Self.validate(next)
                let alert = NSAlert(); alert.messageText = "替换词典与情景配置？"; alert.informativeText = "生词本、历史与 API 密钥不会改变。建议先导出当前配置。"; alert.addButton(withTitle: "替换"); alert.addButton(withTitle: "取消")
                if alert.runModal() == .alertFirstButtonReturn { _ = commit(next) }
            } catch { self.error = error.localizedDescription }
        }
    }
}
