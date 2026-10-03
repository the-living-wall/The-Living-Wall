import Foundation

public enum XiaoyingAREvent { case placed, relocalizing, restored, mapSaved, restoreFailed, invited, moved, tilted, startled, settled, resting }

/// Event-level policy is independent of ARKit and audio availability.
public final class VoiceInteraction {
    private var lastPlayed: [XiaoyingPhoneme: Date] = [:]
    private var protectedUntil = Date.distantPast
    private var protectedPriority = 0
    private var seed: UInt64
    public private(set) var isResting = false

    public init(seed: UInt64 = 42) { self.seed = seed }

    public func gesture(for event: XiaoyingAREvent, at time: Date) -> VocalGesture? {
        let phonemes: [XiaoyingPhoneme]
        switch event {
        // Map lifecycle is operational state, not a vocal interaction or wake.
        case .relocalizing, .restored, .mapSaved, .restoreFailed: return nil
        case .placed: phonemes = [.curiosity]
        case .invited: phonemes = [.curiosity, .invite]
        case .moved: phonemes = [.relocate]
        case .tilted: phonemes = [.curiosity]
        case .startled: phonemes = [.startle]
        case .settled: phonemes = [.settle, .comfort]
        case .resting: phonemes = [.sleep]
        }
        // Only an explicit invitation or placement wakes the creature.
        if isResting {
            guard event == .invited || event == .placed else { return nil }
        }
        let priority = phonemes.compactMap { XiaoyingCatalog.definitions[$0]?.priority }.max() ?? 0
        guard time >= protectedUntil || priority >= protectedPriority || isResting else { return nil }
        guard phonemes.allSatisfy({ phoneme in
            guard let previous = lastPlayed[phoneme] else { return true }
            return time.timeIntervalSince(previous) >= (XiaoyingCatalog.definitions[phoneme]?.cooldown ?? 0)
        }) else { return nil }
        guard let gesture = GestureComposer.compose(phonemes, seed: seed) else { return nil }
        seed &+= 1
        for phoneme in phonemes { lastPlayed[phoneme] = time }
        protectedPriority = priority
        protectedUntil = time.addingTimeInterval(gesture.duration)
        isResting = event == .resting
        return gesture
    }
}
