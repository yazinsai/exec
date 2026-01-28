import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { spacing, typography, radii } from "@/constants/Colors";
import { useColors } from "@/hooks/useThemeColors";

interface AudioPlayerProps {
  uri: string;
  duration: number;
  title?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ uri, duration: initialDuration, title }: AudioPlayerProps) {
  const colors = useColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [waveformWidth, setWaveformWidth] = useState(0);
  const [displayDuration, setDisplayDuration] = useState(initialDuration);
  const soundRef = useRef<Audio.Sound | null>(null);
  const durationMs = useRef(initialDuration * 1000);
  const progress = useSharedValue(0);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const seekTo = async (positionMs: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(positionMs);
      setPosition(positionMs / 1000);
      progress.value = positionMs / durationMs.current;
    }
  };

  const handleSeek = (fraction: number) => {
    const clampedFraction = Math.max(0, Math.min(1, fraction));
    const positionMs = clampedFraction * durationMs.current;
    seekTo(positionMs);
  };

  const loadAndPlay = async () => {
    try {
      setIsLoading(true);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const { sound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      if (status.isLoaded && status.durationMillis) {
        durationMs.current = status.durationMillis;
        setDisplayDuration(status.durationMillis / 1000);
      }

      setIsPlaying(true);
      setIsLoading(false);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          const currentPosition = status.positionMillis / 1000;
          setPosition(currentPosition);

          const actualDuration = status.durationMillis || durationMs.current;
          const prog = status.positionMillis / actualDuration;
          progress.value = prog;

          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
            progress.value = 0;
            soundRef.current?.setPositionAsync(0);
          }
        }
      });
    } catch (error) {
      console.error("Audio playback error:", error);
      setIsLoading(false);
    }
  };

  const handlePlayPause = async () => {
    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        return;
      }

      await loadAndPlay();
    } catch (error) {
      console.error("Audio playback error:", error);
      setIsLoading(false);
    }
  };

  const onWaveformLayout = (event: LayoutChangeEvent) => {
    setWaveformWidth(event.nativeEvent.layout.width);
  };

  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      if (waveformWidth > 0) {
        const fraction = event.x / waveformWidth;
        runOnJS(handleSeek)(fraction);
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (waveformWidth > 0) {
        const fraction = event.x / waveformWidth;
        runOnJS(handleSeek)(fraction);
      }
    });

  const composedGesture = Gesture.Race(tapGesture, panGesture);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  // Generate waveform bars based on duration seed
  const barCount = 50;
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const pseudoRandom = Math.sin(initialDuration * 100 + i * 0.8) * 0.5 + 0.5;
    const barHeight = 0.15 + pseudoRandom * 0.85;
    bars.push(
      <View
        key={i}
        style={[
          styles.waveformBar,
          {
            height: barHeight * 36,
            backgroundColor: colors.textMuted,
          },
        ]}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundElevated }]}>
      {title && <Text style={[styles.title, { color: colors.textTertiary }]} numberOfLines={1}>{title}</Text>}
      <View style={styles.playerRow}>
        <Pressable
          style={({ pressed }) => [styles.playButton, { backgroundColor: colors.primary }, pressed && styles.playButtonPressed]}
          onPress={handlePlayPause}
          disabled={isLoading}
        >
          <Ionicons
            name={isLoading ? "hourglass" : isPlaying ? "pause" : "play"}
            size={18}
            color={colors.textPrimary}
          />
        </Pressable>

        <GestureDetector gesture={composedGesture}>
          <View style={styles.waveformTouchable} onLayout={onWaveformLayout}>
            <View style={[styles.waveformContainer, { backgroundColor: colors.background }]}>
              {/* Background waveform (muted) */}
              <View style={styles.waveform}>
                {bars}
              </View>

              {/* Progress overlay with colored waveform */}
              <Animated.View style={[styles.progressContainer, progressStyle]}>
                <View style={styles.waveformProgress}>
                  {bars.map((_, i) => {
                    const pseudoRandom = Math.sin(initialDuration * 100 + i * 0.8) * 0.5 + 0.5;
                    const barHeight = 0.15 + pseudoRandom * 0.85;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.waveformBarActive,
                          {
                            height: barHeight * 36,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </Animated.View>

              {/* Playhead indicator */}
              <Animated.View style={[styles.playhead, { backgroundColor: colors.primary }, progressStyle]} />
            </View>
          </View>
        </GestureDetector>

        <Text style={[styles.time, { color: colors.textTertiary }]}>
          {formatTime(position)} / {formatTime(displayDuration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    padding: spacing.md,
  },
  title: {
    fontSize: typography.xs,
    marginBottom: spacing.sm,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonPressed: {
    opacity: 0.8,
  },
  waveformTouchable: {
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  waveformContainer: {
    height: 36,
    position: "relative",
    overflow: "hidden",
    borderRadius: radii.sm,
  },
  waveform: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    opacity: 0.4,
  },
  progressContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden",
  },
  waveformProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    width: 1000, // Large enough to contain all bars
  },
  waveformBarActive: {
    width: 3,
    borderRadius: 1.5,
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
  },
  time: {
    fontSize: typography.xs,
    fontVariant: ["tabular-nums"],
    minWidth: 70,
    textAlign: "right",
  },
});
