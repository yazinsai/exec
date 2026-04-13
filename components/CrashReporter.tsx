import React, { Component, type ReactNode } from "react";
import { View, Text, ScrollView, Pressable, Platform } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Catches React render crashes, reports them to InstantDB as a task,
 * and shows a fallback UI with the error details.
 */
export class CrashReporter extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });

    // Log crash details to console only — writing to DB creates noise
    // (migration converts orphaned tasks into notes, flooding the list)
    console.error(
      `[CRASH] ${Platform.OS}: ${error.message}`,
      error.stack?.slice(0, 2000),
      errorInfo.componentStack?.slice(0, 1000)
    );
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "#000000",
            padding: 24,
            paddingTop: 80,
          }}
        >
          <Text
            style={{
              color: "#ef4444",
              fontSize: 20,
              fontWeight: "bold",
              marginBottom: 12,
            }}
          >
            App Crashed
          </Text>
          <Text style={{ color: "#fca5a5", fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
            A crash report has been logged. Details below:
          </Text>
          <ScrollView
            style={{
              flex: 1,
              backgroundColor: "#111111",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text
              style={{ color: "#f87171", fontFamily: "monospace", fontSize: 12, lineHeight: 18 }}
            >
              {this.state.error.message}
            </Text>
            <Text
              style={{
                color: "#a1a1aa",
                fontFamily: "monospace",
                fontSize: 10,
                lineHeight: 15,
                marginTop: 12,
              }}
            >
              {this.state.error.stack?.slice(0, 3000)}
            </Text>
            {this.state.errorInfo?.componentStack && (
              <Text
                style={{
                  color: "#737373",
                  fontFamily: "monospace",
                  fontSize: 10,
                  lineHeight: 15,
                  marginTop: 12,
                }}
              >
                {this.state.errorInfo.componentStack.slice(0, 2000)}
              </Text>
            )}
          </ScrollView>
          <Pressable
            onPress={() => this.setState({ error: null, errorInfo: null })}
            style={{
              marginTop: 16,
              backgroundColor: "#2a2a2a",
              padding: 14,
              borderRadius: 8,
              alignItems: "center",
              minHeight: 48,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 15 }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
