import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] px-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
              <h1 className="text-2xl font-bold text-[#1e3a5f] mb-3">Something went wrong</h1>
              <p className="text-gray-600 text-sm mb-6">
                We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
              </p>
              <button
                onClick={this.handleReload}
                className="bg-[#1e3a5f] text-[#FFF8F0] px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#0f1f35] transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
