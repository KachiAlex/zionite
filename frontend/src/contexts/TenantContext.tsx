import { createContext, useContext, useEffect } from 'react'
import { useTenant } from '../lib/api'
import type { Tenant } from '../lib/api'

interface TenantContextType {
  tenant: Tenant | null
  isLoading: boolean
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data: tenant, isLoading } = useTenant()

  useEffect(() => {
    if (tenant?.primary_color) {
      document.documentElement.style.setProperty('--gold', tenant.primary_color)
    }
  }, [tenant?.primary_color])

  return (
    <TenantContext.Provider value={{ tenant: tenant || null, isLoading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenantContext() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenantContext must be used within TenantProvider')
  return ctx
}
