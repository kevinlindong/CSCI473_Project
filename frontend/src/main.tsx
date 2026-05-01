import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { EditorBridgeProvider } from './contexts/EditorBridgeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ScootFab } from './components/ScootFab'
import { ErrorBoundary } from './components/ErrorBoundary'
import Home from './pages/Home.tsx'
import PaperEditor from './pages/PaperEditor.tsx'
import PaperBrowse from './pages/PaperBrowse.tsx'
import Library from './pages/Library.tsx'
import TopicGraph3D from './pages/TopicGraph3D.tsx'
import Settings from './pages/Settings.tsx'

function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <>
      {/* key=pathname replays .page-enter on each route mount; display:contents keeps h-screen pages working. */}
      <div key={location.pathname} className="page-enter" style={{ display: 'contents' }}>
        {children}
      </div>
      <ScootFab />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
      <EditorBridgeProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/landing" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/profile" element={<Navigate to="/library" replace />} />
            <Route path="/editor" element={<Navigate to="/editor/scratch" replace />} />
            <Route path="/editor/:repoId" element={<PaperEditor />} />
            <Route path="/browse" element={<PaperBrowse />} />
            <Route path="/library" element={<Library />} />
            <Route path="/topic-graph" element={<TopicGraph3D />} />
            <Route path="/papers" element={<Navigate to="/browse" replace />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AppShell>
      </EditorBridgeProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
