import ExpoModulesCore
import AVFoundation

let routeChangeEvent = "onRouteChange"

public class AudioRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events(routeChangeEvent)

    Function("getCurrentInput") { () -> [String: String]? in
      return Self.currentInputInfo()
    }

    OnStartObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance()
      )
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.routeChanged(_:)),
        name: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance()
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance()
      )
    }
  }

  private static func currentInputInfo() -> [String: String]? {
    guard let input = AVAudioSession.sharedInstance().currentRoute.inputs.first else {
      return nil
    }
    return [
      "portName": input.portName,
      "portType": input.portType.rawValue,
      "uid": input.uid
    ]
  }

  @objc
  func routeChanged(_ notification: Notification) {
    if let info = Self.currentInputInfo() {
      sendEvent(routeChangeEvent, ["input": info])
    } else {
      sendEvent(routeChangeEvent, ["input": NSNull()])
    }
  }
}
