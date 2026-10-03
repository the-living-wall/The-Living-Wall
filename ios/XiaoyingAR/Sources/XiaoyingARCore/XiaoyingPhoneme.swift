import Foundation

public enum XiaoyingPhoneme: String, CaseIterable, Sendable {
    case curiosity, invite, comfort, refuse, startle, remember, sleep, play, relocate, settle
}

public struct VocalGesture: Equatable, Sendable {
    public let phonemes: [XiaoyingPhoneme]
    public let duration: TimeInterval
    public let pitchSemitones: Double
    public let brightness: Double
    public let priority: Int

    public init(phonemes: [XiaoyingPhoneme], duration: TimeInterval, pitchSemitones: Double, brightness: Double, priority: Int) {
        self.phonemes = phonemes; self.duration = duration; self.pitchSemitones = pitchSemitones; self.brightness = brightness; self.priority = priority
    }
}

public struct PhonemeDefinition: Sendable {
    public let duration: ClosedRange<TimeInterval>
    public let pitch: ClosedRange<Double>
    public let cooldown: TimeInterval
    public let priority: Int
}

public enum XiaoyingCatalog {
    public static let definitions: [XiaoyingPhoneme: PhonemeDefinition] = [
        .curiosity: .init(duration: 0.28...0.9, pitch: -2...5, cooldown: 0.9, priority: 1),
        .invite: .init(duration: 0.35...1.1, pitch: -1...4, cooldown: 1.2, priority: 2),
        .comfort: .init(duration: 0.7...1.8, pitch: -4...1, cooldown: 2.2, priority: 3),
        .refuse: .init(duration: 0.25...0.8, pitch: -5...0, cooldown: 1.8, priority: 6),
        .startle: .init(duration: 0.18...0.65, pitch: 1...8, cooldown: 2.6, priority: 10),
        .remember: .init(duration: 0.8...1.9, pitch: -3...3, cooldown: 3.2, priority: 2),
        .sleep: .init(duration: 1.1...2.6, pitch: -6...(-1), cooldown: 5, priority: 7),
        .play: .init(duration: 0.25...1, pitch: 0...7, cooldown: 1, priority: 2),
        .relocate: .init(duration: 0.45...1.3, pitch: -1...6, cooldown: 1.8, priority: 5),
        .settle: .init(duration: 0.9...2.2, pitch: -5...0, cooldown: 3, priority: 8),
    ]
}

public enum GestureComposer {
    public static func compose(_ phonemes: [XiaoyingPhoneme], seed: UInt64) -> VocalGesture? {
        guard (1...3).contains(phonemes.count) else { return nil }
        var generator = SeededGenerator(seed: seed)
        let definitions = phonemes.compactMap { XiaoyingCatalog.definitions[$0] }
        let duration = definitions.reduce(0) { $0 + Double.random(in: $1.duration, using: &generator) }
        let pitch = definitions.reduce(0) { $0 + Double.random(in: $1.pitch, using: &generator) } / Double(definitions.count)
        return VocalGesture(phonemes: phonemes, duration: duration, pitchSemitones: pitch, brightness: 0.5, priority: definitions.map(\.priority).max() ?? 0)
    }
}

private struct SeededGenerator: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    mutating func next() -> UInt64 { state ^= state << 7; state ^= state >> 9; return state }
}
