import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            HealthDashboardView()
                .tabItem {
                    Label("Health", systemImage: "heart.fill")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
        }
        .tint(.indigo)
    }
}
