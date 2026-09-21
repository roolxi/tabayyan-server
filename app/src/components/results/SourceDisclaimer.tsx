import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

export const SourceDisclaimer: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.disclaimerText}>
        استُخدم الذكاء الاصطناعي لاستخراج عبارة البحث فقط. النص والمصدر المعروضان من قاعدة القرآن أو الدرر السنية.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(5, 9, 7, 0.4)",
    borderRadius: 8,
    borderRightWidth: 3,
    borderRightColor: colors.warmGold,
    marginVertical: spacing.md,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "right",
  },
});

