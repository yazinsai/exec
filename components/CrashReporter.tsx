import React, { Component, type ReactNode } from "react";
import { View, Text, ScrollView, Pressable, Platform } from "react-native";
import { db } from "@/lib/db";
import { id } from "@instantdb/react-native";

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

    // Report to InstantDB so we can read it remotely
    const taskId = id();
    const msgId = id();
    const crashReport = [
      `CRASH REPORT (${Platform.OS})`,
      `Error: ${error.message}`,
      `Stack: ${error.stack?.slice(0, 2000)}`,
      `Component Stack: ${errorInfo.componentStack?.slice(0, 1000)}`,
    ].join("\n\n");

    db.transact([
      db.tx.tasks[taskId].update({
        input: `[CRASH] ${error.message.slice(0, 100)}`,
        status: "failed",
        result: crashReport,
        source: Platform.OS === "web" ? "mac" : "phone",
        errorMessage: error.message,
        read: false,
        createdAt: Date.now(),
        completedAt: Date.now(),
      }),
      db.tx.messages[msgId]
        .update({
          role: "assistant",
          content: crashReport,
          createdAt: Date.now(),
        })
        .link({ task: taskId }),
    ]).catch(() => {
      // If DB write fails, at least we have the fallback UI
    });
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "#000",
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
          <Text style={{ color: "#fca5a5", fontSize: 14, marginBottom: 16 }}>
            A crash report has been sent. Details below:
          </Text>
          <ScrollView
            style={{
              flex: 1,
              backgroundColor: "#111",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text
              style={{ color: "#f87171", fontFamily: "monospace", fontSize: 12 }}
            >
              {this.state.error.message}
            </Text>
            <Text
              style={{
                color: "#888",
                fontFamily: "monospace",
                fontSize: 10,
                marginTop: 12,
              }}
            >
              {this.state.error.stack?.slice(0, 3000)}
            </Text>
            {this.state.errorInfo?.componentStack && (
              <Text
                style={{
                  color: "#666",
                  fontFamily: "monospace",
                  fontSize: 10,
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
              backgroundColor: "#333",
              padding: 14,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
