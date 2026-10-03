#if canImport(SwiftUI) && canImport(ARKit)
import SwiftUI
import ARKit
import SceneKit

public struct XiaoyingARView: UIViewRepresentable {
    private let coordinator: ARSceneCoordinator

    public init(onEvent: ((XiaoyingAREvent) -> Void)? = nil) {
        let view = ARSCNView(frame: .zero)
        coordinator = ARSceneCoordinator(sceneView: view)
        coordinator.onEvent = onEvent
    }

    public func makeUIView(context: Context) -> ARSCNView { coordinator.sceneView }
    public func updateUIView(_ view: ARSCNView, context: Context) {}
}
#endif
