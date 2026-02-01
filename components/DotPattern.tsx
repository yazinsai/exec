import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useThemeColors";

interface DotPatternProps {
  width: number;
  height: number;
  dotSize?: number;
  gap?: number;
  color?: string;
  opacity?: number;
  animated?: boolean;
  variant?: "grid" | "diagonal" | "radial";
}

/**
 * DotPattern - Creates the pixelated/beaded aesthetic matching the app icon
 * Used for backgrounds, empty states, and decorative elements
 */
export function DotPattern({
  width,
  height,
  dotSize = 2,
  gap = 12,
  color,
  opacity = 0.15,
  animated = false,
  variant = "grid",
}: DotPatternProps) {
  const colors = useColors();
  const dotColor = color ?? colors.primary;

  const dots = useMemo(() => {
    const result: { x: number; y: number; delay: number }[] = [];
    const cols = Math.ceil(width / gap);
    const rows = Math.ceil(height / gap);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let x = col * gap;
        let y = row * gap;

        // Offset every other row for diagonal variant
        if (variant === "diagonal" && row % 2 === 1) {
          x += gap / 2;
        }

        // Skip dots outside radial pattern
        if (variant === "radial") {
          const centerX = width / 2;
          const centerY = height / 2;
          const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          const maxDist = Math.min(width, height) / 2;
          if (dist > maxDist) continue;
        }

        // Stagger animation delay based on position
        const delay = animated ? (row * cols + col) * 30 : 0;

        result.push({ x, y, delay });
      }
    }
    return result;
  }, [width, height, gap, variant, animated]);

  return (
    <View style={[styles.container, { width, height }]}>
      {dots.map((dot, i) => (
        animated ? (
          <AnimatedDot
            key={i}
            x={dot.x}
            y={dot.y}
            size={dotSize}
            color={dotColor}
            opacity={opacity}
            delay={dot.delay}
          />
        ) : (
          <View
            key={i}
            style={[
              styles.dot,
              {
                left: dot.x,
                top: dot.y,
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: dotColor,
                opacity,
              },
            ]}
          />
        )
      ))}
    </View>
  );
}

interface AnimatedDotProps {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  delay: number;
}

function AnimatedDot({ x, y, size, color, opacity, delay }: AnimatedDotProps) {
  const scale = useSharedValue(0);
  const dotOpacity = useSharedValue(0);

  // Entrance animation with stagger
  useMemo(() => {
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.2, { duration: 200, easing: Easing.out(Easing.exp) }),
        withTiming(1, { duration: 100 })
      )
    );
    dotOpacity.value = withDelay(
      delay,
      withTiming(opacity, { duration: 300 })
    );
  }, [delay, opacity, scale, dotOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: dotOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

/**
 * DotDivider - A horizontal line of dots for section separators
 */
interface DotDividerProps {
  width?: number | "100%";
  dotSize?: number;
  gap?: number;
  color?: string;
  opacity?: number;
}

export function DotDivider({
  width = "100%",
  dotSize = 2,
  gap = 8,
  color,
  opacity = 0.2,
}: DotDividerProps) {
  const colors = useColors();
  const dotColor = color ?? colors.primary;

  return (
    <View style={[styles.divider, { width }]}>
      <View style={styles.dividerDots}>
        {Array.from({ length: 50 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dividerDot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: dotColor,
                opacity,
                marginHorizontal: gap / 2,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * DotBorder - A dotted border effect
 */
interface DotBorderProps {
  children: React.ReactNode;
  dotSize?: number;
  gap?: number;
  color?: string;
  opacity?: number;
  borderRadius?: number;
}

export function DotBorder({
  children,
  dotSize = 2,
  gap = 6,
  color,
  opacity = 0.3,
  borderRadius = 12,
}: DotBorderProps) {
  const colors = useColors();
  const dotColor = color ?? colors.primary;

  return (
    <View style={[styles.borderContainer, { borderRadius }]}>
      <View
        style={[
          styles.borderDots,
          {
            borderRadius,
            borderWidth: dotSize,
            borderColor: dotColor,
            borderStyle: "dotted",
            opacity,
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  dot: {
    position: "absolute",
  },
  divider: {
    height: 4,
    overflow: "hidden",
    justifyContent: "center",
  },
  dividerDots: {
    flexDirection: "row",
    justifyContent: "center",
  },
  dividerDot: {},
  borderContainer: {
    position: "relative",
  },
  borderDots: {
    ...StyleSheet.absoluteFillObject,
  },
});
