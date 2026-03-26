import SwiftUI

struct HealthDashboardView: View {
    private let healthKit = HealthKitManager.shared
    private let syncService = HealthSyncService.shared

    private let metricCards: [(String, String, String, Color)] = [
        ("heart_rate", "heart.fill", "bpm", .red),
        ("resting_heart_rate", "heart.circle", "bpm", .pink),
        ("hrv", "waveform.path.ecg", "ms", .purple),
        ("blood_oxygen", "lungs.fill", "%", .blue),
        ("steps", "figure.walk", "歩", .green),
        ("active_energy", "flame.fill", "kcal", .orange),
        ("basal_energy", "bolt.fill", "kcal", .indigo),
        ("sleep_analysis", "bed.double.fill", "時間", .indigo),
        ("weight", "scalemass.fill", "kg", .teal),
        ("vo2_max", "wind", "mL/kg/min", .cyan),
        ("noise_level", "ear.fill", "dB", .yellow),
        ("walking_steadiness", "figure.walk.motion", "%", .mint),
        ("sleeping_wrist_temp", "thermometer.medium", "°C", .brown),
        ("mindfulness", "brain.head.profile", "分", Color(red: 0.5, green: 0.3, blue: 0.7)),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Sync status card
                    syncStatusCard
                        .padding(.horizontal)

                    // Metrics grid
                    LazyVGrid(columns: [.init(.flexible(), spacing: 12), .init(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(metricCards, id: \.0) { (type, icon, unit, color) in
                            MetricCard(
                                icon: icon,
                                label: displayName(type),
                                value: healthKit.latestValues[type]?.0,
                                unit: unit,
                                date: healthKit.latestValues[type]?.1,
                                color: color
                            )
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Health")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await healthKit.refreshLatestValues()
                            await syncService.sync()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(syncService.isSyncing)
                }
            }
            .task {
                await healthKit.refreshLatestValues()
            }
        }
    }

    private var syncStatusCard: some View {
        HStack(spacing: 12) {
            if syncService.isSyncing {
                ProgressView()
                    .controlSize(.small)
                Text("同期中...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if let error = syncService.lastError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if let date = syncService.lastSyncDate {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text("最終同期")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(date.formatted(.relative(presentation: .named)))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                Image(systemName: "info.circle")
                    .foregroundStyle(.secondary)
                Text("Settingsでトークンを設定してください")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let count = syncService.lastSyncCount as Int?, count > 0 {
                Text("\(count)件")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.quaternary)
                    .clipShape(Capsule())
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func displayName(_ type: String) -> String {
        switch type {
        case "heart_rate": return "Heart Rate"
        case "resting_heart_rate": return "Resting HR"
        case "hrv": return "HRV"
        case "blood_oxygen": return "SpO₂"
        case "steps": return "Steps"
        case "active_energy": return "Active Cal"
        case "basal_energy": return "Basal Cal"
        case "sleep_analysis": return "Sleep"
        case "weight": return "Weight"
        case "vo2_max": return "VO₂ Max"
        case "noise_level": return "Noise"
        case "walking_steadiness": return "Steadiness"
        case "sleeping_wrist_temp": return "Wrist Temp"
        case "mindfulness": return "Mindful"
        default: return type
        }
    }
}

private struct MetricCard: View {
    let icon: String
    let label: String
    let value: Double?
    let unit: String
    let date: Date?
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
            }

            if let value {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(formatValue(value))
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(.primary)
                    Text(unit)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.tertiary)
                }
            } else {
                Text("--")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.quaternary)
            }

            if let date {
                Text(date.formatted(.relative(presentation: .named)))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.background)
                .shadow(color: .black.opacity(0.06), radius: 8, y: 4)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(color.opacity(0.15), lineWidth: 1)
        }
    }

    private func formatValue(_ v: Double) -> String {
        if v >= 10000 { return String(format: "%.0f", v) }
        if v >= 100 { return String(format: "%.0f", v) }
        if v >= 10 { return String(format: "%.1f", v) }
        return String(format: "%.1f", v)
    }
}
