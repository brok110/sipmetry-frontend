import { Alert, Linking } from 'react-native';

export function openUrl(url: string): void {
  Linking.openURL(url).catch(() => {
    Alert.alert("Unable to open link", "Please try later.");
  });
}
