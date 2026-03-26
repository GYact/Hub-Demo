import Foundation
import HealthKit
import os.log

private let logger = Logger(subsystem: "com.gyact.hub.health", category: "HealthKit")

@Observable
final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private(set) var isAuthorized = false
    private(set) var latestValues: [String: (Double, Date)] = [:]
    private(set) var backgroundDeliveryEnabled = false

    private let quantityTypes: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
        (.heartRate, "heart_rate", HKUnit.count().unitDivided(by: .minute())),
        (.restingHeartRate, "resting_heart_rate", HKUnit.count().unitDivided(by: .minute())),
        (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli)),
        (.oxygenSaturation, "blood_oxygen", .percent()),
        (.stepCount, "steps", .count()),
        (.activeEnergyBurned, "active_energy", .kilocalorie()),
        (.basalEnergyBurned, "basal_energy", .kilocalorie()),
        (.bodyMass, "weight", .gramUnit(with: .kilo)),
        (.bodyTemperature, "body_temperature", .degreeCelsius()),
        (.vo2Max, "vo2_max", HKUnit(from: "mL/kg*min")),
        (.respiratoryRate, "respiratory_rate", HKUnit.count().unitDivided(by: .minute())),
        (.environmentalAudioExposure, "noise_level", .decibelAWeightedSoundPressureLevel()),
        (.appleWalkingSteadiness, "walking_steadiness", .percent()),
        (.appleSleepingWristTemperature, "sleeping_wrist_temp", .degreeCelsius()),
    ]

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        let readTypes: Set<HKSampleType> = Set(
            quantityTypes.map { HKQuantityType($0.0) }
        ).union([HKCategoryType(.sleepAnalysis), HKCategoryType(.mindfulSession)])

        try await store.requestAuthorization(toShare: [], read: readTypes)
        isAuthorized = true
    }

    /// Fetch all metric types from the last `hours` hours
    func fetchAllMetrics(hours: Double = 24) async -> [HealthMetricPayload] {
        let since = Date().addingTimeInterval(-hours * 3600)
        var metrics: [HealthMetricPayload] = []

        for (typeId, metricType, unit) in quantityTypes {
            let samples = await fetchQuantitySamples(typeId: typeId, since: since)
            for sample in samples {
                let value = sample.quantity.doubleValue(for: unit)
                let payload = HealthMetricPayload(
                    metricType: metricType,
                    value: value,
                    unit: MetricDef.all.first { $0.metricType == metricType }?.unit ?? "unknown",
                    recordedAt: sample.startDate
                )
                metrics.append(payload)
            }
        }

        // Sleep
        let sleepHours = await fetchSleepHours(since: since)
        if let sleep = sleepHours {
            metrics.append(HealthMetricPayload(
                metricType: "sleep_analysis",
                value: sleep.hours,
                unit: "hr",
                recordedAt: sleep.date
            ))
        }

        // Mindfulness
        if let mind = await fetchMindfulnessMinutes(since: since) {
            metrics.append(HealthMetricPayload(
                metricType: "mindfulness",
                value: mind.minutes,
                unit: "min",
                recordedAt: mind.date
            ))
        }

        return metrics
    }

    /// Fetch latest value for each metric type (for dashboard display)
    func refreshLatestValues() async {
        for (typeId, metricType, unit) in quantityTypes {
            if let sample = await fetchLatestSample(typeId: typeId) {
                let value = sample.quantity.doubleValue(for: unit)
                latestValues[metricType] = (value, sample.startDate)
            }
        }

        // Sleep: today's total
        let todayStart = Calendar.current.startOfDay(for: .now)
        if let sleep = await fetchSleepHours(since: todayStart) {
            latestValues["sleep_analysis"] = (sleep.hours, sleep.date)
        }

        // Mindfulness: today's total
        if let mind = await fetchMindfulnessMinutes(since: todayStart) {
            latestValues["mindfulness"] = (mind.minutes, mind.date)
        }
    }

    // MARK: - Private

    private func fetchQuantitySamples(
        typeId: HKQuantityTypeIdentifier,
        since: Date
    ) async -> [HKQuantitySample] {
        let type = HKQuantityType(typeId)
        let predicate = HKQuery.predicateForSamples(withStart: since, end: .now)
        let sortDescriptor = SortDescriptor(\HKQuantitySample.startDate, order: .reverse)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: type, predicate: predicate)],
            sortDescriptors: [sortDescriptor],
            limit: 100
        )

        do {
            return try await descriptor.result(for: store)
        } catch {
            logger.error("Failed to fetch \(typeId.rawValue): \(error.localizedDescription)")
            return []
        }
    }

    private func fetchLatestSample(typeId: HKQuantityTypeIdentifier) async -> HKQuantitySample? {
        let type = HKQuantityType(typeId)
        let sortDescriptor = SortDescriptor(\HKQuantitySample.startDate, order: .reverse)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: type)],
            sortDescriptors: [sortDescriptor],
            limit: 1
        )

        do {
            return try await descriptor.result(for: store).first
        } catch {
            return nil
        }
    }

    private func fetchSleepHours(since: Date) async -> (hours: Double, date: Date)? {
        let type = HKCategoryType(.sleepAnalysis)
        let predicate = HKQuery.predicateForSamples(withStart: since, end: .now)
        let sortDescriptor = SortDescriptor(\HKCategorySample.startDate, order: .reverse)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: predicate)],
            sortDescriptors: [sortDescriptor]
        )

        do {
            let samples = try await descriptor.result(for: store)
            let asleepSamples = samples.filter { sample in
                let val = HKCategoryValueSleepAnalysis(rawValue: sample.value)
                return val == .asleepCore || val == .asleepDeep || val == .asleepREM
            }
            guard !asleepSamples.isEmpty else { return nil }
            let totalSeconds = asleepSamples.reduce(0.0) {
                $0 + $1.endDate.timeIntervalSince($1.startDate)
            }
            let latestDate = asleepSamples.first?.endDate ?? .now
            return (totalSeconds / 3600.0, latestDate)
        } catch {
            return nil
        }
    }

    /// Register background delivery for all types
    func enableBackgroundDelivery() {
        var successCount = 0
        var totalCount = 0

        for (typeId, _, _) in quantityTypes {
            totalCount += 1
            let type = HKQuantityType(typeId)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { success, error in
                if success { successCount += 1 }
                if let error {
                    logger.error("BG delivery error for \(typeId.rawValue): \(error.localizedDescription)")
                }
            }
        }

        for catType in [HKCategoryType(.sleepAnalysis), HKCategoryType(.mindfulSession)] {
            totalCount += 1
            store.enableBackgroundDelivery(for: catType, frequency: .hourly) { success, error in
                if success { successCount += 1 }
                if let error {
                    logger.error("BG delivery error for \(catType.identifier): \(error.localizedDescription)")
                }
            }
        }

        backgroundDeliveryEnabled = true
        logger.info("Background delivery registered for \(totalCount) types")
    }

    private func fetchMindfulnessMinutes(since: Date) async -> (minutes: Double, date: Date)? {
        let type = HKCategoryType(.mindfulSession)
        let predicate = HKQuery.predicateForSamples(withStart: since, end: .now)
        let sortDescriptor = SortDescriptor(\HKCategorySample.startDate, order: .reverse)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: predicate)],
            sortDescriptors: [sortDescriptor]
        )

        do {
            let samples = try await descriptor.result(for: store)
            guard !samples.isEmpty else { return nil }
            let totalSeconds = samples.reduce(0.0) {
                $0 + $1.endDate.timeIntervalSince($1.startDate)
            }
            return (totalSeconds / 60.0, samples.first?.endDate ?? .now)
        } catch {
            logger.error("Failed to fetch mindfulness: \(error.localizedDescription)")
            return nil
        }
    }
}
