This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

## Mock patient setup

On a fresh launch, enter `(000) 000-0000` to find Frank Murgolo, then complete his profile. Email is required; preferred name, date of birth (`MM/DD/YYYY`), and a patient-chosen four-digit PIN are optional. There is no database connection or SMS verification.

The phone calling-code selector defaults to the device's country/region setting via Expo Localization, with US as the fallback when no supported region is available. It does not request location access. Tap the code to search and change countries. Numbers format while typing; Frank's mock profile uses `+1` and `(000) 000-0000`.

`REMEMBER_MOCK_PATIENT` in `auth/mockPatient.js` defaults to `false`: each full restart or browser reload repeats setup, while backgrounding preserves it. Set it to `true` to restore completed setup using Expo SecureStore on iOS/Android and localStorage for the mock browser preview. Saved setup opens the dashboard directly unless a PIN was enabled. Browser storage is for mock data only. If saving is unavailable, the session continues with a visible warning.

When PIN protection is enabled, the dashboard lock button and backgrounding lock the app. Unlock using the PIN chosen during setup. Without PIN protection, the app assumes the person using the unlocked phone is the patient.

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

## Device unlock

Team members can open the shared sample profile with either default credential:

| Unlock method | Default value |
| --- | --- |
| Password | `password` |
| PIN | `0000` |

Start the app with `npm start` (or `npm run web` for the browser preview). On the
unlock screen, enter `0000`, or select **Password** and enter `password`. No
first-run credential setup is needed. This unlocks the local sample profile;
it does not sign in to an online Milestone account.

This update applies the shared defaults once to existing device/browser unlock
settings, replacing any previously configured PIN/password. Later launches
preserve the saved settings, biometric preference, and failed-attempt cooldown.
PIN entry now uses four digits.

On a supported phone, select the enable switch while unlocking with your
PIN/password. Your phone verifies
the biometric before it is enabled. Canceling the prompt leaves the app locked.
Biometrics must already be enrolled in the phone's settings.

Use the lock icon on Home to lock the app. It also locks when backgrounded;
exercise timers pause and the current routine remains available after unlocking.
Five incorrect attempts trigger a cooldown that persists across app restarts.

Native credential verifiers use separate random salts and PBKDF2-SHA256 and are
saved with Expo SecureStore. The browser preview saves the verifiers in local
browser storage and supports PIN/password only. Browser storage can be changed
by the browser user, so this preview is not an account-security boundary.

Face ID on iPhone requires a development/native build and is unavailable in Expo
Go. Rebuild installed native apps after adding the new modules; on macOS run
`bundle exec pod install` from `ios` before using an existing Xcode project.
The iOS permission description and Android biometric/backup configuration are
included. Physical face/fingerprint scanning still needs verification on a device.

The shared credentials above are for team access to the local sample profile.
No unauthenticated credential reset is provided.

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

## Hidden LeTeam selector

While unlocked, hold the bottom **Home** button for three seconds to reveal the
easter egg. Select either LeBron image, or tap the large image to flip between
them. Use **Play sound** / **Pause sound** for the same clip as the web app.
On phones, the large image tilts with the accelerometer. Its opening position is
the neutral angle; rotating the screen recalibrates it. Motion is smoothed and
limited to 12 degrees. Both images support tilt. Reduce Motion disables the
effect, and closing the selector or backgrounding stops sensor updates. The
browser preview and devices without an accelerometer keep the image still.
Closing the selector or locking the app stops playback. A normal Home tap keeps
its usual navigation behavior.

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
