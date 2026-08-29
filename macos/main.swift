import Cocoa
import WebKit

final class NativeBridge: NSObject, WKScriptMessageHandler {
    weak var window: NSWindow?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "clipboard":
            guard let text = message.body as? String else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        case "download":
            guard
                let payload = message.body as? [String: Any],
                let encoded = payload["data"] as? String,
                let data = Data(base64Encoded: encoded)
            else { return }

            let requestedName = (payload["filename"] as? String) ?? "pilepilepile-export"
            let safeName = URL(fileURLWithPath: requestedName).lastPathComponent
            let panel = NSSavePanel()
            panel.nameFieldStringValue = safeName
            panel.canCreateDirectories = true

            let save: (NSApplication.ModalResponse) -> Void = { response in
                guard response == .OK, let destination = panel.url else { return }
                do {
                    try data.write(to: destination, options: .atomic)
                } catch {
                    let alert = NSAlert(error: error)
                    alert.runModal()
                }
            }

            if let window {
                panel.beginSheetModal(for: window, completionHandler: save)
            } else {
                save(panel.runModal())
            }
        default:
            break
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let bridge = NativeBridge()
    private static let appBackgroundColor = NSColor(
        calibratedRed: 244.0 / 255.0,
        green: 241.0 / 255.0,
        blue: 234.0 / 255.0,
        alpha: 1.0
    )
    private static let navigationBackgroundColor = NSColor(
        calibratedRed: 250.0 / 255.0,
        green: 248.0 / 255.0,
        blue: 243.0 / 255.0,
        alpha: 1.0
    )

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()

        let userContentController = WKUserContentController()
        userContentController.add(bridge, name: "clipboard")
        userContentController.add(bridge, name: "download")
        userContentController.addUserScript(WKUserScript(
            source: Self.downloadBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        webView.underPageBackgroundColor = Self.appBackgroundColor

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 960),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = ""
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = Self.appBackgroundColor
        window.contentMinSize = NSSize(width: 1180, height: 820)
        window.center()
        window.contentView = webView
        configureTitlebarVersion()
        window.makeKeyAndOrderFront(nil)
        bridge.window = window

        guard let webRoot = Bundle.main.resourceURL?.appendingPathComponent("Web", isDirectory: true) else {
            presentLaunchError("找不到应用资源目录。")
            return
        }
        let indexURL = webRoot.appendingPathComponent("index.html")
        webView.loadFileURL(indexURL, allowingReadAccessTo: webRoot)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection

        let finish: (NSApplication.ModalResponse) -> Void = { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }

        if let window {
            panel.beginSheetModal(for: window, completionHandler: finish)
        } else {
            finish(panel.runModal())
        }
    }

    private func configureMenu() {
        let mainMenu = NSMenu()
        let applicationItem = NSMenuItem()
        mainMenu.addItem(applicationItem)

        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "关于堆堆堆", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(withTitle: "隐藏堆堆堆", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        applicationMenu.addItem(withTitle: "退出堆堆堆", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        NSApp.mainMenu = mainMenu
    }

    private func configureTitlebarVersion() {
        guard let titlebarView = window.standardWindowButton(.closeButton)?.superview else { return }
        titlebarView.wantsLayer = true
        titlebarView.layer?.backgroundColor = Self.navigationBackgroundColor.cgColor
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let label = NSTextField(labelWithString: "v\(version)")
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textColor = NSColor(calibratedWhite: 0.46, alpha: 1.0)
        label.font = NSFont.systemFont(ofSize: 10, weight: .medium)
        label.isSelectable = false
        label.setAccessibilityLabel("版本 \(version)")
        titlebarView.addSubview(label)

        NSLayoutConstraint.activate([
            label.trailingAnchor.constraint(equalTo: titlebarView.trailingAnchor, constant: -16),
            label.centerYAnchor.constraint(equalTo: titlebarView.centerYAnchor)
        ])
    }

    private func presentLaunchError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "堆堆堆无法启动"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    private static let downloadBridgeScript = #"""
    (() => {
      document.addEventListener('click', async (event) => {
        const anchor = event.target?.closest?.('a[download]');
        if (!anchor || !anchor.href) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const response = await fetch(anchor.href);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onload = () => {
            const data = String(reader.result).split(',')[1] || '';
            window.webkit.messageHandlers.download.postMessage({
              filename: anchor.download || 'pilepilepile-export',
              type: blob.type || 'application/octet-stream',
              data
            });
          };
          reader.readAsDataURL(blob);
        } catch (error) {
          console.error('Native download failed', error);
        }
      }, true);
    })();
    """#

}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
