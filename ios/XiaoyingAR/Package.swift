// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XiaoyingAR",
    platforms: [.iOS(.v16)],
    products: [.library(name: "XiaoyingARCore", targets: ["XiaoyingARCore"])],
    targets: [
        .target(
            name: "XiaoyingARCore",
            path: "Sources/XiaoyingARCore",
            resources: [.process("Audio")]
        ),
        .testTarget(name: "XiaoyingARCoreTests", dependencies: ["XiaoyingARCore"], path: "Tests/XiaoyingARCoreTests"),
    ]
)
