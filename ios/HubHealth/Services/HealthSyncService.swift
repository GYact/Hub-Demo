import Foundation
import os.log

private let logger = Logger(subsystem: "com.gyact.hub.health", category: "HealthSync")

@Observable
final class HealthSyncService {
    static let shared = HealthSyncService()

    private(set) var isSyncing = false
    private(set) var lastSyncDate: Date?
    private(set) var lastSyncCount = 0
    private(set) var lastError: String?

    init() {
        if let ts = UserDefaults.standard.object(forKey: UserDefaultsKeys.lastSyncDate) as? Date {
            lastSyncDate = ts
        }
    }

    func sync() async {
        guard !isSyncing else { return }
        guard let token = KeychainHelper.load(KeychainKeys.webhookToken) else {
            lastError = "Webhook token not configured"
            return
        }

        isSyncing = true
        lastError = nil

        do {
            let hoursSinceLastSync: Double
            if let last = lastSyncDate {
                hoursSinceLastSync = min(Date().timeIntervalSince(last) / 3600, 168) // max 7 days
            } else {
                // First sync: use user-configured lookback (default 72h)
                let configured = UserDefaults.standard.double(forKey: UserDefaultsKeys.initialSyncHours)
                hoursSinceLastSync = configured > 0 ? min(configured, 168) : 72
            }

            let metrics = await HealthKitManager.shared.fetchAllMetrics(hours: hoursSinceLastSync)
            guard !metrics.isEmpty else {
                isSyncing = false
                lastSyncCount = 0
                lastSyncDate = .now
                UserDefaults.standard.set(Date.now, forKey: UserDefaultsKeys.lastSyncDate)
                return
            }

            // Batch in chunks of 100
            var totalInserted = 0
            for chunk in metrics.chunked(size: 100) {
                let result = try await postMetrics(chunk, token: token)
                totalInserted += result.inserted ?? 0
            }

            lastSyncCount = totalInserted
            lastSyncDate = .now
            UserDefaults.standard.set(Date.now, forKey: UserDefaultsKeys.lastSyncDate)
            logger.info("Synced \(totalInserted) metrics")
        } catch {
            lastError = error.localizedDescription
            logger.error("Sync failed: \(error.localizedDescription)")
        }

        isSyncing = false
    }

    private func postMetrics(_ metrics: [HealthMetricPayload], token: String) async throws -> HealthMetricsResponse {
        var request = URLRequest(url: URL(string: HubAPI.healthMetricsEndpoint)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-Webhook-Token")

        let body = HealthMetricsBatch(metrics: metrics)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await withRetry(maxAttempts: 3) {
            try await URLSession.shared.data(for: request)
        }
        let httpResponse = response as? HTTPURLResponse

        if let status = httpResponse?.statusCode, status >= 400 {
            let decoded = try? JSONDecoder().decode(HealthMetricsResponse.self, from: data)
            throw NSError(
                domain: "HealthSync",
                code: status,
                userInfo: [NSLocalizedDescriptionKey: decoded?.error ?? "HTTP \(status)"]
            )
        }

        return try JSONDecoder().decode(HealthMetricsResponse.self, from: data)
    }
}

extension Array {
    func chunked(size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

/// Simple retry with exponential backoff for transient network failures
func withRetry<T>(
    maxAttempts: Int = 3,
    initialDelay: TimeInterval = 1.0,
    operation: () async throws -> T
) async throws -> T {
    var lastError: Error?
    for attempt in 0..<maxAttempts {
        do {
            return try await operation()
        } catch {
            lastError = error
            let isTransient = (error as NSError).domain == NSURLErrorDomain
            if !isTransient || attempt == maxAttempts - 1 { throw error }
            let delay = initialDelay * pow(2.0, Double(attempt))
            try await Task.sleep(for: .seconds(delay))
        }
    }
    throw lastError!
}
