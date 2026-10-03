#if canImport(AVFoundation)
import AVFoundation

public final class LocalVoiceEngine: XiaoyingVoiceEngine {
    public var isMuted = false { didSet { if isMuted { cancelPlayback() } } }
    public var volume: Float = 0.5 { didSet { player.volume = min(1, max(0, volume)) } }
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let pitch = AVAudioUnitTimePitch()
    private let eq = AVAudioUnitEQ(numberOfBands: 1)
    private let bundle: Bundle
    private var buffers: [XiaoyingPhoneme: [AVAudioPCMBuffer]] = [:]
    private var ready = false
    private var playbackID: UInt64 = 0
    private var currentPriority = 0

    public init(bundle: Bundle? = nil) {
        #if SWIFT_PACKAGE
        self.bundle = bundle ?? .module
        #else
        self.bundle = bundle ?? .main
        #endif
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
        guard !player.isPlaying || gesture.priority >= currentPriority else { return }
        cancelPlayback()
        currentPriority = gesture.priority
        player.volume = min(1, max(0, volume))
        pitch.pitch = Float(gesture.pitchSemitones * 100)
        eq.bands[0].frequency = 1000; eq.bands[0].bandwidth = 1.2; eq.bands[0].gain = Float((gesture.brightness - 0.5) * 4); eq.bands[0].bypass = false
        schedule(gesture.phonemes, index: 0, seed: gesture.variantSeed, id: playbackID)
    }

    private func schedule(_ phonemes: [XiaoyingPhoneme], index: Int, seed: UInt64, id: UInt64) {
        guard id == playbackID, !isMuted else { return }
        guard index < phonemes.count else { currentPriority = 0; return }
        guard let pool = buffers[phonemes[index]], !pool.isEmpty else {
            schedule(phonemes, index: index + 1, seed: seed, id: id)
            return
        }
        let buffer = pool[Int((seed &+ UInt64(index)) % UInt64(pool.count))]
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async { self?.schedule(phonemes, index: index + 1, seed: seed, id: id) }
        }
        if !player.isPlaying { player.play() }
    }

    private func cancelPlayback() { playbackID &+= 1; player.stop(); currentPriority = 0 }
    public func interrupt(lowerPriorityThan priority: Int) { if currentPriority < priority { cancelPlayback() } }
    public func stop() { cancelPlayback(); engine.stop(); ready = false }
}
#endif
