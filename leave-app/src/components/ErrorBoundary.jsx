import { Component } from 'react'
import { C, Btn } from './UI'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('Unhandled error:', error, info) }

  render() {
    if (this.state.error) {
      return (
        <div style={{ textAlign: 'center', padding: '52px 16px' }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚠</div>
          <div style={{ fontFamily: C.serif, fontSize: 18, marginBottom: 6 }}>Something went wrong</div>
          <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 18 }}>
            This section couldn't be displayed. Try again or switch tabs.
          </div>
          <Btn onClick={() => this.setState({ error: null })}>Try again</Btn>
        </div>
      )
    }
    return this.props.children
  }
}
