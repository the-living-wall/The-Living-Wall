#if canImport(AVFoundation)
import AVFoundation

public final class LocalVoiceEngine: XiaoyingVoiceEngine {
    public var isMuted = false
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let pitch = AVAudioUnitTimePitch()
    private let eq = AVAudioUnitEQ(numberOfBands: 1)
    private let bundle: Bundle
    private var buffers: [XiaoyingPhoneme: [AVAudioPCMBuffer]] = [:]
    private var ready = false

    public init(bundle: Bundle = .main) {
        self.bundle = bundle
        engine.attach(player); engine.attach(pitch); engine.attach(eq)
        engine.connect(player, to: pitch, format: nil); engine.connect(pitch, to: eq, format: nil); engine.connect(eq, to: engine.mainMixerNode, format: nil)
    }

    public func preload() async {
        for phoneme in XiaoyingPhoneme.allCases {
            var loaded: [AVAudioPCMBuffer] = []
            // The creator may approve several nuanced takes for one phoneme.
            // Keep the pool bounded for memory and predictable randomness.
            for index in 1...8 {
                guard let url = bundle.url(forResource: "\(phoneme.rawValue)_\(String(format: "%02d", index))", withExtension: "wav"),
                      let file = try? AVAudioFile(forReading: url),
                      let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { continue }
                do { try file.read(into: buffer); loaded.append(buffer) } catch { continue }
            }
            buffers[phoneme] = loaded
        }
        do { try engine.start(); ready = true } catch { ready = false }
    }

    public func play(_ gesture: VocalGesture, at time: Date) {
        guard ready, !isMuted, !gesture.phonemes.isEmpty else { return }
        pitch.pitch = Float(gesture.pitchSemitones * 100)
        eq.bands[0].frequency = 1000; eq.bands[0].bandwidth = 1.2; eq.bands[0].gain = Float((gesture.brightness - 0.5) * 4); eq.bands[0].bypass = false
        player.stop()
        schedule(gesture.phonemes, index: 0)
    }

    private func schedule(_ phonemes: [XiaoyingPhoneme], index: Int) {
        guard index < phonemes.count, let buffer = buffers[phonemes[index]]?.randomElement() else { return }
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async { self?.schedule(phonemes, index: index + 1) }
        }
        if !player.isPlaying { player.play() }
    }

    public func interrupt(lowerPriorityThan priority: Int) { player.stop() }
    public func stop() { player.stop(); engine.stop(); ready = false }
}
#endif
