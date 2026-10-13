import { useLibraryStore } from '../../state/useLibraryStore'

// Persist only action categories/status. Never window text, goals, values or model evidence.
export function createTakeoverAudit() {
  const sessionId = crypto.randomUUID()
  return async <T,>(operation: string, confirmed: boolean, execute: () => Promise<T>): Promise<T> => {
    const start = performance.now()
    let success = false
    let denied = false
    try { const result = await execute(); success = true; return result }
    catch (error) { denied = /PERMISSION|DENIED|POLICY_CHANGED|SESSION_|CONFIRMATION_REQUIRED|STOPPED/.test(String(error)); throw error }
    finally {
      useLibraryStore.getState().addCompanionAudit([{
        id: crypto.randomUUID(), timestamp: new Date().toISOString(), sessionId,
        toolName: `computer.takeover.${operation}`, arguments: { operation },
        permissionDecision: denied ? 'denied' : 'allowed', resultStatus: success ? 'success' : 'error',
        durationMs: Math.round(performance.now() - start), confirmed,
        ...(success ? {} : { errorCode: 'ExecutionFailed' as const }),
      }])
    }
  }
}
