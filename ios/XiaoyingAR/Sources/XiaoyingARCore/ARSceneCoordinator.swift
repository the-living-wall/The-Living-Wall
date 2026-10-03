#if canImport(ARKit)
import ARKit
import SceneKit

public enum XiaoyingAREvent { case placed, restored, mapSaved, restoreFailed, invited, moved, tilted, startled, settled, resting }

public final class ARSceneCoordinator: NSObject, ARSCNViewDelegate {
    public let sceneView: ARSCNView
    public private(set) var anchor: ARAnchor?
    public var onEvent: ((XiaoyingAREvent) -> Void)?

    public init(sceneView: ARSCNView) { self.sceneView = sceneView; super.init(); sceneView.delegate = self }

    public func start() {
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]; sceneView.session.run(configuration)
    }

    /// Starts a session with a locally restored map when one is available.
    /// Failure is explicit so the host can ask the user to rescan instead of
    /// pretending that the old room position is still tracked.
    public func start(restoring store: ARWorldMapStore) {
        guard ARWorldTrackingConfiguration.isSupported else { onEvent?(.restoreFailed); return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]
        if let worldMap = try? store.load() {
            configuration.initialWorldMap = worldMap
            sceneView.session.run(configuration)
            onEvent?(.restored)
        } else {
            sceneView.session.run(configuration)
            onEvent?(.restoreFailed)
        }
    }

    /// Captures the current ARKit map without leaving the device.
    public func saveCurrentMap(to store: ARWorldMapStore, completion: @escaping (Result<Void, Error>) -> Void) {
        sceneView.session.getCurrentWorldMap { worldMap, error in
            if let error { completion(.failure(error)); return }
            guard let worldMap else { completion(.failure(WorldMapStoreError.invalid)); return }
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
        guard let result = sceneView.session.raycast(query).first else { return }
        let newAnchor = ARAnchor(transform: result.worldTransform); anchor = newAnchor; sceneView.session.add(anchor: newAnchor); onEvent?(.placed)
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let anchor else { return }
        let camera = frame.camera.transform.columns.3; let target = anchor.transform.columns.3
        let distance = hypot(camera.x - target.x, camera.z - target.z)
        if distance > 0.08 { onEvent?(.moved) }
    }
}
#endif
