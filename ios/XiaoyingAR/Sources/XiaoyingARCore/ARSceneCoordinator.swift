#if canImport(ARKit)
import ARKit
import SceneKit

public enum XiaoyingAREvent { case placed, invited, moved, tilted, startled, settled, resting }

public final class ARSceneCoordinator: NSObject, ARSCNViewDelegate {
    public let sceneView: ARSCNView
    public private(set) var anchor: ARAnchor?
    public var onEvent: ((XiaoyingAREvent) -> Void)?

    public init(sceneView: ARSCNView) { self.sceneView = sceneView; super.init(); sceneView.delegate = self }

    public func start() {
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]; sceneView.session.run(configuration)
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
