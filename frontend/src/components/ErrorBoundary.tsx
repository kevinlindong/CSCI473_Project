import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; info: ErrorInfo | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', background: '#fff', color: '#000', minHeight: '100vh' }}>
        <h1 style={{ color: '#C85544', fontSize: 24, marginBottom: 12 }}>Render error</h1>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f6f0', padding: 12, border: '1px solid #ccc' }}>
          {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
        </pre>
        {this.state.info?.componentStack && (
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f6f0', padding: 12, border: '1px solid #ccc', marginTop: 12 }}>
            {this.state.info.componentStack}
          </pre>
        )}
      </div>
    )
  }
}
