import Foundation

struct HealthMetricPayload: Codable {
    let metric_type: String
    let value: Double
    let unit: String
    let recorded_at: String
    let source: String

    init(metricType: String, value: Double, unit: String, recordedAt: Date) {
        self.metric_type = metricType
        self.value = value
        self.unit = unit
        self.recorded_at = ISO8601DateFormatter().string(from: recordedAt)
        self.source = "apple_watch"
    }
}

struct HealthMetricsBatch: Codable {
    let metrics: [HealthMetricPayload]
}

struct HealthMetricsResponse: Codable {
    let inserted: Int?
    let ids: [String]?
    let error: String?
}
