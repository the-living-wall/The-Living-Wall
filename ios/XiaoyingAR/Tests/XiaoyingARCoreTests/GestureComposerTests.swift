import XCTest
@testable import XiaoyingARCore

final class GestureComposerTests: XCTestCase {
    func testSeedIsReproducible() {
        let a = GestureComposer.compose([.curiosity, .invite], seed: 42)
        XCTAssertEqual(a, GestureComposer.compose([.curiosity, .invite], seed: 42))
    }

    func testGestureSizeIsBounded() {
        XCTAssertNil(GestureComposer.compose([], seed: 1))
        XCTAssertNil(GestureComposer.compose([.curiosity, .invite, .play, .settle], seed: 1))
    }
}
