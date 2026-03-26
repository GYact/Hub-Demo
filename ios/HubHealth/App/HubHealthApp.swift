import SwiftUI

@main
struct HubHealthApp: App {
    init() {
        WatchSyncManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .task {
                    let hk = HealthKitManager.shared
                    try? await hk.requestAuthorization()
                    hk.enableBackgroundDelivery()
                    await HealthSyncService.shared.sync()
                }
        }
    }
}
