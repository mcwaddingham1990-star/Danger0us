# Security Watch (Android)

A personal-device security app: it watches for someone opening this
device's **Accessibility settings** or **app permissions / device-admin**
screens, and when that happens it snaps a photo with the **front camera**
and sends you a notification with that photo, so you know who was in your
settings.

Install this on a device you own (or are otherwise authorized to
monitor) — it is meant to catch someone else physically handling *your*
phone, not to be hidden on someone else's device. It runs entirely
on-device: no accounts, no servers, no network calls. Alert photos are
stored only in the app's private storage
(`Android/data/com.danger0us.securitywatch/files/alert_photos/`) and are
never uploaded anywhere.

## How it works

- `SettingsWatcherService` is an `AccessibilityService` that listens for
  `TYPE_WINDOW_STATE_CHANGED` events across all apps.
- `SensitiveScreenDetector` checks whether the newly opened screen belongs
  to a settings/permission-manager package (AOSP `com.android.settings`,
  `com.android.permissioncontroller`, plus common OEM equivalents for
  Samsung/MIUI/ColorOS/Huawei) **and** its class name or title text
  contains a keyword like "accessibility", "permission", "device admin",
  "usage access", or "app info". Matching purely on class names isn't
  reliable because every OEM skins their Settings app differently — the
  keyword match on title text is what keeps this working across devices.
- On a match, `MonitoringForegroundService` (a foreground service with
  `foregroundServiceType="camera"`, required for background camera access
  on Android 9+) uses `CameraCaptureManager` (raw Camera2 API, so no
  Activity/lifecycle is needed) to take one still photo from the front
  camera.
- `AlertNotificationHelper` posts a high-priority notification with the
  photo (`BigPictureStyle`) and logs the event via `EventLogStore` to a
  local JSON file so it shows up in the in-app **Alert History** screen.
- A low-priority "Security Watch is monitoring" notification stays up
  the whole time monitoring is active — Android requires a foreground
  service to show a persistent notification, and it also means the app
  is never doing anything secretly.

## Setup

1. Open `android-security-app/` in Android Studio (or run
   `./gradlew assembleDebug` from this directory once the Gradle wrapper
   is present — see below).
2. Install the app on the target device and open it.
3. Tap **Grant camera permission** and **Allow notifications**.
4. Tap **Enable accessibility monitoring** — this deep-links to
   `Settings > Accessibility`, where you must manually turn the service
   on. Android does not allow apps to enable accessibility services for
   themselves; this is a deliberate OS anti-abuse restriction, not a bug.
5. Leave the app installed. The persistent "monitoring" notification
   confirms it's active.

### Gradle wrapper

This project doesn't commit the wrapper's binary jar. Generate it once
before building from the command line:

```
cd android-security-app
gradle wrapper --gradle-version 8.14.3
./gradlew assembleDebug
```

(Android Studio will do this for you automatically on first open.)

## Limitations

- **OEM variability**: some heavily-skinned Settings apps may use package
  names or screen titles not in `SensitiveScreenDetector`'s list. If
  alerts aren't firing on a given device, check `adb logcat` for
  `SettingsWatcherService` and add the missing package/keyword.
- **Background camera restrictions**: Android increasingly restricts
  camera access for apps not visibly in the foreground. The foreground
  service here is the standard, Play-Store-compliant way to get around
  that — but very aggressive OEM battery managers (e.g. some Xiaomi/
  Huawei configurations) may still kill background services unless the
  app is exempted from battery optimization.
- **Not stealth software**: the app has a normal launcher icon, a
  persistent monitoring notification, and Android's own camera-use
  indicator (the green dot) will show during capture. That's intentional
  — this is meant to be installed openly by the device owner, not hidden.
