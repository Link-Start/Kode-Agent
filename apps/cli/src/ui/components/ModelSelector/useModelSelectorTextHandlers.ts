import type { ModelSelectorState } from './useModelSelectorState'

export function useModelSelectorTextHandlers(state: ModelSelectorState) {
  function handleCursorOffsetChange(offset: number) {
    state.setCursorOffset(offset)
  }

  function handleApiKeyChange(value: string) {
    state.setApiKeyEdited(true)
    // This field stores an environment-variable name, not a credential value.
    state.setApiKeyEnv(value)
    state.setCursorOffset(value.length)
  }

  function handleModelSearchChange(value: string) {
    state.setModelSearchQuery(value)
    state.setModelSearchCursorOffset(value.length)
  }

  function handleModelSearchCursorOffsetChange(offset: number) {
    state.setModelSearchCursorOffset(offset)
  }

  return {
    handleCursorOffsetChange,
    handleApiKeyChange,
    handleModelSearchChange,
    handleModelSearchCursorOffsetChange,
  }
}

export type ModelSelectorTextHandlers = ReturnType<
  typeof useModelSelectorTextHandlers
>
