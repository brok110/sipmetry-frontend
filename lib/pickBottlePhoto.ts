import * as ImagePicker from "expo-image-picker";
import { ActionSheetIOS, Alert, Platform } from "react-native";

export type PickedPhoto = {
  uri: string;
  base64: string | null;
};

export type PickedPhotos = {
  assets: PickedPhoto[];
  source: "camera" | "library";
};

/**
 * Show ActionSheet (iOS) or Alert (Android) to pick camera/library, then
 * request permission and launch the picker. Returns PickedPhotos on success,
 * or null if the user cancels at any step (sheet / permission / picker).
 *
 * Callers are responsible for their own state management after the result.
 * This helper does NOT reset any app state.
 */
export async function showBottlePhotoActionSheet(): Promise<PickedPhotos | null> {
  const choice = await showChoiceDialog();
  if (choice === null) return null;

  if (choice === "camera") return await launchCamera();
  return await launchLibrary();
}

/**
 * Launch camera directly without showing ActionSheet.
 * Used by callers that already know they want the camera (e.g. legacy
 * "Take a photo" entry points or a dedicated camera button).
 */
export async function pickBottlePhotoFromCamera(): Promise<PickedPhotos | null> {
  return await launchCamera();
}

/**
 * Launch photo library directly without showing ActionSheet.
 * Used by callers that already know they want the library.
 */
export async function pickBottlePhotoFromLibrary(): Promise<PickedPhotos | null> {
  return await launchLibrary();
}

/**
 * iOS ActionSheet / Android Alert to let user pick camera vs library.
 * Returns 'camera' | 'library' | null (cancelled).
 */
function showChoiceDialog(): Promise<"camera" | "library" | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take a photo", "Choose from library (multi-select)"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) resolve("camera");
          else if (buttonIndex === 2) resolve("library");
          else resolve(null);
        }
      );
    } else {
      Alert.alert("Scan bottles", "Choose an option", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        { text: "Take a photo", onPress: () => resolve("camera") },
        { text: "Choose from library (multi-select)", onPress: () => resolve("library") },
      ]);
    }
  });
}

async function launchCamera(): Promise<PickedPhotos | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission required", "Please allow camera access.");
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    exif: false,
    base64: true,
  });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  return {
    source: "camera",
    assets: [
      {
        uri: asset.uri,
        base64: asset.base64 ?? null,
      },
    ],
  };
}

async function launchLibrary(): Promise<PickedPhotos | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission required", "Please allow photo library access.");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.9,
    exif: false,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;

  return {
    source: "library",
    assets: result.assets.map((a) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
    })),
  };
}
