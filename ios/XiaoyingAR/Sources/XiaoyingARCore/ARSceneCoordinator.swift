#if canImport(ARKit)
import ARKit
import SceneKit
import UIKit

public final class ARSceneCoordinator: NSObject, ARSCNViewDelegate, ARSessionDelegate {
    public let sceneView: ARSCNView
    public private(set) var anchor: ARAnchor?
    public var onEvent: ((XiaoyingAREvent) -> Void)?
    private var previousPosition: SIMD3<Float>?
    private var previousTime: TimeInterval?
    private var lastMotionTime: TimeInterval = 0
    private var lastEventTime: TimeInterval = 0
    private var wasMoving = false

    public init(sceneView: ARSCNView) {
        self.sceneView = sceneView
        super.init()
        sceneView.delegate = self
        // Rendering and frame updates use separate delegates. Without this
        // registration, the motion-to-voice callback is never delivered.
        sceneView.session.delegate = self
    }

    public func start() {
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration(); configuration.planeDetection = [.horizontal, .vertical]; sceneView.session.run(configuration)
    }

    public func place(at query: ARRaycastQuery) {
        guard let result = sceneView.session.raycast(query).first else { return }
        if let anchor { sceneView.session.remove(anchor: anchor) }
        let newAnchor = ARAnchor(name: "xiaoying", transform: result.worldTransform)
        anchor = newAnchor; sceneView.session.add(anchor: newAnchor); onEvent?(.placed)
    }

    @objc public func tapped(_ recognizer: UITapGestureRecognizer) {
        let point = recognizer.location(in: sceneView)
        guard let query = sceneView.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .horizontal) else { return }
        place(at: query)
    }

    public func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard anchor.name == "xiaoying" else { return nil }
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
        guard anchor != nil, case .normal = frame.camera.trackingState else {
            previousPosition = nil; previousTime = nil; return
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
