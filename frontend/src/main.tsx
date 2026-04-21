import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { EditorBridgeProvider } from './contexts/EditorBridgeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AIAgentFab } from './components/AIAgentFab'
import { ErrorBoundary } from './components/ErrorBoundary'
import Landing from './pages/Landing.tsx'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import Editor from './pages/Editor.tsx'
import PaperEditor from './pages/PaperEditor.tsx'
import PaperBrowse from './pages/PaperBrowse.tsx'
import Repos from './pages/Repos.tsx'
import MyRepos from './pages/MyRepos.tsx'
import Profile from './pages/Profile.tsx'
import Diff from './pages/Diff.tsx'
import Chat from './pages/Chat.tsx'
import AuraStore from './pages/AuraStore.tsx'
import Graph_Creation from './pages/Graph_Creation.tsx'
import Settings from './pages/Settings.tsx'
import HowItWorks from './pages/HowItWorks.tsx'
import PublicRepos from './pages/PublicRepos.tsx'
import TermsOfService from './pages/TermsOfService.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import HomeV1 from './pages/HomeV1.tsx'
import HomeV2 from './pages/HomeV2.tsx'
import HomeV3 from './pages/HomeV3.tsx'
import HomeV4 from './pages/HomeV4.tsx'
import HomeV5 from './pages/HomeV5.tsx'

// Renders AIAgentFab on all pages except landing, home (inline chatbox), and login
function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const hideOn = new Set(['/', '/home', '/login', '/explore', '/how-it-works', '/browse', '/1', '/2', '/3', '/4', '/5'])
  const isEditor = location.pathname.startsWith('/editor/')
  const isLegacyEditor = location.pathname.startsWith('/editor/legacy/')
  const showFab = !hideOn.has(location.pathname) && (!isEditor || isLegacyEditor)
  return (
    <>
      {children}
      {showFab && <AIAgentFab bottomClass={isEditor ? 'bottom-12' : 'bottom-6'} />}
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
            <Route path="/" element={<Landing />} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/editor" element={<Navigate to="/editor/scratch" replace />} />
            <Route path="/editor/legacy/:repoId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
            <Route path="/editor/:repoId" element={<PaperEditor />} />
            <Route path="/browse" element={<PaperBrowse />} />
            <Route path="/papers" element={<Navigate to="/browse" replace />} />
            <Route path="/explore" element={<PublicRepos />} />
            <Route path="/repos" element={<ProtectedRoute><Repos /></ProtectedRoute>} />
            <Route path="/my-repos" element={<ProtectedRoute><MyRepos /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/diff/:repoId" element={<ProtectedRoute><Diff /></ProtectedRoute>} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/store" element={<ProtectedRoute><AuraStore /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/graph" element={<Graph_Creation />} />
            <Route path="/1" element={<HomeV1 />} />
            <Route path="/2" element={<HomeV2 />} />
            <Route path="/3" element={<HomeV3 />} />
            <Route path="/4" element={<HomeV4 />} />
            <Route path="/5" element={<HomeV5 />} />
          </Routes>
        </AppShell>
      </EditorBridgeProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
