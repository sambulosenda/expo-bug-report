import React, { Component, type ReactNode, type ErrorInfo as ReactErrorInfo } from 'react';
import { View, Text } from 'react-native';
import type { ErrorInfo } from './integrations/types';

let lastError: ErrorInfo | null = null;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class BugPulseErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ReactErrorInfo): void {
    lastError = {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 16, color: '#8E8E93', textAlign: 'center' }}>
            Something went wrong
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export function getLastError(): ErrorInfo | null {
  return lastError;
}

export function clearLastError(): void {
  lastError = null;
}
