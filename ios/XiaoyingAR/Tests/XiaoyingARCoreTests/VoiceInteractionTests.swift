import XCTest
@testable import XiaoyingARCore

final class VoiceInteractionTests: XCTestCase {
    let time = Date(timeIntervalSince1970: 100)
    func testCooldownAndPriority() {
        let interaction = VoiceInteraction()
        XCTAssertNotNil(interaction.gesture(for: .invited, at: time))
        XCTAssertNil(interaction.gesture(for: .invited, at: time.addingTimeInterval(0.1)))
        XCTAssertNotNil(interaction.gesture(for: .startled, at: time.addingTimeInterval(0.2)))
        XCTAssertNil(interaction.gesture(for: .placed, at: time.addingTimeInterval(0.3)))
        XCTAssertNotNil(interaction.gesture(for: .invited, at: time.addingTimeInterval(4)))
    }
    func testRestRequiresExplicitWake() {
        let interaction = VoiceInteraction()
        XCTAssertNotNil(interaction.gesture(for: .resting, at: time))
        XCTAssertNil(interaction.gesture(for: .startled, at: time.addingTimeInterval(20)))
        XCTAssertNil(interaction.gesture(for: .settled, at: time.addingTimeInterval(21)))
        XCTAssertNotNil(interaction.gesture(for: .invited, at: time.addingTimeInterval(22)))
        XCTAssertFalse(interaction.isResting)
    }
    func testSequenceIsReproducible() {
        let a = VoiceInteraction(seed: 17), b = VoiceInteraction(seed: 17)
        for (i, event) in [XiaoyingAREvent.placed, .invited, .startled, .settled, .resting].enumerated() {
            let date = time.addingTimeInterval(Double(i) * 10)
            XCTAssertEqual(a.gesture(for: event, at: date), b.gesture(for: event, at: date))
        }
    }
}
