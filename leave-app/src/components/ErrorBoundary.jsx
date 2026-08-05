import { Component } from 'react'
import { C, btnStyle } from './UI'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 18 }}>
            This section couldn't be displayed. Try again or switch tabs.
          </div>
          <button onClick={() => this.setState({ error: null })} style={btnStyle(C.green, '#fff')}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
