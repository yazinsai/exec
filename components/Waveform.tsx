import { useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useThemeColors";

interface WaveformProps {
  metering: number;
  isActive: boolean;
  dotCount?: number;
  height?: number;
  color?: string;
}

function normalizeMetering(metering: number): number {
  const min = -60;
  const max = 0;
  const clamped = Math.max(min, Math.min(max, metering));
  return (clamped - min) / (max - min);
}

/**
 * WaveformDot - Individual animated dot that pulses with audio levels
 * Creates the beaded/pixelated aesthetic matching the app icon
 */
function WaveformDot({
  metering,
  index,
  totalDots,
  isActive,
  baseSize,
  maxSize,
  color,
}: {
  metering: number;
  index: number;
  totalDots: number;
  isActive: boolean;
  baseSize: number;
  maxSize: number;
  color: string;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    if (!isActive) {
      scale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.exp) });
      opacity.value = withTiming(0.3, { duration: 300 });
      return;
    }

    const normalized = normalizeMetering(metering);

    // Create wave pattern - dots closer to center are more responsive
    const centerIndex = totalDots / 2;
    const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex;
    const positionFactor = 1 - distanceFromCenter * 0.6;

    // Add organic variation
    const phase = (index / totalDots) * Math.PI * 2;
    const waveFactor = 0.7 + Math.sin(phase + Date.now() / 200) * 0.3;

    // Calculate final scale (between 1 and maxScale based on audio level)
    const maxScale = maxSize / baseSize;
    const targetScale = 1 + (normalized * positionFactor * waveFactor * (maxScale - 1));

    // Higher opacity for louder sounds
    const targetOpacity = 0.4 + normalized * positionFactor * 0.6;

    scale.value = withSpring(targetScale, {
      damping: 15,
      stiffness: 300,
      mass: 0.3,
    });

    opacity.value = withSpring(targetOpacity, {
      damping: 20,
      stiffness: 200,
    });
  }, [metering, isActive, index, totalDots, baseSize, maxSize, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: baseSize,
          height: baseSize,
          borderRadius: baseSize / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

/**
 * Waveform - Dotted audio visualization matching the app's beaded icon aesthetic
 * Displays as a grid of pulsing dots that respond to audio levels
 */
export function Waveform({
  metering,
  isActive,
  dotCount = 7,
  height = 120,
  color,
}: WaveformProps) {
  const colors = useColors();
  const dotColor = color ?? colors.primary;

  // Configure dot sizes
  const baseSize = 8;
  const maxSize = 16;
  const rows = 5;
  const gap = 12;

  return (
    <View style={[styles.container, { height }]}>
      <View style={[styles.grid, { gap }]}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { gap }]}>
            {Array.from({ length: dotCount }).map((_, colIndex) => {
              const dotIndex = rowIndex * dotCount + colIndex;
              return (
                <WaveformDot
                  key={colIndex}
                  metering={metering}
                  index={dotIndex}
                  totalDots={rows * dotCount}
                  isActive={isActive}
                  baseSize={baseSize}
                  maxSize={maxSize}
                  color={dotColor}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * MiniWaveform - Static dotted waveform for list items and compact views
 */
interface MiniWaveformProps {
  seed?: number;
  width?: number;
  height?: number;
  color?: string;
}

export function MiniWaveform({
  seed = 0,
  width = 100,
  height = 24,
  color,
}: MiniWaveformProps) {
  const colors = useColors();
  const dotColor = color ?? colors.primary;

  const dotSize = 4;
  const gap = 6;
  const dotCount = Math.floor(width / (dotSize + gap));

  const dots = useMemo(() => {
    const result: { size: number; opacity: number }[] = [];
    for (let i = 0; i < dotCount; i++) {
      // Pseudo-random but deterministic pattern based on seed
      const pseudoRandom = Math.sin(seed * 100 + i * 1.3) * 0.5 + 0.5;
      const variation = Math.sin(seed * 50 + i * 0.7) * 0.5 + 0.5;

      result.push({
        size: dotSize * (0.6 + pseudoRandom * 0.8),
        opacity: 0.3 + variation * 0.5,
      });
    }
    return result;
  }, [seed, dotCount, dotSize]);

  return (
    <View style={[styles.miniContainer, { width, height }]}>
      {dots.map((dot, i) => (
        <View
          key={i}
          style={[
            styles.miniDot,
            {
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size / 2,
              backgroundColor: dotColor,
              opacity: dot.opacity,
              marginHorizontal: gap / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  grid: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    // Individual dot styling applied inline
  },
  miniContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  miniDot: {
    // Mini dot styling applied inline
  },
});
