// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XiaoyingAR",
    platforms: [.iOS(.v16)],
    products: [.library(name: "XiaoyingARCore", targets: ["XiaoyingARCore"])],
    targets: [
        .target(name: "XiaoyingARCore", path: "Sources/XiaoyingARCore"),
        .testTarget(name: "XiaoyingARCoreTests", dependencies: ["XiaoyingARCore"], path: "Tests/XiaoyingARCoreTests"),
    ]
)
