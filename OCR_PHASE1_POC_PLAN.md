# OCR Phase 1 POC — On-Device Text Extraction Test

**目標：** 安裝 `expo-text-extractor`，建 test screen 驗證 OCR 品質，不動現有 scan flow。

**前提：** 已使用 EAS Build，SDK 52+，不影響 Expo Go（OCR 需 native build）。

---

## Stage 1: 安裝 expo-text-extractor

**Goal:** 安裝套件並確認 EAS build 不破。

**Files:** `package.json`, `app.json` (或 `app.config.js`)

**Actions:**

1. 安裝套件：
   ```bash
   npx expo install expo-text-extractor
   ```

2. 確認 `expo-text-extractor` 出現在 `package.json` 的 `dependencies`：
   ```bash
   grep "expo-text-extractor" package.json
   ```
   預期：`"expo-text-extractor": "^2.0.0"` 或類似

3. 確認 TypeScript 編譯通過：
   ```bash
   npx tsc --noEmit
   ```

**DO NOT:**
- 不要改 `app.json` 的 plugins — `expo-text-extractor` v2 使用 Expo Modules 架構，自動設定，不需要額外 plugin config
- 不要改任何現有檔案

**Tests:**
- `npx tsc --noEmit` 無新錯誤
- `grep "expo-text-extractor" package.json` 有結果

**Status:** Not Started

---

## Stage 2: 建立 OCR Test Screen

**Goal:** 建一個獨立的 test screen，讓使用者選圖或拍照後顯示 OCR 結果。

**Files:** 新增 `app/(tabs)/ocr-test.tsx`（暫時加到 tab 方便測試，Stage 3 會移除）

**Actions:**

1. 建立 `app/(tabs)/ocr-test.tsx`，內容如下：

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import { OaklandDusk } from '../../constants/OaklandDusk';

export default function OcrTestScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      await runOcr(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      await runOcr(result.assets[0].uri);
    }
  };

  const runOcr = async (uri: string) => {
    setImageUri(uri);
    setOcrResults([]);
    setElapsed(null);
    setLoading(true);

    try {
      const start = Date.now();
      const texts = await extractTextFromImage(uri);
      const end = Date.now();

      setOcrResults(texts);
      setElapsed(end - start);
    } catch (error: any) {
      Alert.alert('OCR Error', error.message || 'Failed to extract text');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>OCR Test</Text>

      <Text style={styles.supportLabel}>
        Device supported: {isSupported ? '✅ Yes' : '❌ No'}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>Pick Image</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={takePhoto}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
      </View>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
      )}

      {loading && (
        <ActivityIndicator size="large" color={OaklandDusk.brandGold} style={{ marginTop: 16 }} />
      )}

      {elapsed !== null && (
        <Text style={styles.elapsed}>OCR took {elapsed}ms</Text>
      )}

      {ocrResults.length > 0 && (
        <View style={styles.resultsBox}>
          <Text style={styles.resultsTitle}>
            Extracted Text ({ocrResults.length} blocks)
          </Text>
          {ocrResults.map((text, i) => (
            <Text key={i} style={styles.resultItem}>
              [{i}] {text}
            </Text>
          ))}
        </View>
      )}

      {!loading && ocrResults.length === 0 && imageUri && elapsed !== null && (
        <Text style={styles.noResults}>No text detected</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08070C',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  title: {
    fontFamily: 'BebasNeue',
    fontSize: 32,
    color: '#C87828',
    marginBottom: 8,
  },
  supportLabel: {
    fontFamily: 'DMMono',
    fontSize: 13,
    color: '#b8bfd0',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    backgroundColor: '#180F20',
    borderWidth: 1,
    borderColor: '#C87828',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'DMMono',
    fontSize: 14,
    color: '#C87828',
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#100C18',
  },
  elapsed: {
    fontFamily: 'DMMono',
    fontSize: 12,
    color: '#E0A030',
    marginBottom: 12,
  },
  resultsBox: {
    backgroundColor: '#100C18',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  resultsTitle: {
    fontFamily: 'DMMono',
    fontSize: 14,
    color: '#F0C848',
    marginBottom: 12,
  },
  resultItem: {
    fontFamily: 'DMMono',
    fontSize: 12,
    color: '#b8bfd0',
    marginBottom: 6,
    lineHeight: 18,
  },
  noResults: {
    fontFamily: 'DMMono',
    fontSize: 13,
    color: '#8B3060',
    marginTop: 12,
    textAlign: 'center',
  },
});
```

2. 如果使用 Expo Router tabs layout，需在 `app/(tabs)/_layout.tsx` 暫時加入 ocr-test tab：

   找到 `<Tabs.Screen` 列表，在最後一個 tab 後面加入：
   ```tsx
   <Tabs.Screen
     name="ocr-test"
     options={{
       title: 'OCR',
       headerShown: false,
       tabBarIcon: ({ color }) => (
         <Ionicons name="scan-outline" size={24} color={color} />
       ),
     }}
   />
   ```

   **DO NOT:**
   - 不要移除或修改任何現有 tab
   - 不要改 tab 順序
   - 只在最後面 append

**Tests:**
- `npx tsc --noEmit` 無新錯誤
- 確認 `ocr-test.tsx` 存在且引用了 `expo-text-extractor`：
  ```bash
  grep -l "extractTextFromImage" app/(tabs)/ocr-test.tsx
  ```

**Status:** Not Started

---

## Stage 3: EAS Development Build + 手動驗證

**Goal:** 建立 development build，手動測試 OCR 品質。

**Actions:**

1. 建 development build（非 production）：
   ```bash
   eas build --profile development --platform ios
   ```
   或用本地 development client（如果已設定）。

2. 在手機上開啟 OCR Test tab，測試以下場景：

   | 場景 | 預期 |
   |---|---|
   | 清晰酒瓶正面標籤（如 Maker's Mark） | 應能辨識品牌名、酒精濃度、容量 |
   | 有弧度的標籤（如圓柱瓶身） | 中心文字應能辨識，邊緣可能有失真 |
   | 低光環境拍攝 | 可能部分辨識，觀察降級程度 |
   | 金屬/反光標籤（如 Bombay Sapphire） | 觀察反光干擾程度 |
   | 手寫/藝術字體標籤（如 craft spirits） | 可能失敗，記錄哪些字有辨識到 |

3. 記錄每次測試的結果：
   - OCR 耗時（ms）
   - 辨識到的 text blocks 數量
   - 品牌名是否正確出現
   - ABV/容量是否正確出現
   - 明顯的 false positive 或 garbage text

4. 測試完成後，決定：
   - OCR 品質是否足以替代 vision API（≥80% 商業酒瓶能正確辨識品牌名）
   - 是否需要 fallback 到 vision API
   - 是否需要 server-side OCR（Google Cloud Vision）作為替代

**DO NOT:**
- 不要在這個階段整合到現有 scan flow
- 不要改 `/analyze-image` 後端
- 這純粹是 POC 驗證

**Status:** Not Started

---

## Stage 4: 清理（POC 驗證完成後）

**Goal:** 移除 test tab，保留 library 安裝。

**Actions:**

1. 從 `app/(tabs)/_layout.tsx` 移除 `ocr-test` 的 `<Tabs.Screen>` 設定
2. 刪除 `app/(tabs)/ocr-test.tsx`
3. 保留 `expo-text-extractor` 在 `package.json`（Phase 2 整合會用到）

**Tests:**
- `npx tsc --noEmit` 無新錯誤
- App 正常啟動，tab bar 回復原樣

**Status:** Not Started

---

## 備註

- `expo-text-extractor` 不能在 Expo Go 測試，必須用 EAS development build
- iOS 用 Apple Vision，Android 用 Google ML Kit — 兩邊結果可能略有差異
- 返回值是 `string[]`（text blocks），不是單一字串 — 每個 block 是畫面上獨立的文字區域
- 如果 POC 結果不理想，Phase 2 可能改用 Gemini 2.5 Flash（$0.20/mo）而非 hybrid OCR+LLM，降低架構複雜度

## Git Commit Message（Stage 1+2 完成後）
```
feat: add expo-text-extractor and OCR test screen for bottle label POC

- Install expo-text-extractor v2.0.0 (ML Kit Android / Apple Vision iOS)
- Add temporary OCR test tab for manual quality validation
- Test screen shows: image preview, OCR timing, extracted text blocks
- Does not modify existing scan flow
```
