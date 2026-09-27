import UIKit
import UniformTypeIdentifiers

class ActionViewController: UIViewController {

    private let supportedHosts: Set<String> = [
        "instagram.com",
        "www.instagram.com",
        "instagr.am",
        "tiktok.com",
        "www.tiktok.com",
        "vm.tiktok.com",
        "vt.tiktok.com",
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be"
    ]

    private var appGroupId: String {
        if let customGroup = Bundle.main.object(forInfoDictionaryKey: "TabayyanAppGroupId") as? String, !customGroup.isEmpty {
            return customGroup
        }
        let bundleId = Bundle.main.bundleIdentifier ?? "com.roolxi.tabayyan"
        let baseBundle = bundleId.replacingOccurrences(of: ".action", with: "")
        return "group.\(baseBundle)"
    }

    private let isArabic: Bool = {
        let preferred = Locale.preferredLanguages.first?.lowercased() ?? ""
        return preferred.hasPrefix("ar")
    }()

    private var currentValidUrl: String?
    private var currentDeepLinkUrl: URL?
    private var copyButton: UIButton?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 7/255.0, green: 26/255.0, blue: 20/255.0, alpha: 1.0) // #071A14
        processSharedInput()
    }

    private func processSharedInput() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem], !items.isEmpty else {
            showError(message: isArabic ? "لم يتم العثور على محتوى مشارك." : "No shared content found.")
            return
        }

        let providers = items.flatMap { $0.attachments ?? [] }
        // Hosts may supply a thumbnail/title BEFORE the actual link.
        let types = [UTType.url.identifier, UTType.plainText.identifier, UTType.text.identifier]
        let attempts = types.flatMap { type in
            providers.filter { $0.hasItemConformingToTypeIdentifier(type) }.map { ($0, type) }
        }
        loadCandidate(attempts, index: 0, fallback: items.compactMap { $0.attributedContentText?.string }.joined(separator: " "))
    }

    private func loadCandidate(_ attempts: [(NSItemProvider, String)], index: Int, fallback: String) {
        guard index < attempts.count else {
            if let link = extractUrlFromText(fallback), let valid = validateAndNormalizeUrl(link) {
                handleValidUrl(valid)
            } else {
                showError(message: isArabic ? "شارك رابط المقطع من يوتيوب أو تيك توك أو إنستغرام." : "Share a video link from YouTube, TikTok, or Instagram.")
            }
            return
        }
        let (provider, type) = attempts[index]
        provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let text = (item as? URL)?.absoluteString ?? (item as? String)
                    ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
                if let text = text, let link = self.extractUrlFromText(text),
                   let valid = self.validateAndNormalizeUrl(link) {
                    self.handleValidUrl(valid)
                } else {
                    self.loadCandidate(attempts, index: index + 1, fallback: fallback)
                }
            }
        }
    }

    private func extractUrlFromText(_ text: String) -> String? {
        let pattern = #"(https?://[^\s]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else {
            return nil
        }
        let nsString = text as NSString
        let results = regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsString.length))
        guard let firstMatch = results.first else {
            // Check without scheme if domain matches directly
            let fallbackPattern = #"(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|instagram\.com|instagr\.am)/[^\s]+"#
            if let fallbackRegex = try? NSRegularExpression(pattern: fallbackPattern, options: .caseInsensitive) {
                if let fallbackMatch = fallbackRegex.matches(in: text, options: [], range: NSRange(location: 0, length: nsString.length)).first {
                    let matchedStr = nsString.substring(with: fallbackMatch.range)
                    return "https://" + matchedStr
                }
            }
            return nil
        }
        var urlStr = nsString.substring(with: firstMatch.range)
        // Clean trailing punctuation
        while let last = urlStr.last, [".", ",", ";", "!", "?", ")", "]", "}"].contains(last) {
            urlStr.removeLast()
        }
        return urlStr
    }

    private func validateAndNormalizeUrl(_ input: String) -> String? {
        var str = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if !str.lowercased().hasPrefix("http://") && !str.lowercased().hasPrefix("https://") {
            str = "https://" + str
        }

        guard let components = URLComponents(string: str),
              let host = components.host?.lowercased(),
              let scheme = components.scheme?.lowercased(),
              (scheme == "http" || scheme == "https") else {
            return nil
        }

        // Host validation
        guard supportedHosts.contains(host), components.user == nil, components.password == nil,
              components.port == nil || components.port == 443, !components.path.isEmpty else {
            return nil
        }

        // Force HTTPS
        var secureComponents = components
        secureComponents.scheme = "https"

        guard let finalUrl = secureComponents.url else {
            return nil
        }

        return finalUrl.absoluteString
    }

    private func handleValidUrl(_ validUrl: String) {
        self.currentValidUrl = validUrl
        let payloadId = UUID().uuidString

        // 1. Optional App Group storage fallback (never blocks URL processing if missing)
        if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) != nil,
           let defaults = UserDefaults(suiteName: appGroupId) {
            let payload: [String: Any] = [
                "url": validUrl,
                "source": "ios-action",
                "timestamp": Date().timeIntervalSince1970,
                "id": payloadId
            ]
            defaults.set(payload, forKey: "pendingSharedPayload")
            defaults.synchronize()
        }

        // 2. Build deep link: tabayyan://handle-share?url=<encoded-url>&source=ios-action&id=<uuid>
        var components = URLComponents()
        components.scheme = "tabayyan"
        components.host = "handle-share"
        components.queryItems = [
            URLQueryItem(name: "url", value: validUrl),
            URLQueryItem(name: "source", value: "ios-action"),
            URLQueryItem(name: "id", value: payloadId)
        ]

        guard let deepLinkUrl = components.url else {
            showOpenFailureUI(validUrl: validUrl, deepLinkUrl: nil)
            return
        }

        self.currentDeepLinkUrl = deepLinkUrl

        // 3. Always attempt to open the main app directly via extensionContext
        self.extensionContext?.open(deepLinkUrl, completionHandler: { [weak self] success in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if success {
                    self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                } else {
                    self.showOpenFailureUI(validUrl: validUrl, deepLinkUrl: deepLinkUrl)
                }
            }
        })
    }

    private func showOpenFailureUI(validUrl: String, deepLinkUrl: URL?) {
        self.currentValidUrl = validUrl
        self.currentDeepLinkUrl = deepLinkUrl

        // Clear existing views
        view.subviews.forEach { $0.removeFromSuperview() }

        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(red: 16/255.0, green: 40/255.0, blue: 32/255.0, alpha: 0.96)
        card.layer.cornerRadius = 20
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(red: 212/255.0, green: 175/255.0, blue: 55/255.0, alpha: 0.4).cgColor
        card.layer.masksToBounds = true
        view.addSubview(card)

        let iconLabel = UILabel()
        iconLabel.translatesAutoresizingMaskIntoConstraints = false
        iconLabel.text = "🔗"
        iconLabel.font = UIFont.systemFont(ofSize: 36)
        iconLabel.textAlignment = .center
        card.addSubview(iconLabel)

        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = isArabic ? "تعذّر فتح تبيّن تلقائياً" : "Couldn’t Open Tabayyan"
        titleLabel.font = UIFont.boldSystemFont(ofSize: 18)
        titleLabel.textColor = UIColor.white
        titleLabel.textAlignment = .center
        card.addSubview(titleLabel)

        let msgLabel = UILabel()
        msgLabel.translatesAutoresizingMaskIntoConstraints = false
        msgLabel.text = isArabic
            ? "انسخ الرابط وافتح تطبيق تبيّن، ثم الصقه في شاشة الفحص."
            : "Copy the link, open Tabayyan, then paste it into the verification screen."
        msgLabel.font = UIFont.systemFont(ofSize: 14)
        msgLabel.textColor = UIColor(white: 0.85, alpha: 1.0)
        msgLabel.numberOfLines = 0
        msgLabel.textAlignment = .center
        card.addSubview(msgLabel)

        // Primary button: Copy Link
        let copyBtn = UIButton(type: .system)
        copyBtn.translatesAutoresizingMaskIntoConstraints = false
        copyBtn.setTitle(isArabic ? "نسخ الرابط" : "Copy Link", for: .normal)
        copyBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 16)
        copyBtn.setTitleColor(UIColor.black, for: .normal)
        copyBtn.backgroundColor = UIColor(red: 212/255.0, green: 175/255.0, blue: 55/255.0, alpha: 1.0) // Gold
        copyBtn.layer.cornerRadius = 14
        copyBtn.addTarget(self, action: #selector(handleCopyUrl), for: .touchUpInside)
        card.addSubview(copyBtn)
        self.copyButton = copyBtn

        // Secondary button: Try Again
        let retryBtn = UIButton(type: .system)
        retryBtn.translatesAutoresizingMaskIntoConstraints = false
        retryBtn.setTitle(isArabic ? "محاولة فتح تبيّن" : "Try Again", for: .normal)
        retryBtn.titleLabel?.font = UIFont.boldSystemFont(ofSize: 15)
        retryBtn.setTitleColor(UIColor.white, for: .normal)
        retryBtn.backgroundColor = UIColor(red: 24/255.0, green: 56/255.0, blue: 45/255.0, alpha: 1.0)
        retryBtn.layer.cornerRadius = 14
        retryBtn.layer.borderWidth = 1
        retryBtn.layer.borderColor = UIColor(red: 212/255.0, green: 175/255.0, blue: 55/255.0, alpha: 0.5).cgColor
        retryBtn.addTarget(self, action: #selector(handleRetryOpen), for: .touchUpInside)
        card.addSubview(retryBtn)

        // Dismiss button: Close
        let closeBtn = UIButton(type: .system)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        closeBtn.setTitle(isArabic ? "إغلاق" : "Close", for: .normal)
        closeBtn.titleLabel?.font = UIFont.systemFont(ofSize: 14)
        closeBtn.setTitleColor(UIColor(white: 0.7, alpha: 1.0), for: .normal)
        closeBtn.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)
        card.addSubview(closeBtn)

        NSLayoutConstraint.activate([
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),

            iconLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            iconLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            titleLabel.topAnchor.constraint(equalTo: iconLabel.bottomAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            msgLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            msgLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            msgLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            copyBtn.topAnchor.constraint(equalTo: msgLabel.bottomAnchor, constant: 20),
            copyBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            copyBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            copyBtn.heightAnchor.constraint(equalToConstant: 44),

            retryBtn.topAnchor.constraint(equalTo: copyBtn.bottomAnchor, constant: 10),
            retryBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            retryBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            retryBtn.heightAnchor.constraint(equalToConstant: 44),

            closeBtn.topAnchor.constraint(equalTo: retryBtn.bottomAnchor, constant: 10),
            closeBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            closeBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            closeBtn.heightAnchor.constraint(equalToConstant: 36),
            closeBtn.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20)
        ])
    }

    @objc private func handleCopyUrl() {
        guard let url = currentValidUrl else { return }
        UIPasteboard.general.string = url
        copyButton?.setTitle(isArabic ? "تم النسخ ✓" : "Copied! ✓", for: .normal)
    }

    @objc private func handleRetryOpen() {
        guard let deepLink = currentDeepLinkUrl else { return }
        self.extensionContext?.open(deepLink, completionHandler: { [weak self] success in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if success {
                    self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                }
            }
        })
    }

    private func showError(message: String) {
        let titleText = isArabic ? "تعذر الفحص" : "Verification Unavailable"
        let buttonText = isArabic ? "إغلاق" : "Close"

        presentMessageCard(title: titleText, message: message, buttonTitle: buttonText, isSuccess: false)
    }

    private func presentMessageCard(title: String, message: String, buttonTitle: String, isSuccess: Bool) {
        view.subviews.forEach { $0.removeFromSuperview() }

        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(red: 16/255.0, green: 40/255.0, blue: 32/255.0, alpha: 0.95)
        card.layer.cornerRadius = 20
        card.layer.borderWidth = 1
        card.layer.borderColor = isSuccess
            ? UIColor(red: 212/255.0, green: 175/255.0, blue: 55/255.0, alpha: 0.4).cgColor
            : UIColor.red.withAlphaComponent(0.3).cgColor
        card.layer.masksToBounds = true
        view.addSubview(card)

        let iconLabel = UILabel()
        iconLabel.translatesAutoresizingMaskIntoConstraints = false
        iconLabel.text = isSuccess ? "✨" : "⚠️"
        iconLabel.font = UIFont.systemFont(ofSize: 36)
        iconLabel.textAlignment = .center
        card.addSubview(iconLabel)

        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = title
        titleLabel.font = UIFont.boldSystemFont(ofSize: 18)
        titleLabel.textColor = UIColor.white
        titleLabel.textAlignment = .center
        card.addSubview(titleLabel)

        let msgLabel = UILabel()
        msgLabel.translatesAutoresizingMaskIntoConstraints = false
        msgLabel.text = message
        msgLabel.font = UIFont.systemFont(ofSize: 14)
        msgLabel.textColor = UIColor(white: 0.85, alpha: 1.0)
        msgLabel.numberOfLines = 0
        msgLabel.textAlignment = .center
        card.addSubview(msgLabel)

        let actionButton = UIButton(type: .system)
        actionButton.translatesAutoresizingMaskIntoConstraints = false
        actionButton.setTitle(buttonTitle, for: .normal)
        actionButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 16)
        actionButton.setTitleColor(UIColor.black, for: .normal)
        actionButton.backgroundColor = UIColor(red: 212/255.0, green: 175/255.0, blue: 55/255.0, alpha: 1.0) // Gold
        actionButton.layer.cornerRadius = 14
        actionButton.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)
        card.addSubview(actionButton)

        NSLayoutConstraint.activate([
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),

            iconLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            iconLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            titleLabel.topAnchor.constraint(equalTo: iconLabel.bottomAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            msgLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            msgLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            msgLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            actionButton.topAnchor.constraint(equalTo: msgLabel.bottomAnchor, constant: 20),
            actionButton.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            actionButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            actionButton.heightAnchor.constraint(equalToConstant: 44),
            actionButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)
        ])
    }

    @objc private func handleDismiss() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
