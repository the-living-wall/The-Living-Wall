#if canImport(ARKit)
import ARKit
import SceneKit
import UIKit

public final class ARSceneCoordinator: NSObject, ARSCNViewDelegate, ARSessionDelegate {
    public let sceneView: ARSCNView
    public private(set) var anchor: ARAnchor?
    public var onEvent: ((XiaoyingAREvent) -> Void)?
    private let worldMapStore: ARWorldMapStore?
    var configuredWorldMapStore: ARWorldMapStore? { worldMapStore }
    private static let homeAnchorName = "xiaoying-home"
    private var pendingAnchorID: UUID?
    private var restoreStartedAt: TimeInterval?
    private var previousPosition: SIMD3<Float>?
    private var previousTime: TimeInterval?
    private var lastMotionTime: TimeInterval = 0
    private var lastEventTime: TimeInterval = 0
    private var wasMoving = false
    private var saveInFlight = false
    private var hasSavedCurrentPlacement = false

    public init(sceneView: ARSCNView, worldMapStore: ARWorldMapStore? = nil) {
        self.sceneView = sceneView
        self.worldMapStore = worldMapStore
        super.init()
        sceneView.delegate = self
        sceneView.session.delegate = self
        sceneView.session.delegateQueue = .main
    }

    public func start() {
        anchor = nil; pendingAnchorID = nil; restoreStartedAt = nil
        previousPosition = nil; previousTime = nil; wasMoving = false
        saveInFlight = false; hasSavedCurrentPlacement = false
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]; sceneView.session.run(configuration)
    }

    /// Starts a session with a locally restored map when one is available.
    /// Failure is explicit so the host can ask the user to rescan instead of
    /// pretending that the old room position is still tracked.
    public func start(restoring store: ARWorldMapStore) {
        anchor = nil; pendingAnchorID = nil; restoreStartedAt = nil
        previousPosition = nil; previousTime = nil; wasMoving = false
        saveInFlight = false; hasSavedCurrentPlacement = false
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
        let newAnchor = ARAnchor(name: Self.homeAnchorName, transform: result.worldTransform)
        anchor = newAnchor
        hasSavedCurrentPlacement = false
        sceneView.session.add(anchor: newAnchor)
        onEvent?(.placed)
    }

    private func updateRestoration(_ session: ARSession, frame: ARFrame) -> Bool {
        if let pendingID = pendingAnchorID {
            if case .normal = frame.camera.trackingState,
               let restoredAnchor = frame.anchors.first(where: { $0.identifier == pendingID }) {
                anchor = restoredAnchor
                pendingAnchorID = nil; restoreStartedAt = nil; hasSavedCurrentPlacement = true
                onEvent?(.restored)
            } else if let started = restoreStartedAt,
                      ProcessInfo.processInfo.systemUptime - started > 30 {
                pendingAnchorID = nil; restoreStartedAt = nil; anchor = nil
                let configuration = ARWorldTrackingConfiguration()
                configuration.planeDetection = [.horizontal, .vertical]
                session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
                onEvent?(.restoreFailed)
            }
            return true
        }
        return false
    }

    @objc public func tapped(_ recognizer: UITapGestureRecognizer) {
        let point = recognizer.location(in: sceneView)
        guard let query = sceneView.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .horizontal) else { return }
        place(at: query)
    }

    public func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard anchor.name == Self.homeAnchorName else { return nil }
        let sphere = SCNSphere(radius: 0.025)
        sphere.firstMaterial?.diffuse.contents = UIColor.systemTeal
        sphere.firstMaterial?.emission.contents = UIColor.systemTeal.withAlphaComponent(0.3)
        let node = SCNNode(geometry: sphere)
        node.position.y = 0.025
        let breathe = SCNAction.sequence([.scale(to: 1.08, duration: 2), .scale(to: 1, duration: 2)])
        node.runAction(.repeatForever(breathe))
        return node
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        if updateRestoration(session, frame: frame) {
            previousPosition = nil; previousTime = nil; return
        }
        guard anchor != nil, case .normal = frame.camera.trackingState else {
            previousPosition = nil; previousTime = nil; return
        }
        if let worldMapStore, !hasSavedCurrentPlacement, !saveInFlight,
           frame.worldMappingStatus == .mapped || frame.worldMappingStatus == .extending {
            saveInFlight = true
            saveCurrentMap(to: worldMapStore) { [weak self] result in
                guard let self else { return }
                self.saveInFlight = false
                if case .success = result { self.hasSavedCurrentPlacement = true }
            }
        }
        let column = frame.camera.transform.columns.3
        let position = SIMD3<Float>(column.x, column.y, column.z)
        defer { previousPosition = position; previousTime = frame.timestamp }
        guard let previousPosition, let previousTime else { return }
        let elapsed = frame.timestamp - previousTime
        guard elapsed > 0, elapsed < 0.5 else { return }
        let speed = simd_distance(position, previousPosition) / Float(elapsed)
        if speed > 0.08 { lastMotionTime = frame.timestamp; wasMoving = true }
        guard frame.timestamp - lastEventTime > 1.5 else { return }
        let event: XiaoyingAREvent?
        if speed > 0.8 { event = .startled }
        else if speed > 0.08 { event = .moved }
        else if wasMoving && frame.timestamp - lastMotionTime > 2 { event = .settled; wasMoving = false }
        else { event = nil }
        if let event {
            lastEventTime = frame.timestamp
            DispatchQueue.main.async { [weak self] in self?.onEvent?(event) }
        }
    }
}
#endif
