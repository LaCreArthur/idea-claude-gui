import { useCallback, useEffect, useRef, useState } from 'react';
import type { DropdownItemData, DropdownPosition, TriggerQuery } from '../types';

interface CompletionDropdownOptions<T> {
  trigger: string;
  provider: (query: string, signal: AbortSignal) => Promise<T[]>;
  toDropdownItem: (item: T) => DropdownItemData;
  onSelect: (item: T, query: TriggerQuery | null) => void;
  debounceMs?: number;
  minQueryLength?: number;
}

interface CompletionDropdownState {
  isOpen: boolean;
  items: DropdownItemData[];
  rawItems: unknown[];
  activeIndex: number;
  position: DropdownPosition | null;
  triggerQuery: TriggerQuery | null;
  loading: boolean;
  navigationMode: 'keyboard' | 'mouse';
}

export function useCompletionDropdown<T>({
  trigger: _trigger,
  provider,
  toDropdownItem,
  onSelect,
  debounceMs = 200,
  minQueryLength = 0,
}: CompletionDropdownOptions<T>) {
  void _trigger;
  const [state, setState] = useState<CompletionDropdownState>({
    isOpen: false,
    items: [],
    rawItems: [],
    activeIndex: 0,
    position: null,
    triggerQuery: null,
    loading: false,
    navigationMode: 'keyboard',
  });

  const debounceTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<CompletionDropdownState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const open = useCallback((position: DropdownPosition, triggerQuery: TriggerQuery) => {
    console.log('[useCompletionDropdown] open:', { position, triggerQuery });
    setState(prev => ({
      ...prev,
      isOpen: true,
      position,
      triggerQuery,
      activeIndex: 0,
      navigationMode: 'keyboard',
    }));
  }, []);

  const close = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isOpen: false,
      items: [],
      rawItems: [],
      triggerQuery: null,
      loading: false,
    }));
  }, []);

  const search = useCallback(async (query: string) => {
    const startedAt = performance.now?.() ?? Date.now();
    console.log('[useCompletionDropdown] search start:', { query });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (query.length < minQueryLength) {
      setState(prev => ({ ...prev, items: [], rawItems: [], loading: false }));
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState(prev => ({ ...prev, loading: true }));

    try {
      const results = await provider(query, controller.signal);

      if (controller.signal.aborted) return;

      const items = results.map(toDropdownItem);
      const endedAt = performance.now?.() ?? Date.now();
      const durationMs = (endedAt - startedAt).toFixed(1);
      console.log('[useCompletionDropdown] search done:', { query, resultsCount: results.length, durationMs });

      setState(prev => ({
        ...prev,
        items,
        rawItems: results as unknown[],
        loading: false,
        activeIndex: 0,
      }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;

      console.error('[useCompletionDropdown] Search error:', error);
      setState(prev => ({ ...prev, items: [], rawItems: [], loading: false }));
    }
  }, [provider, toDropdownItem, minQueryLength]);

  const debouncedSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      search(query);
    }, debounceMs);
  }, [search, debounceMs]);

  const updateQuery = useCallback((triggerQuery: TriggerQuery) => {
    console.log('[useCompletionDropdown] updateQuery:', triggerQuery);
    setState(prev => ({ ...prev, triggerQuery }));
    debouncedSearch(triggerQuery.query);
  }, [debouncedSearch]);

  const selectActive = useCallback(() => {
    const { activeIndex, rawItems, triggerQuery } = stateRef.current;
    if (activeIndex >= 0 && activeIndex < rawItems.length) {
      const item = rawItems[activeIndex] as T;
      onSelect(item, triggerQuery);
      close();
    }
  }, [onSelect, close]);

  const selectIndex = useCallback((index: number) => {
    const { rawItems, triggerQuery } = stateRef.current;
    if (index >= 0 && index < rawItems.length) {
      const item = rawItems[index] as T;
      onSelect(item, triggerQuery);
      close();
    }
  }, [onSelect, close]);

  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    const currentState = stateRef.current;

    if (!currentState.isOpen) return false;

    const { items } = currentState;
    const selectableCount = items.filter(
      i => i.type !== 'separator' && i.type !== 'section-header'
    ).length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (selectableCount === 0) return true;
        setState(prev => ({
          ...prev,
          activeIndex: (prev.activeIndex + 1) % selectableCount,
          navigationMode: 'keyboard',
        }));
        return true;

      case 'ArrowUp':
        e.preventDefault();
        if (selectableCount === 0) return true;
        setState(prev => ({
          ...prev,
          activeIndex: (prev.activeIndex - 1 + selectableCount) % selectableCount,
          navigationMode: 'keyboard',
        }));
        return true;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        selectActive();
        return true;

      case 'Escape':
        e.preventDefault();
        close();
        return true;

      default:
        return false;
    }
  }, [selectActive, close]);

  const handleMouseEnter = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      activeIndex: index,
      navigationMode: 'mouse',
    }));
  }, []);

  const replaceText = useCallback((
    fullText: string,
    replacement: string,
    triggerQuery: TriggerQuery | null
  ): string => {
    if (!triggerQuery) return fullText;

    const before = fullText.slice(0, triggerQuery.start);
    const after = fullText.slice(triggerQuery.end);

    return before + replacement + after;
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    isOpen: state.isOpen,
    items: state.items,
    activeIndex: state.activeIndex,
    position: state.position,
    triggerQuery: state.triggerQuery,
    loading: state.loading,
    navigationMode: state.navigationMode,

    open,
    close,
    updateQuery,
    handleKeyDown,
    handleMouseEnter,
    selectActive,
    selectIndex,
    replaceText,
  };
}

export default useCompletionDropdown;
