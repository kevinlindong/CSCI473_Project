// Auth gate is currently disabled — the component is kept so it can be
// re-enabled later by restoring the original user/loading checks.
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
