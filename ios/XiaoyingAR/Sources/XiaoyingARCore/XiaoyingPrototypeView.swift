#if canImport(SwiftUI) && canImport(ARKit)
import SwiftUI

@MainActor
private final class PrototypeModel: ObservableObject {
    let voice = LocalVoiceEngine()
    let interaction = VoiceInteraction()
    @Published var isMuted = false { didSet { voice.isMuted = isMuted } }
    @Published var volume = 0.5 { didSet { voice.volume = Float(volume) } }
    @Published var status = "点击桌面或床头放置小莹"

    func receive(_ event: XiaoyingAREvent) {
        if let gesture = interaction.gesture(for: event, at: Date()) { voice.play(gesture, at: Date()) }
        status = interaction.isResting ? "小莹在休息；点击邀请可以唤醒" : "小莹在这里"
    }
}

/// Host this view in an iOS App; authorized WAVs belong to its main bundle.
public struct XiaoyingPrototypeView: View {
    @StateObject private var model = PrototypeModel()
    public init() {}
    public var body: some View {
        ZStack(alignment: .bottom) {
            XiaoyingARView { event in model.receive(event) }.ignoresSafeArea()
            VStack {
                Text(model.status)
                HStack {
                    Button("邀请") { model.receive(.invited) }
                    Button("休息") { model.receive(.resting) }
                    Toggle("静音", isOn: $model.isMuted)
                }
                Slider(value: $model.volume, in: 0...1).accessibilityLabel("小莹声音音量")
            }.padding().background(.regularMaterial).cornerRadius(16).padding()
        }
        .task { await model.voice.preload() }
        .onDisappear { model.voice.stop() }
    }
}
#endif
