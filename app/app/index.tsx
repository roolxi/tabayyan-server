import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { normalizeMediaAsset } from "../src/api/media";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { VerificationLens } from "../src/components/motion/VerificationLens";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { GlassButton } from "../src/components/glass/GlassButton";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";
import { shadows } from "../src/theme/shadows";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showCeremonialIntro, setShowCeremonialIntro] = useState<boolean>(false);

  // Quick action press handlers
  const handleTextSearch = () => {
    Haptics.selectionAsync();
    router.push("/search" as unknown as never);
  };

  const handleMeaningSearch = () => {
    Haptics.selectionAsync();
    router.push({
      pathname: "/search",
      params: { mode: "meaning" },
    } as unknown as never);
  };

  const handleOpenAbout = () => {
    Haptics.selectionAsync();
    router.push("/about" as unknown as never);
  };

  // Media picking handlers triggered from the Verification Lens
  const handleCapturePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("الإذن مطلوب", "يرجى منح إذن الكاميرا لالتقاط صورة.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "camera");
          router.push({
            pathname: "/scan",
            params: {
              uri: descriptor.uri,
              name: descriptor.name,
              type: descriptor.type,
              mediaKind: "image",
            },
          } as unknown as never);
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة الصورة الملتقطة.");
        }
      }
    } catch (err) {
      console.warn("Camera capture error:", err);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "image");
          router.push({
            pathname: "/scan",
            params: {
              uri: descriptor.uri,
              name: descriptor.name,
              type: descriptor.type,
              mediaKind: "image",
            },
          } as unknown as never);
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة الصورة المختارة.");
        }
      }
    } catch (err) {
      console.warn("Pick image error:", err);
    }
  };

  const handlePickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "video");
          router.push({
            pathname: "/scan",
            params: {
              uri: descriptor.uri,
              name: descriptor.name,
              type: descriptor.type,
              mediaKind: "video",
            },
          } as unknown as never);
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة مقطع الفيديو.");
        }
      }
    } catch (err) {
      console.warn("Pick video error:", err);
    }
  };

  return (
    <AmbientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.dockHeight + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar: Brand Mark & About Link */}
        <View style={styles.topBar}>
          <AdaptiveGlass
            borderRadius={radii.full}
            style={styles.brandBadge}
            highlightBorder
          >
            <View style={styles.brandBadgeInner}>
              <View style={styles.brandDot} />
              <Text style={styles.brandName}>تبيّن</Text>
            </View>
          </AdaptiveGlass>

          <Pressable
            onPress={handleOpenAbout}
            accessible
            accessibilityRole="button"
            accessibilityLabel="حول التطبيق ومصادر البيانات"
            hitSlop={12}
          >
            <AdaptiveGlass borderRadius={radii.full} style={styles.aboutButton}>
              {Platform.OS === "ios" ? (
                <SymbolView
                  name="info.circle"
                  size={18}
                  tintColor={colors.muted}
                />
              ) : (
                <Text style={styles.aboutText}>حول</Text>
              )}
            </AdaptiveGlass>
          </Pressable>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={[typography.hero, styles.heroTitle]}>
            النص أمامك.{"\n"}مصدره أقرب مما تتوقع.
          </Text>
          <Text style={[typography.bodyMuted, styles.heroSupporting]}>
            ابحث، صوّر، أو ارفع مقطعًا وسنوصلك إلى النص ومصدره الموثّق.
          </Text>
        </View>

        {/* Signature Interaction: The Verification Lens */}
        <VerificationLens
          onCapturePhoto={handleCapturePhoto}
          onPickImage={handlePickImage}
          onPickVideo={handlePickVideo}
        />

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionsRow}>
            <Pressable
              onPress={handleTextSearch}
              accessible
              accessibilityRole="button"
              accessibilityLabel="بحث نصّي مباشر"
              style={styles.quickActionItem}
            >
              <AdaptiveGlass
                borderRadius={radii.md}
                style={styles.quickActionCard}
                highlightBorder
              >
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>بحث نصّي</Text>
                  <Text style={styles.quickActionSub}>في القرآن والحديث</Text>
                </View>
              </AdaptiveGlass>
            </Pressable>

            <Pressable
              onPress={handleMeaningSearch}
              accessible
              accessibilityRole="button"
              accessibilityLabel="البحث بالمعنى والوصف"
              style={styles.quickActionItem}
            >
              <AdaptiveGlass
                borderRadius={radii.md}
                style={styles.quickActionCard}
                highlightBorder
              >
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>البحث بالمعنى</Text>
                  <Text style={styles.quickActionSub}>اقتراح عبارات البحث</Text>
                </View>
              </AdaptiveGlass>
            </Pressable>
          </View>
        </View>

        {/* Quiet Authoritative Source Statement */}
        <View style={styles.sourceFooter}>
          <Text style={styles.sourceFooterText}>
            القرآن من قاعدة محلية موثّقة، والحديث من الدرر السنية.
          </Text>
        </View>
      </ScrollView>

      {/* Ceremonial First Launch Intro Overlay */}
      {showCeremonialIntro && (
        <Animated.View
          entering={FadeIn.duration(400)}
          exiting={FadeOut.duration(300)}
          style={StyleSheet.absoluteFill}
        >
          <AdaptiveGlass
            borderRadius={0}
            style={[StyleSheet.absoluteFill, styles.introOverlay]}
          >
            <View style={styles.introCard}>
              <View style={styles.introLogoRing}>
                <View style={styles.introLogoCore} />
              </View>
              <Text style={styles.introBrandName}>تبيّن</Text>
              <Text style={styles.introTagline}>تحقّق من النص، من مصدره.</Text>
              <GlassButton
                label="ابدأ"
                variant="primary"
                onPress={() => setShowCeremonialIntro(false)}
                style={styles.introButton}
              />
            </View>
          </AdaptiveGlass>
        </Animated.View>
      )}
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  brandBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "rgba(7, 26, 20, 0.6)",
  },
  brandBadgeInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.emerald,
  },
  brandName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ivory,
  },
  aboutButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 26, 20, 0.4)",
  },
  aboutText: {
    fontSize: 12,
    color: colors.muted,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  heroTitle: {
    color: colors.ivory,
    fontSize: 28,
    lineHeight: 38,
    marginBottom: spacing.sm,
  },
  heroSupporting: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  quickActionsContainer: {
    marginVertical: spacing.md,
  },
  quickActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.md,
  },
  quickActionItem: {
    flex: 1,
  },
  quickActionCard: {
    padding: spacing.md,
    backgroundColor: colors.cardBackground,
    minHeight: 76,
    justifyContent: "center",
  },
  quickActionContent: {
    alignItems: "flex-end",
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: 2,
    textAlign: "right",
  },
  quickActionSub: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
  },
  sourceFooter: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(244, 241, 232, 0.06)",
    alignItems: "center",
  },
  sourceFooterText: {
    fontSize: 12,
    color: "rgba(167, 180, 174, 0.6)",
    textAlign: "center",
  },
  introOverlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 9, 7, 0.88)",
  },
  introCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    maxWidth: 320,
  },
  introLogoRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  introLogoCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.spectralMint,
  },
  introBrandName: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.ivory,
    marginBottom: spacing.xs,
  },
  introTagline: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  introButton: {
    width: 140,
  },
});

