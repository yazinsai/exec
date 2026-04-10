import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontFamily, typography } from "@/constants/Colors";
import { db } from "@/lib/db";

export default function TabsLayout() {
  const { colors } = useThemeColors();

  const { data } = db.useQuery({
    notes: {
      $: { limit: 50 },
      tasks: {},
    },
  } as any);

  const runningCount = useMemo(() => {
    const notes = ((data as any)?.notes ?? []) as any[];
    return notes
      .flatMap((n: any) => n.tasks ?? [])
      .filter((t: any) => t.status === "running").length;
  }, [data]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fontFamily.semibold,
          fontSize: typography.xs,
          letterSpacing: 0.3,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.statusRunning,
          fontFamily: fontFamily.semibold,
          fontSize: 11,
          minWidth: 18,
          height: 18,
          lineHeight: 18,
          borderRadius: 9,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Actions",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash" size={size} color={color} />
          ),
          tabBarBadge: runningCount > 0 ? runningCount : undefined,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Voice Notes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mic-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
