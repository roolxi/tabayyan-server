import React, { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScanProvider } from "../src/context/ScanContext";
import { palette } from "../src/components/experience/theme";
export default function RootLayout() {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (active) setReduce(v);
      })
      .catch(() => {});
    const s = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      s.remove();
    };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bg }}>
      <SafeAreaProvider>
        <ScanProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bg },
              animation: reduce ? "none" : "fade",
              animationDuration: 250,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="search" />
            <Stack.Screen name="scan" />
            <Stack.Screen name="handle-share" />
            <Stack.Screen name="result" />
            <Stack.Screen name="shortcut-setup" options={{ presentation: "modal", animation: reduce ? "none" : "slide_from_bottom" }} />
            <Stack.Screen
              name="about"
              options={{
                presentation: "modal",
                animation: reduce ? "none" : "slide_from_bottom",
              }}
            />
          </Stack>
        </ScanProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
