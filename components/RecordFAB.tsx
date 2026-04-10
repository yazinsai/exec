import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { shadows } from "@/constants/Colors";

interface RecordFABProps {
  isRecording: boolean;
  isProcessing: boolean;
  bottomInset: number;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function RecordFAB({
  isRecording,
  isProcessing,
  bottomInset,
  onPress,
}: RecordFABProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  const disabled = isProcessing;

  // Position FAB to overlap with the bottom tab bar.
  const TAB_BAR_HEIGHT = Platform.OS === "android" ? 56 : 49;
  const fabBottom = Platform.OS === "android"
    ? -bottomInset // negative inset to sit into the nav bar
    : bottomInset + TAB_BAR_HEIGHT - 32;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: fabBottom,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 10,
      }}
    >
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
        }}
        disabled={disabled}
        style={[
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isRecording ? colors.error : colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
            ...(isRecording ? shadows.sm : shadows.gold),
          },
          animatedStyle,
        ]}
      >
        <Ionicons
          name={isRecording ? "stop" : "mic"}
          size={isRecording ? 24 : 28}
          color={colors.white}
        />
      </AnimatedPressable>
    </View>
  );
}
