#if canImport(AVFoundation)
import AVFoundation

public final class LocalVoiceEngine: XiaoyingVoiceEngine {
    public var isMuted = false
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let pitch = AVAudioUnitTimePitch()
    private let eq = AVAudioUnitEQ(numberOfBands: 1)
    private var ready = false

    public init() {
        engine.attach(player); engine.attach(pitch); engine.attach(eq)
        engine.connect(player, to: pitch, format: nil); engine.connect(pitch, to: eq, format: nil); engine.connect(eq, to: engine.mainMixerNode, format: nil)
    }

    public func preload() async {
        do { try engine.start(); ready = true } catch { ready = false }
    }

    public func play(_ gesture: VocalGesture, at time: Date) {
        guard ready, !isMuted else { return }
        pitch.pitch = Float(gesture.pitchSemitones * 100)
        eq.bands[0].frequency = 1000; eq.bands[0].bandwidth = 1.2; eq.bands[0].gain = Float((gesture.brightness - 0.5) * 4); eq.bands[0].bypass = false
        // Audio buffers are injected by the app's asset loader; no text or network TTS is used here.
    }

    public func interrupt(lowerPriorityThan priority: Int) { player.stop() }
    public func stop() { player.stop(); engine.stop(); ready = false }
}
#endif
