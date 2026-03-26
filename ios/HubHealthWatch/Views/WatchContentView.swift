import SwiftUI

struct CompanyWatchResponse: Codable {
    let task: String?
    let status: String?
    let error: String?
    let summary: String?
}

struct WatchContentView: View {
    @Binding var autoFocusInput: Bool
    @State private var taskText = ""
    @State private var isLoading = false
    @State private var result: String?
    @State private var error: String?
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Image(systemName: "brain.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.indigo)
                        .padding(.top, 8)

                    TextField("タスクを入力", text: $taskText)
                        .focused($isInputFocused)

                    Button {
                        Task { await sendTask() }
                    } label: {
                        HStack(spacing: 6) {
                            if isLoading {
                                ProgressView()
                            } else {
                                Image(systemName: "paperplane.fill")
                            }
                            Text(isLoading ? "実行中" : "送信")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.indigo)
                    .disabled(taskText.isEmpty || isLoading)

                    if let error {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption2)
                            Text(error)
                                .font(.caption2)
                        }
                        .foregroundStyle(.orange)
                    }

                    if let result {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                    .font(.caption2)
                                Text("完了")
                                    .font(.caption2.bold())
                            }
                            Text(result)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.horizontal, 2)
            }
            .navigationTitle("Hub")
            .onAppear {
                checkPendingTask()
            }
            .onChange(of: autoFocusInput) { _, shouldFocus in
                if shouldFocus {
                    autoFocusInput = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        isInputFocused = true
                    }
                }
            }
        }
    }

    /// Pick up pending task from notification reply and auto-send
    private func checkPendingTask() {
        if let pending = UserDefaults.standard.string(forKey: UserDefaultsKeys.pendingNotificationTask) {
            UserDefaults.standard.removeObject(forKey: UserDefaultsKeys.pendingNotificationTask)
            taskText = pending
            Task { await sendTask() }
        }
    }

    private func sendTask() async {
        let relayURL = RelayConfig.baseURL
        let token = RelayConfig.authToken

        isLoading = true
        error = nil
        result = nil

        do {
            let url = URL(string: "\(relayURL)/api/company/orchestrate-sync")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 300
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONEncoder().encode(["task": taskText])

            taskText = ""
            let (data, _) = try await URLSession.shared.data(for: request)
            let response = try JSONDecoder().decode(CompanyWatchResponse.self, from: data)
            result = response.summary ?? response.error ?? "完了"
            NotificationManager.shared.sendTaskComplete(summary: result ?? "完了")
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}
