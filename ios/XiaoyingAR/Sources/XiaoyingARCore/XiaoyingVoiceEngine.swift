import Foundation

public protocol XiaoyingVoiceEngine: AnyObject {
    var isMuted: Bool { get set }
    func preload() async
    func play(_ gesture: VocalGesture, at time: Date)
    func interrupt(lowerPriorityThan priority: Int)
    func stop()
}

public final class SilentVoiceEngine: XiaoyingVoiceEngine {
    public var isMuted = false
    public init() {}
    public func preload() async {}
    public func play(_ gesture: VocalGesture, at time: Date) {}
    public func interrupt(lowerPriorityThan priority: Int) {}
    public func stop() {}
}
