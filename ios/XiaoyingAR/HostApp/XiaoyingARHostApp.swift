import SwiftUI
import XiaoyingARCore

/// Minimal host application for the XiaoyingAR Swift Package.
///
/// Add this file to an iOS App target that depends on the `XiaoyingARCore`
/// product, then place the authorized derived WAV files in that target's
/// Copy Bundle Resources phase. The package intentionally does not own the
/// host application's project, signing, or privacy plist.
@main
struct XiaoyingARHostApp: App {
    var body: some Scene {
        WindowGroup {
            XiaoyingPrototypeView()
        }
    }
}
