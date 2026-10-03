#if canImport(SwiftUI) && canImport(ARKit)
import SwiftUI
import ARKit
import SceneKit

public struct XiaoyingARView: UIViewRepresentable {
    private let coordinator: ARSceneCoordinator

    public init(onEvent: ((XiaoyingAREvent) -> Void)? = nil, worldMapStore: ARWorldMapStore? = nil) {
        let view = ARSCNView(frame: .zero)
        coordinator = ARSceneCoordinator(sceneView: view, worldMapStore: worldMapStore)
        coordinator.onEvent = onEvent
    }

    public func makeUIView(context: Context) -> ARSCNView {
        coordinator.sceneView.addGestureRecognizer(UITapGestureRecognizer(target: coordinator, action: #selector(ARSceneCoordinator.tapped(_:))))
        if let store = coordinator.configuredWorldMapStore { coordinator.start(restoring: store) }
        else { coordinator.start() }
        return coordinator.sceneView
    }
    public static func dismantleUIView(_ view: ARSCNView, coordinator: ()) { view.session.pause() }
    public func updateUIView(_ view: ARSCNView, context: Context) {}
}
#endif
