import Foundation
import WatchConnectivity
import os.log

private let logger = Logger(subsystem: "com.gyact.hub.health", category: "WatchSync")

final class WatchSyncManager: NSObject, WCSessionDelegate, ObservableObject {
    static let shared = WatchSyncManager()

    @Published var lastSyncStatus: String?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error {
            logger.error("Activation error: \(error.localizedDescription)")
        } else {
            logger.info("WCSession activated: \(String(describing: activationState.rawValue))")
        }
    }

    func sendSettingsToWatch() {
        // Relay settings are now hardcoded in RelayConfig — no sync needed
        DispatchQueue.main.async { self.lastSyncStatus = "設定はアプリに組み込み済み ✓" }
    }

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
    #endif
}
