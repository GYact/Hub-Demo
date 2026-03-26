import Foundation
import UserNotifications

enum NotificationCategory {
    static let companyTaskComplete = "companyTaskComplete"
}

enum NotificationAction {
    static let reply = "reply"
    static let viewResult = "viewResult"
}

final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()

    /// iOS: callback to process reply immediately
    var onReplyWithTask: ((String) async -> Void)?
    /// iOS: callback when user taps "結果を見る"
    var onViewResult: (() -> Void)?

    func setup() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
            if let error { print("[Notifications] \(error)") }
        }

        let replyAction = UNTextInputNotificationAction(
            identifier: NotificationAction.reply,
            title: "返信する",
            options: .foreground,
            textInputButtonTitle: "送信",
            textInputPlaceholder: "新しいタスクを入力"
        )

        let viewAction = UNNotificationAction(
            identifier: NotificationAction.viewResult,
            title: "結果を見る",
            options: .foreground
        )

        let category = UNNotificationCategory(
            identifier: NotificationCategory.companyTaskComplete,
            actions: [replyAction, viewAction],
            intentIdentifiers: []
        )

        center.setNotificationCategories([category])
    }

    func sendTaskComplete(summary: String) {
        let content = UNMutableNotificationContent()
        content.title = "AI Company タスク完了"
        content.body = summary
        content.categoryIdentifier = NotificationCategory.companyTaskComplete
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        switch response.actionIdentifier {
        case NotificationAction.reply:
            if let textResponse = response as? UNTextInputNotificationResponse {
                let task = textResponse.userText
                if let handler = onReplyWithTask {
                    await handler(task)
                } else {
                    // Watch: store pending task for UI to pick up on launch
                    UserDefaults.standard.set(task, forKey: UserDefaultsKeys.pendingNotificationTask)
                }
            }
        case NotificationAction.viewResult:
            if let handler = onViewResult {
                handler()
            }
        case UNNotificationDefaultActionIdentifier:
            // User tapped the notification itself — show result
            if let handler = onViewResult {
                handler()
            }
        default:
            break
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.list, .sound]
    }
}
