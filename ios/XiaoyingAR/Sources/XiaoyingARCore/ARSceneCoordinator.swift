#if canImport(ARKit)
import ARKit
import SceneKit

public enum XiaoyingAREvent { case placed, relocalizing, restored, mapSaved, restoreFailed, invited, moved, tilted, startled, settled, resting }

public final class ARSceneCoordinator: NSObject, ARSCNViewDelegate {
    public let sceneView: ARSCNView
    public private(set) var anchor: ARAnchor?
    public var onEvent: ((XiaoyingAREvent) -> Void)?
    private static let homeAnchorName = "xiaoying-home"
    private var pendingAnchorID: UUID?
    private var restoreStartedAt: TimeInterval?

    public init(sceneView: ARSCNView) { self.sceneView = sceneView; super.init(); sceneView.delegate = self }

    public func start() {
        anchor = nil; pendingAnchorID = nil; restoreStartedAt = nil
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]; sceneView.session.run(configuration)
    }

    /// Starts a session with a locally restored map when one is available.
    /// Failure is explicit so the host can ask the user to rescan instead of
    /// pretending that the old room position is still tracked.
    public func start(restoring store: ARWorldMapStore) {
        anchor = nil; pendingAnchorID = nil; restoreStartedAt = nil
        guard ARWorldTrackingConfiguration.isSupported else { onEvent?(.restoreFailed); return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]
        if let worldMap = try? store.load(),
           let savedAnchor = worldMap.anchors.first(where: { $0.name == Self.homeAnchorName }) {
            configuration.initialWorldMap = worldMap
            pendingAnchorID = savedAnchor.identifier
            restoreStartedAt = ProcessInfo.processInfo.systemUptime
            sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            onEvent?(.relocalizing)
        } else {
            sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            onEvent?(.restoreFailed)
        }
    }

    /// Captures the current ARKit map without leaving the device.
    public func saveCurrentMap(to store: ARWorldMapStore, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let homeID = anchor?.identifier, let frame = sceneView.session.currentFrame,
              case .normal = frame.camera.trackingState,
              frame.worldMappingStatus == .mapped || frame.worldMappingStatus == .extending else {
            completion(.failure(WorldMapStoreError.invalid)); return
        }
        sceneView.session.getCurrentWorldMap { worldMap, error in
            if let error { completion(.failure(error)); return }
            guard let worldMap, worldMap.anchors.contains(where: { $0.identifier == homeID }) else {
                completion(.failure(WorldMapStoreError.invalid)); return
            }
            do {
                try store.save(worldMap)
                self.onEvent?(.mapSaved)
                completion(.success(()))
            } catch {
                completion(.failure(error))
            }
        }
    }

    public func place(at query: ARRaycastQuery) {
        guard pendingAnchorID == nil else { return }
        guard let result = sceneView.session.raycast(query).first else { return }
        if let anchor { sceneView.session.remove(anchor: anchor) }
        let newAnchor = ARAnchor(name: Self.homeAnchorName, transform: result.worldTransform); anchor = newAnchor; sceneView.session.add(anchor: newAnchor); onEvent?(.placed)
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        if let pendingID = pendingAnchorID {
            if case .normal = frame.camera.trackingState,
               let restoredAnchor = frame.anchors.first(where: { $0.identifier == pendingID }) {
                anchor = restoredAnchor
                pendingAnchorID = nil; restoreStartedAt = nil
                onEvent?(.restored)
            } else if let started = restoreStartedAt,
                      ProcessInfo.processInfo.systemUptime - started > 30 {
                pendingAnchorID = nil; restoreStartedAt = nil; anchor = nil
                let configuration = ARWorldTrackingConfiguration()
                configuration.planeDetection = [.horizontal, .vertical]
                session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
                onEvent?(.restoreFailed)
            }
            return
        }
        guard case .normal = frame.camera.trackingState else { return }
        guard let anchor else { return }
        let camera = frame.camera.transform.columns.3; let target = anchor.transform.columns.3
        let distance = hypot(camera.x - target.x, camera.z - target.z)
        if distance > 0.08 { onEvent?(.moved) }
    }
}
#endif
