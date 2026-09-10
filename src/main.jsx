import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// The launcher is intentionally a controlled surface. Disable the browser
// context menu everywhere, including on images and the terminal view.
document.addEventListener('contextmenu', (event) => event.preventDefault())

/* The whole window is frameless and drawn by React — if a component ever
   throws, React would unmount the ENTIRE tree and the user would be left
   staring at a blank window with no titlebar buttons. This boundary catches
   any render crash and shows an in-app recovery card instead, so one bad
   component can never blank the launcher. */
class ShellErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, detail: '' }
  }
  static getDerivedStateFromError(error) {
    return { crashed: true, detail: String(error?.message || error || '') }
  }
  componentDidCatch(error, info) {
    try { console.error('[soul-shell-crash]', error, info) } catch {}
  }
  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="app">
        <aside className="sidenav">
          <div className="sidenav-brand" title="Soul Launcher" onClick={() => window.location.reload()}>
            <span className="brand-badge"><img src="./icons/logo.png" width="26" height="26" alt="Soul" draggable={false} /></span>
            <span className="brand-word">Soul</span>
          </div>
        </aside>
        <div className="main-col">
          <main className="page-wrap">
            <div className="page">
              <div className="mods-empty">
                <div className="mods-empty-icon">!</div>
                <div>Something glitched on this screen</div>
                <div className="mods-empty-sub">
                  Your Spaces and worlds are untouched — this is only a display hiccup.
                  {this.state.detail ? ` (${this.state.detail.slice(0, 120)})` : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload launcher</button>
                  <button className="btn btn-secondary" onClick={() => this.setState({ crashed: false, detail: '' })}>Try this page again</button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShellErrorBoundary>
      <App />
    </ShellErrorBoundary>
  </React.StrictMode>,
)
