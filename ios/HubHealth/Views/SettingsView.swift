import SwiftUI

struct SettingsView: View {
    @ObservedObject private var watchSync = WatchSyncManager.shared
    @State private var webhookToken: String = KeychainHelper.load(KeychainKeys.webhookToken) ?? ""
    @State private var relayToken: String = KeychainHelper.load(KeychainKeys.relayAuthToken) ?? ""
    @State private var relayURL: String = UserDefaults.standard.string(forKey: UserDefaultsKeys.relayBaseURL) ?? ""
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Webhook Token", systemImage: "key.fill")
                            .font(.subheadline.bold())
                        TextField("UUID token", text: $webhookToken)
                            .textContentType(.none)
                            .autocorrectionDisabled()
                            .font(.system(.caption, design: .monospaced))
                            .padding(10)
                            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                    }
                } header: {
                    Text("Health Metrics")
                } footer: {
                    Text("Hub の Settings 画面 または curl で取得できます")
                }

                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Relay URL", systemImage: "network")
                            .font(.subheadline.bold())
                        TextField("https://...:3100", text: $relayURL)
                            .textContentType(.URL)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .font(.system(.caption, design: .monospaced))
                            .padding(10)
                            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Label("Auth Token", systemImage: "lock.fill")
                            .font(.subheadline.bold())
                        SecureField("Token", text: $relayToken)
                            .font(.system(.caption, design: .monospaced))
                            .padding(10)
                            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                    }


                    Button {
                        WatchSyncManager.shared.sendSettingsToWatch()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "applewatch.and.arrow.forward")
                            Text("Watchに同期")
                        }
                    }
                    .disabled(relayURL.isEmpty || relayToken.isEmpty)

                    if let status = WatchSyncManager.shared.lastSyncStatus {
                        Text(status)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Claude Code Relay")
                } footer: {
                    Text("Watch の AI Company で使用します")
                }

                Section {
                    Button {
                        save()
                    } label: {
                        HStack {
                            Spacer()
                            Image(systemName: saved ? "checkmark.circle.fill" : "square.and.arrow.down")
                                .foregroundStyle(saved ? .green : .accentColor)
                            Text(saved ? "保存しました" : "保存")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                    }
                }

                Section("Sync Status") {
                    let sync = HealthSyncService.shared
                    let hk = HealthKitManager.shared
                    LabeledContent("最終同期") {
                        if let date = sync.lastSyncDate {
                            Text(date.formatted(.dateTime.month().day().hour().minute()))
                                .font(.caption)
                        } else {
                            Text("未同期")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    LabeledContent("前回の件数") {
                        Text("\(sync.lastSyncCount) 件")
                            .font(.caption)
                    }
                    LabeledContent("BG Delivery") {
                        Image(systemName: hk.backgroundDeliveryEnabled ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundStyle(hk.backgroundDeliveryEnabled ? .green : .secondary)
                    }
                    if let error = sync.lastError {
                        LabeledContent("エラー") {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }

                Section {
                    HStack {
                        Spacer()
                        VStack(spacing: 4) {
                            Text("Hub Health")
                                .font(.caption.bold())
                            Text("v1.1")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        Spacer()
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func save() {
        if !webhookToken.isEmpty {
            KeychainHelper.save(webhookToken, for: KeychainKeys.webhookToken)
        }
        if !relayToken.isEmpty {
            KeychainHelper.save(relayToken, for: KeychainKeys.relayAuthToken)
        }
        UserDefaults.standard.set(relayURL, forKey: UserDefaultsKeys.relayBaseURL)
        WatchSyncManager.shared.sendSettingsToWatch()
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
    }
}
