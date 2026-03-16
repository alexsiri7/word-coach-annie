"use client";

import * as Sentry from "@sentry/nextjs";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? undefined } },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-danger" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            {this.props.fallbackTitle || "Something went wrong"}
          </p>
          <p className="text-xs text-text-muted mb-4 max-w-xs">
            An unexpected error occurred in this panel. Your data is safe.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
