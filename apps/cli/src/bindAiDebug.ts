import { bindAiDebug, bindAiRequestStatus, bindAiRuntime } from '@kode/ai'
import {
  debug,
  getCurrentRequest,
  logAPIError,
  logLLMInteraction,
  logSystemPromptConstruction,
} from '#core/utils/debugLogger'
import { getGlobalConfig } from '#core/utils/config'
import { getModelManager } from '#core/utils/model'
import { logError } from '#core/utils/log'
import { addToTotalCost } from '#core/cost-tracker'
import {
  setRequestStatus,
  setRequestInputTokens,
  updateRequestTokens,
} from '#core/utils/requestStatus'

/**
 * Attach core diagnostics and runtime knobs to @kode/ai so provider transport
 * keeps full logs/status without hard-depending on those core modules.
 *
 * Adapter factory defaults to the in-package ModelAdapterFactory; no host bind
 * is required for the Responses API path.
 */
export function bindAiDebugFromCore(): void {
  bindAiDebug({
    debug,
    getCurrentRequest: () => {
      const current = getCurrentRequest()
      return current?.id ? { id: current.id } : null
    },
    logAPIError,
    // Core sinks take richer context shapes; the @kode/ai bindings accept
    // `unknown`, so adapt via wrappers to satisfy strictFunctionTypes.
    logLLMInteraction: context =>
      logLLMInteraction(context as Parameters<typeof logLLMInteraction>[0]),
    logSystemPromptConstruction: context =>
      logSystemPromptConstruction(
        context as Parameters<typeof logSystemPromptConstruction>[0],
      ),
  })
  bindAiRequestStatus({
    setRequestStatus: status =>
      setRequestStatus(status as Parameters<typeof setRequestStatus>[0]),
    setRequestInputTokens,
    updateRequestTokens,
  })
  bindAiRuntime({
    getProxy: () => getGlobalConfig().proxy,
    getStream: () => getGlobalConfig().stream !== false,
    getMainModelProfile: () => getModelManager().getModel('main'),
    logError,
    addToTotalCost,
  })
}
