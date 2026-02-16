import type { ReactNode } from "react"

/**
 * Auth-ready root layout. For now always renders children.
 * Later: add Supabase Auth check and redirect to login when unauthenticated.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
