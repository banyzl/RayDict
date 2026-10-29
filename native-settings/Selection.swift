import AppKit
import ApplicationServices

private struct CaptureFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

private struct PasteboardSnapshot {
    let items: [[NSPasteboard.PasteboardType: Data]]
    init(_ pasteboard: NSPasteboard) throws {
        items = try (pasteboard.pasteboardItems ?? []).map { item in
            var formats: [NSPasteboard.PasteboardType: Data] = [:]
            for type in item.types {
                guard let data = item.data(forType: type) else {
                    throw CaptureFailure(message: "无法完整备份剪贴板，请手动复制后使用剪贴板查词。")
                }
                formats[type] = data
            }
            return formats
        }
    }
    func restore(_ pasteboard: NSPasteboard, ifUnchangedSince change: Int) {
        // Do not overwrite a copy the user made while this helper was running.
        guard pasteboard.changeCount == change else { return }
        let restored = items.map { formats -> NSPasteboardItem in
            let item = NSPasteboardItem()
            for (type, data) in formats { item.setData(data, forType: type) }
            return item
        }
        pasteboard.clearContents()
        if !restored.isEmpty { pasteboard.writeObjects(restored) }
    }
}

enum SelectionCapture {
    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }
    private static func copyMenu(_ element: AXUIElement, deadline: Date, remaining: inout Int) -> AXUIElement? {
        guard remaining > 0, Date() < deadline else { return nil }
        remaining -= 1
        let title = attribute(element, kAXTitleAttribute) as? String ?? ""
        let role = attribute(element, kAXRoleAttribute) as? String ?? ""
        if role == kAXMenuItemRole, ["Copy", "复制", "拷贝", "拷貝", "複製"].contains(title),
           (attribute(element, kAXEnabledAttribute) as? NSNumber)?.boolValue == true {
            return element
        }
        for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] {
            if let found = copyMenu(child, deadline: deadline, remaining: &remaining) { return found }
        }
        return nil
    }
    private static func copiedText(_ pasteboard: NSPasteboard, after change: Int) throws -> String {
        guard pasteboard.changeCount != change else {
            throw CaptureFailure(message: "微信没有复制新的文字。请在消息中选中文字并按 ⌘C，再使用剪贴板查词。")
        }
        return try validated(pasteboard.string(forType: .string))
    }
    private static func validated(_ text: String?) throws -> String {
        let text = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty else { throw CaptureFailure(message: "复制内容不是文字，请手动选择文字后重试。") }
        guard text.utf16.count <= 3000 else { throw CaptureFailure(message: "单次最多查询 3000 字符，请缩小选区。") }
        return text
    }
    private static func capture(bundle: String) throws -> [String: String] {
        guard !bundle.isEmpty, !bundle.hasPrefix("com.raycast."),
              let target = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first else {
            throw CaptureFailure(message: "找不到原应用，请回到微信选中文字后重试。")
        }
        guard AXIsProcessTrusted() else {
            throw CaptureFailure(message: "系统未允许兼容取词读取应用。请检查 Raycast 辅助功能权限，或先手动复制后查词。")
        }
        let current = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
        guard current == bundle || current.hasPrefix("com.raycast.") else {
            throw CaptureFailure(message: "当前应用已切换，请回到原应用选中文字后重试。")
        }
        if !target.isActive { target.activate(options: [.activateIgnoringOtherApps]) }
        let activationDeadline = Date().addingTimeInterval(0.8)
        while !target.isActive && Date() < activationDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.025)) }
        guard target.isActive else { throw CaptureFailure(message: "无法返回原应用，请先手动复制文字。") }
        let app = AXUIElementCreateApplication(target.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 0.2)
        if let focused = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() {
            let element = unsafeBitCast(focused, to: AXUIElement.self)
            if let selected = attribute(element, kAXSelectedTextAttribute) as? String,
               !selected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return ["text": try validated(selected), "method": "accessibility"]
            }
        }
        guard let bar = attribute(app, kAXMenuBarAttribute), CFGetTypeID(bar) == AXUIElementGetTypeID() else {
            throw CaptureFailure(message: "应用未提供复制菜单，请按 ⌘C 或右键复制后查词。")
        }
        var remaining = 500
        guard let menu = copyMenu(unsafeBitCast(bar, to: AXUIElement.self), deadline: Date().addingTimeInterval(1.5), remaining: &remaining) else {
            throw CaptureFailure(message: "微信当前选区没有可用的复制菜单，请按 ⌘C 或右键复制，再使用剪贴板查词。")
        }
        let pasteboard = NSPasteboard.general
        let snapshot = try PasteboardSnapshot(pasteboard)
        let previous = pasteboard.changeCount
        guard AXUIElementPerformAction(menu, kAXPressAction as CFString) == .success else {
            throw CaptureFailure(message: "应用没有执行复制，请手动复制后查词。")
        }
        let copyDeadline = Date().addingTimeInterval(1.0)
        while pasteboard.changeCount == previous && Date() < copyDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.025)) }
        let copied = pasteboard.changeCount
        defer { if copied != previous { snapshot.restore(pasteboard, ifUnchangedSince: copied) } }
        return ["text": try copiedText(pasteboard, after: previous), "method": "menu-copy"]
    }
    static func run(bundle: String) -> Never {
        let payload: [String: String]
        do { payload = try capture(bundle: bundle) }
        catch { payload = ["error": error.localizedDescription] }
        let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        print(String(data: data, encoding: .utf8)!)
        exit(0)
    }
    static func selfTest() -> Never {
        func check(_ value: Bool, _ name: String) { if !value { print("FAILED: \(name)"); exit(1) }; print("OK: \(name)") }
        let pasteboard = NSPasteboard(name: .init("dev.raydict.selection-test-\(UUID().uuidString)"))
        defer { pasteboard.releaseGlobally() }
        let item = NSPasteboardItem()
        item.setString("original clipboard", forType: .string)
        item.setString("<b>original clipboard</b>", forType: .html)
        pasteboard.writeObjects([item])
        let snapshot = try! PasteboardSnapshot(pasteboard)
        let before = pasteboard.changeCount
        do { _ = try copiedText(pasteboard, after: before); check(false, "reject stale clipboard") }
        catch { check(true, "reject stale clipboard") }
        pasteboard.clearContents(); pasteboard.setString("new selection", forType: .string)
        check((try? copiedText(pasteboard, after: before)) == "new selection", "accept fresh copy")
        let owned = pasteboard.changeCount
        snapshot.restore(pasteboard, ifUnchangedSince: owned)
        check(pasteboard.string(forType: .string) == "original clipboard" && pasteboard.string(forType: .html) == "<b>original clipboard</b>", "restore all clipboard formats")
        let oldCount = pasteboard.changeCount
        pasteboard.clearContents(); pasteboard.setString("user copied something else", forType: .string)
        snapshot.restore(pasteboard, ifUnchangedSince: oldCount)
        check(pasteboard.string(forType: .string) == "user copied something else", "preserve concurrent user copy")
        check((try? validated("  word\n")) == "word", "trim captured text")
        check((try? validated(" \n")) == nil, "reject empty capture")
        check((try? validated(String(repeating: "x", count: 3001))) == nil, "reject oversized capture")
        pasteboard.releaseGlobally()
        exit(0)
    }
}
