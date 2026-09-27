import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  AppState,
  AppStateStatus,
  Linking,
  useWindowDimensions,
  AccessibilityInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  CameraView,
  useCameraPermissions,
  type FlashMode,
  type CameraType,
  type CameraCapturedPicture,
} from "expo-camera";
import { Icon } from "./Icon";
import { GlassAction } from "./GlassAction";
import { palette, spring } from "./theme";
import { colors } from "../../theme/colors";

export interface CapturedPhotoAsset {
  uri: string;
  width?: number;
  height?: number;
}

interface EmbeddedCameraPanelProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: CapturedPhotoAsset) => void;
}

export function EmbeddedCameraPanel({
  visible,
  onClose,
  onCapture,
}: EmbeddedCameraPanelProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // 58% of screen height, bound between 420 and 560
  const usableHeight = screenHeight - insets.top - insets.bottom;
  const panelHeight = Math.min(Math.max(usableHeight * 0.58, 420), 560);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] =
    useState<CameraCapturedPicture | null>(null);
  const [appActive, setAppActive] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const aliveRef = useRef(true);

  // Animation values
  const translateY = useSharedValue(panelHeight + 80);
  const scale = useSharedValue(0.94);
  const backdropOpacity = useSharedValue(0);
  const cameraAlpha = useSharedValue(0);

  // Check reduce motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
    });
  }, []);

  // Track app active state to release native camera on backgrounding
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextStatus: AppStateStatus) => {
        setAppActive(nextStatus === "active");
      },
    );
    return () => sub.remove();
  }, []);

  // Request permission once opened
  useEffect(() => {
    aliveRef.current = true;
    if (visible) {
      if (!permission?.granted && permission?.canAskAgain) {
        requestPermission().catch(() => {});
      }
    }
    return () => {
      aliveRef.current = false;
    };
  }, [visible, permission?.granted, permission?.canAskAgain, requestPermission]);

  const closeWithAnimation = useCallback(() => {
    if (reduceMotion) {
      translateY.value = panelHeight + 80;
      backdropOpacity.value = 0;
      scale.value = 0.94;
      onClose();
      return;
    }
    translateY.value = withTiming(panelHeight + 80, { duration: 240 });
    scale.value = withTiming(0.94, { duration: 240 });
    backdropOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  }, [onClose, panelHeight, reduceMotion, scale, translateY, backdropOpacity]);

  // Entrance / exit transition
  useEffect(() => {
    if (visible) {
      setIsCameraReady(false);
      setIsCapturing(false);
      setCapturedPhoto(null);
      cameraAlpha.value = 0;

      if (reduceMotion) {
        translateY.value = 0;
        scale.value = 1;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, spring);
        scale.value = withSpring(1, spring);
        backdropOpacity.value = withTiming(1, { duration: 220 });
      }
    } else {
      translateY.value = panelHeight + 80;
      scale.value = 0.94;
      backdropOpacity.value = 0;
    }
  }, [visible, panelHeight, reduceMotion, translateY, scale, backdropOpacity, cameraAlpha]);

  const handleCameraReady = useCallback(() => {
    if (!aliveRef.current) return;
    setIsCameraReady(true);
    cameraAlpha.value = withTiming(1, { duration: 200 });
  }, [cameraAlpha]);

  const handleShutterPress = async () => {
    if (!isCameraReady || isCapturing || !cameraRef.current) return;
    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (aliveRef.current && photo?.uri) {
        setCapturedPhoto(photo);
      }
    } catch {
      // Ignore capture errors on cancel or unmount
    } finally {
      if (aliveRef.current) {
        setIsCapturing(false);
      }
    }
  };

  const handleRetake = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCapturedPhoto(null);
    setIsCameraReady(false);
    cameraAlpha.value = 0;
  };

  const handleUsePhoto = () => {
    if (!capturedPhoto?.uri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const asset: CapturedPhotoAsset = {
      uri: capturedPhoto.uri,
      width: capturedPhoto.width,
      height: capturedPhoto.height,
    };
    closeWithAnimation();
    onCapture(asset);
  };

  const toggleFacing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFacing((prev) => (prev === "back" ? "front" : "back"));
    setIsCameraReady(false);
    cameraAlpha.value = 0;
  };

  const cycleFlash = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFlash((prev) => {
      if (prev === "off") return "on";
      if (prev === "on") return "auto";
      return "off";
    });
  };

  // Interactive downward drag gesture
  const dragGesture = Gesture.Pan()
    .activeOffsetY([0, 8])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 500) {
        runOnJS(closeWithAnimation)();
      } else {
        translateY.value = withSpring(0, spring);
      }
    });

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCameraStyle = useAnimatedStyle(() => ({
    opacity: cameraAlpha.value,
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed backdrop preserving context of screen above */}
      <Animated.View
        style={[styles.backdrop, animatedBackdropStyle]}
        pointerEvents="auto"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إغلاق الكاميرا"
          style={StyleSheet.absoluteFill}
          onPress={closeWithAnimation}
        />
      </Animated.View>

      {/* Floating Camera Panel */}
      <View
        style={[
          styles.panelWrapper,
          {
            bottom: Math.max(insets.bottom, 12) + 6,
            height: panelHeight,
          },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.panelCard, { height: panelHeight }, animatedPanelStyle]}
        >
          {/* Permission Denied Surface */}
          {permission && !permission.granted ? (
            <View style={styles.permissionContainer}>
              <View style={styles.permissionCard}>
                <Icon name="camera" size={36} color={palette.mint} />
                <Text style={styles.permissionTitle}>إذن الكاميرا مطلوب</Text>
                <Text style={styles.permissionBody}>
                  اسمح لتطبيق تبيّن باستخدام الكاميرا من إعدادات جهازك لالتقاط
                  نصوص الآيات والأحاديث والتحقق منها مباشرة.
                </Text>
                <GlassAction
                  primary
                  label="فتح الإعدادات"
                  icon="spark"
                  onPress={() => {
                    Linking.openSettings().catch(() => {});
                  }}
                  style={{ alignSelf: "center", marginTop: 8 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="إلغاء"
                  onPress={closeWithAnimation}
                  style={styles.permissionCancelBtn}
                >
                  <Text style={styles.permissionCancelText}>إلغاء</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Live Preview or Captured Still */}
              <View style={StyleSheet.absoluteFill}>
                {capturedPhoto ? (
                  <Image
                    source={{ uri: capturedPhoto.uri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <>
                    {/* Quiet Loading Surface while camera initializes */}
                    {!isCameraReady && (
                      <View style={styles.loadingContainer}>
                        <View style={styles.loadingRing} />
                        <Text style={styles.loadingText}>
                          جاري تجهيز الكاميرا…
                        </Text>
                      </View>
                    )}

                    {/* Native Camera View */}
                    {appActive && (
                      <Animated.View
                        style={[StyleSheet.absoluteFill, animatedCameraStyle]}
                      >
                        <CameraView
                          ref={cameraRef}
                          style={StyleSheet.absoluteFill}
                          facing={facing}
                          flash={flash}
                          mode="picture"
                          onCameraReady={handleCameraReady}
                          onMountError={() => {
                            if (aliveRef.current) setIsCameraReady(false);
                          }}
                        />
                      </Animated.View>
                    )}
                  </>
                )}
              </View>

              {/* Top Drag Handle & Controls */}
              <GestureDetector gesture={dragGesture}>
                <View style={styles.topHeader}>
                  {/* Close button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="إغلاق الكاميرا"
                    onPress={closeWithAnimation}
                    style={styles.iconCircleButton}
                  >
                    <Icon name="close" size={18} color={palette.text} />
                  </Pressable>

                  {/* Drag Handle */}
                  <View style={styles.dragHandle} />

                  {/* Flash button (hidden in review mode) */}
                  {!capturedPhoto ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`الفلاش: ${flash === "off" ? "معطل" : flash === "on" ? "مفعل" : "تلقائي"}`}
                      onPress={cycleFlash}
                      style={[
                        styles.iconCircleButton,
                        flash !== "off" && styles.flashActiveButton,
                      ]}
                    >
                      <Icon
                        name={
                          flash === "off"
                            ? "flash-off"
                            : flash === "on"
                              ? "flash-on"
                              : "flash-auto"
                        }
                        size={17}
                        color={flash !== "off" ? colors.emerald : palette.muted}
                      />
                      {flash === "auto" && (
                        <Text style={styles.flashBadge}>A</Text>
                      )}
                    </Pressable>
                  ) : (
                    <View style={{ width: 38 }} />
                  )}
                </View>
              </GestureDetector>

              {/* Bottom Controls Area with Subtle Dark Gradient */}
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(5,9,7,0.45)",
                  "rgba(5,9,7,0.88)",
                ]}
                style={styles.bottomGradient}
                pointerEvents="box-none"
              >
                {capturedPhoto ? (
                  /* Review Mode Actions */
                  <View style={styles.reviewActionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="إعادة التصوير"
                      onPress={handleRetake}
                      style={styles.retakeButton}
                    >
                      <Icon name="refresh" size={18} color={palette.text} />
                      <Text style={styles.retakeText}>إعادة التصوير</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="استخدام الصورة"
                      onPress={handleUsePhoto}
                      style={styles.usePhotoButton}
                    >
                      <Icon name="check" size={18} color="#050907" />
                      <Text style={styles.usePhotoText}>استخدام الصورة</Text>
                    </Pressable>
                  </View>
                ) : (
                  /* Capture Mode Controls */
                  <View style={styles.controlsRow}>
                    {/* Flip Camera Control */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="تبديل الكاميرا"
                      onPress={toggleFacing}
                      style={styles.iconCircleButton}
                    >
                      <Icon name="camera-flip" size={20} color={palette.text} />
                    </Pressable>

                    {/* Centered Large Shutter Button */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="التقاط صورة"
                      disabled={!isCameraReady || isCapturing}
                      onPress={handleShutterPress}
                      style={({ pressed }) => [
                        styles.shutterOuter,
                        (!isCameraReady || isCapturing) &&
                          styles.shutterDisabled,
                        pressed && styles.shutterPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.shutterInner,
                          isCapturing && styles.shutterInnerCapturing,
                        ]}
                      />
                    </Pressable>

                    {/* Balancer placeholder on the other side */}
                    <View style={{ width: 44 }} />
                  </View>
                )}
              </LinearGradient>
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5, 9, 7, 0.65)",
  },
  panelWrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 100,
  },
  panelCard: {
    width: "100%",
    borderRadius: 40,
    overflow: "hidden",
    backgroundColor: "#050907",
    borderWidth: 1.2,
    borderColor: "rgba(52, 211, 153, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(7, 26, 20, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  loadingRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: colors.emerald,
    borderTopColor: "transparent",
  },
  loadingText: {
    fontFamily: "System",
    fontSize: 14,
    color: palette.muted,
  },
  topHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "rgba(244, 241, 232, 0.35)",
  },
  iconCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(7, 26, 20, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.22)",
    justifyContent: "center",
    alignItems: "center",
  },
  flashActiveButton: {
    borderColor: colors.emerald,
    backgroundColor: "rgba(6, 95, 70, 0.7)",
  },
  flashBadge: {
    position: "absolute",
    bottom: 3,
    right: 5,
    fontSize: 9,
    fontWeight: "700",
    color: colors.emerald,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 128,
    justifyContent: "flex-end",
    paddingBottom: 22,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  controlsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3.5,
    borderColor: colors.emerald,
    backgroundColor: "rgba(7, 26, 20, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.ivory,
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInnerCapturing: {
    backgroundColor: colors.emerald,
    transform: [{ scale: 0.85 }],
  },
  reviewActionsRow: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  usePhotoButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.emerald,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 26,
    shadowColor: colors.emerald,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  usePhotoText: {
    fontFamily: "System",
    fontSize: 15,
    fontWeight: "600",
    color: "#050907",
  },
  retakeButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(7, 26, 20, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.3)",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 26,
  },
  retakeText: {
    fontFamily: "System",
    fontSize: 15,
    fontWeight: "500",
    color: palette.text,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionCard: {
    backgroundColor: "rgba(7, 26, 20, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.25)",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    gap: 12,
    maxWidth: 340,
  },
  permissionTitle: {
    fontFamily: "System",
    fontSize: 17,
    fontWeight: "600",
    color: palette.text,
    textAlign: "center",
  },
  permissionBody: {
    fontFamily: "System",
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
    textAlign: "center",
  },
  permissionCancelBtn: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  permissionCancelText: {
    fontFamily: "System",
    fontSize: 14,
    color: palette.dim,
  },
});
