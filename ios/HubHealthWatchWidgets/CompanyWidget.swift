import WidgetKit
import SwiftUI

@main
struct CompanyWidget: Widget {
    let kind = "CompanyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CompanyTimelineProvider()) { entry in
            CompanyWidgetView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("AI Company")
        .description("AI Companyにタスクを送信")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryCorner,
            .accessoryInline,
        ])
    }
}

// MARK: - Timeline

struct CompanyTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> CompanyEntry {
        CompanyEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (CompanyEntry) -> Void) {
        completion(CompanyEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CompanyEntry>) -> Void) {
        let entry = CompanyEntry(date: .now)
        // Refresh every 30 minutes in case we add dynamic content later
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct CompanyEntry: TimelineEntry {
    let date: Date
}

// MARK: - Views

struct CompanyWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: CompanyEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "brain.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .widgetURL(URL(string: "hubhealth://company"))

        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "brain.fill")
                    .font(.title3)
                    .widgetAccentable()
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI Company")
                        .font(.headline)
                    Text("タスクを送信")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .widgetURL(URL(string: "hubhealth://company"))

        case .accessoryCorner:
            Image(systemName: "brain.fill")
                .font(.system(size: 20, weight: .semibold))
                .widgetLabel("Hub")

        case .accessoryInline:
            Label("AI Company", systemImage: "brain.fill")

        default:
            Image(systemName: "brain.fill")
        }
    }
}

#Preview(as: .accessoryCircular) {
    CompanyWidget()
} timeline: {
    CompanyEntry(date: .now)
}
