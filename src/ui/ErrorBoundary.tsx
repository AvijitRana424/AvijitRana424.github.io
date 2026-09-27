import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  name: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Keeps one broken section from blanking the whole page. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] crashed`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            style={{ padding: 24, margin: '24px auto', maxWidth: 720, border: '1px dashed var(--chalk-faint)', borderRadius: 12, color: 'var(--chalk-dim)' }}
          >
            <strong style={{ color: 'var(--chalk-red)' }}>{this.props.name}</strong> failed to render: {this.state.error.message}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
