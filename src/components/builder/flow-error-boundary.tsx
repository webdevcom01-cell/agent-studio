"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class FlowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-semibold">A node caused an error</p>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error?.message ?? "Unknown error"}
            </p>
          </div>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Reload Canvas
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
