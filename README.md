# SUJITH AI

A full-stack NoTrack.ai chat workspace and autonomous website / Android project builder. All AI requests stream directly from `https://api.notrack.ai/v1` through the Express/Node backend without client-side key exposure, fake responses, or demo fallbacks.

## Quick Start

```sh
npm install
npm run dev
```

Open `http://localhost:3000`, go to **Settings -> NoTrack.ai API key**, paste your NoTrack.ai API key (or set `NOTRACK_API_KEY` in server environment variables), and click **Save & Verify**.

## Production Checks & Build

```sh
npx tsc --noEmit
npm run build
npm start
```

## Architecture & Key Features

- **NoTrack.ai Backend Proxy (`gateway.mjs`, `server.ts`)**:
  - `GET /api/providers/status` & `GET /api/providers/notrack/check`: Live key verification, latency check, and dynamic `/v1/models` discovery.
  - `POST /api/providers/notrack/key`: Verifies and binds a user-provided NoTrack.ai key on the server session without exposing raw keys to client code.
  - `POST /api/chat`: Real SSE streaming to `https://api.notrack.ai/v1/chat/completions` with timeout handling, transient retry backoff, custom `temperature`, `max_tokens`, system prompt support, and structured HTTP error reporting (`401`, `402`, `429`, `400/404`, `5xx`).
  - `POST /api/workspace/check`: Real TypeScript (`typescript`), JSON, and Python AST syntax verification.
  - `POST /api/terminal` & `POST /api/android/cloud-apk`: Sandboxed workspace terminal and GitHub Actions APK workflow integration.
- **Live Standalone Preview (`src/lib/workspace.ts`)**:
  - Supports dependency-free **HTML5 + CSS3 + ES6+ Vanilla JavaScript** projects out of the box.
  - Supports multi-file **React + TypeScript** projects with resolved `react`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `lucide-react`, `@/` aliases, and CSS bundling.
  - Exposes `window.SUJITH.ai.stream(messages, onDelta, options)` and `window.SUJITH.ai.abort()` to generated web apps via permissioned `postMessage` bridging.
- **Native Android Preview & Export (`src/lib/androidPreviewRenderer.ts`)**:
  - Renders AST-parsed Compose/XML/Flutter device previews and exports complete Gradle / Android Studio / Flutter projects.

## Android Application (Android Studio & APK)

SUJITH AI is fully packaged as a native Android application using Android Studio, Kotlin, Gradle, and Capacitor Android.

### Android Project Structure

```
android/
├── app/
│   ├── build.gradle                          # App module Gradle configuration (Java 17, Kotlin 1.9.22)
│   ├── proguard-rules.pro                    # ProGuard / R8 rules
│   └── src/main/
│       ├── AndroidManifest.xml               # App manifest with permissions & network config
│       ├── java/com/sujith/ai/
│       │   └── MainActivity.kt               # Kotlin BridgeActivity with edge-to-edge UI, back button dispatcher, permissions & WebView setup
│       ├── res/
│       │   ├── drawable/                     # Splash screen assets
│       │   ├── mipmap-*/                     # SUJITH AI launcher icons (hdpi, mdpi, xhdpi, xxhdpi, xxxhdpi)
│       │   ├── values/                       # App colors, strings, and theme styles
│       │   └── xml/
│       │       ├── file_paths.xml            # Secure FileProvider paths
│       │       └── network_security_config.xml # Safe network security configuration
│       └── assets/public/                    # Built, bundled web application assets
├── build.gradle                              # Root project build configuration
├── gradle/wrapper/                           # Gradle wrapper distribution
├── gradle.properties                         # Gradle JVM & build memory tuning
├── gradlew & gradlew.bat                     # Gradle wrapper execution scripts
├── settings.gradle                           # Gradle module settings
└── variables.gradle                          # Android SDK & dependency versions (compileSdk 36, Java 17)
```

### Building the Android App

#### Option 1: Using Android Studio
1. Open **Android Studio** (Hedgehog, Iguana, Jellyfish, or newer).
2. Select **Open an existing project** and navigate to the `/android` directory of this repository.
3. Allow Gradle to synchronize dependencies.
4. Connect an Android device (via USB with USB debugging enabled) or start an Android Emulator.
5. Click the green **Run (▶)** button or press `Shift + F10`.

#### Option 2: Command Line (Debug APK)
```sh
# 1. Build web application & sync assets to Android
npm run cap:sync

# 2. Build the Debug APK using Gradle
cd android
./gradlew assembleDebug
```
The output APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

#### Option 3: Command Line (Release APK)
```sh
cd android
./gradlew assembleRelease
```
The unsigned release APK will be generated at:
`android/app/build/outputs/apk/release/app-release-unsigned.apk`

### Signing the Release APK

To create a signed release APK ready for the Google Play Store or sideloading:

1. **Generate a keystore** (if you don't already have one):
```sh
keytool -genkey -v -keystore sujith-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias sujith-key
```

2. **Configure signing in `android/app/build.gradle`**:
```groovy
android {
    ...
    signingConfigs {
        release {
            storeFile file("sujith-release-key.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "sujith-key"
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

3. **Build signed APK**:
```sh
./gradlew assembleRelease
```

### Automated GitHub Actions CI/CD

An automated workflow is provided at `.github/workflows/android-build.yml`. Whenever changes are pushed to GitHub, GitHub Actions will:
1. Check out the repository and install Node.js dependencies.
2. Build the production web bundle and sync assets into the Android native project.
3. Set up JDK 17 and cache Gradle.
4. Compile `app-debug.apk` and `app-release-unsigned.apk`.
5. Upload both APK files as downloadable GitHub workflow artifacts.

### Native Android Features Implemented

- **Edge-to-Edge Experience**: Status bar and navigation bar styling tailored for a modern, distraction-free mobile workspace (`WindowInsetsControllerCompat`).
- **Native Back Button Dispatcher**: Intercepts Android hardware/gesture back events to navigate WebView browser history or gracefully minimize.
- **Voice Input & Audio Permissions**: Configured for `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` with runtime permission requests for voice chat.
- **Hardware Acceleration & Secure Storage**: Enabled DOM storage, database caching, overview mode, and secure mixed content handling.
- **Network Security**: Configured `network_security_config.xml` to support local development proxying and secure HTTPS/WSS communication in production.
- **Offline Fallback**: Bundled local web assets ensure the UI renders instantly even before network connectivity is established.
