import SwiftUI

@main
struct HubHealthWatchApp: App {
    @State private var autoFocusInput = false

    init() {
        NotificationManager.shared.setup()
        WatchSyncManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchContentView(autoFocusInput: $autoFocusInput)
                .onOpenURL { url in
                    if url.host == "company" {
                        autoFocusInput = true
                    }
                }
        }
    }
}
