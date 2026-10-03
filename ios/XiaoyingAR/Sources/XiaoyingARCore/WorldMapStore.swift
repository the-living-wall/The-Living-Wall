import Foundation

public enum WorldMapStoreError: Error, Equatable {
    case missing
    case invalid
}

/// Small, testable local store used by the ARKit adapter. It never sends map
/// data over the network; the host app chooses a private Application Support
/// URL when constructing it.
public struct WorldMapDataStore: Sendable {
    public let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public func save(_ data: Data) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: fileURL, options: [.atomic])
    }

    public func load() throws -> Data {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { throw WorldMapStoreError.missing }
        do {
            let data = try Data(contentsOf: fileURL)
            guard !data.isEmpty else { throw WorldMapStoreError.invalid }
            return data
        } catch let error as WorldMapStoreError {
            throw error
        } catch {
            throw WorldMapStoreError.invalid
        }
    }

    public func remove() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }
}

#if canImport(ARKit)
import ARKit

/// Secure-coding adapter around ARWorldMap. The map remains local to the host
/// app and a corrupt archive is reported as a recoverable restore failure.
public struct ARWorldMapStore {
    private let dataStore: WorldMapDataStore

    public init(fileURL: URL) {
        dataStore = WorldMapDataStore(fileURL: fileURL)
    }

    public func save(_ worldMap: ARWorldMap) throws {
        let data = try NSKeyedArchiver.archivedData(withRootObject: worldMap, requiringSecureCoding: true)
        try dataStore.save(data)
    }

    public func load() throws -> ARWorldMap {
        let data = try dataStore.load()
        guard let worldMap = try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data) else {
            throw WorldMapStoreError.invalid
        }
        return worldMap
    }

    public func remove() throws {
        try dataStore.remove()
    }
}
#endif
