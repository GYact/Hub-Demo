import Foundation

enum HubAPI {
    static let supabaseURL = "https://oxzzdkwvjdxpgdnrbflq.supabase.co"
    static let healthMetricsEndpoint = "\(supabaseURL)/functions/v1/log_health_metrics"
}

struct MetricDef {
    let healthKitId: String
    let metricType: String
    let unit: String

    static let all: [MetricDef] = [
        MetricDef(healthKitId: "HKQuantityTypeIdentifierHeartRate", metricType: "heart_rate", unit: "bpm"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierRestingHeartRate", metricType: "resting_heart_rate", unit: "bpm"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", metricType: "hrv", unit: "ms"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierOxygenSaturation", metricType: "blood_oxygen", unit: "%"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierStepCount", metricType: "steps", unit: "count"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierActiveEnergyBurned", metricType: "active_energy", unit: "kcal"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierBasalEnergyBurned", metricType: "basal_energy", unit: "kcal"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierBodyMass", metricType: "weight", unit: "kg"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierBodyTemperature", metricType: "body_temperature", unit: "degC"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierVO2Max", metricType: "vo2_max", unit: "mL/kg/min"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierRespiratoryRate", metricType: "respiratory_rate", unit: "count/min"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierEnvironmentalAudioExposure", metricType: "noise_level", unit: "dBASPL"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierAppleWalkingSteadiness", metricType: "walking_steadiness", unit: "%"),
        MetricDef(healthKitId: "HKQuantityTypeIdentifierAppleSleepingWristTemperature", metricType: "sleeping_wrist_temp", unit: "degC"),
        MetricDef(healthKitId: "HKCategoryTypeIdentifierMindfulSession", metricType: "mindfulness", unit: "min"),
    ]
}

enum KeychainKeys {
    static let webhookToken = "hub.health.webhook-token"
    static let relayAuthToken = "hub.relay.auth-token"
}

enum RelayConfig {
    static let baseURL = ""
    static let authToken = ""
}

enum UserDefaultsKeys {
    static let relayBaseURL = "hub.relay.base-url"
    static let lastSyncDate = "hub.health.last-sync"
    static let pendingNotificationTask = "hub.pending-notification-task"
    static let initialSyncHours = "hub.health.initial-sync-hours"
}
