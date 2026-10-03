import Foundation
import XCTest
@testable import XiaoyingARCore

final class WorldMapStoreTests: XCTestCase {
    private func makeStore() throws -> WorldMapDataStore {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        return WorldMapDataStore(fileURL: directory.appendingPathComponent("world-map.archive"))
    }

    func testSaveLoadAndRemoveStayLocal() throws {
        let store = try makeStore()
        let data = Data([1, 2, 3, 4])
        try store.save(data)
        XCTAssertEqual(try store.load(), data)
        try store.remove()
        XCTAssertThrowsError(try store.load()) { error in
            XCTAssertEqual(error as? WorldMapStoreError, .missing)
        }
    }

    func testMissingAndEmptyArchivesAreRecoverableFailures() throws {
        let store = try makeStore()
        XCTAssertThrowsError(try store.load()) { error in
            XCTAssertEqual(error as? WorldMapStoreError, .missing)
        }
        try store.save(Data())
        XCTAssertThrowsError(try store.load()) { error in
            XCTAssertEqual(error as? WorldMapStoreError, .invalid)
        }
    }
}
