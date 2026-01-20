import type { DropdownItemData } from '../types';
import type { AgentConfig } from '../../../types/agent';
import { sendBridgeEvent } from '../../../utils/bridge';

export interface AgentItem {
  id: string;
  name: string;
  prompt?: string;
}

type LoadingState = 'idle' | 'loading' | 'success' | 'failed';

let cachedAgents: AgentItem[] = [];
let loadingState: LoadingState = 'idle';
let lastRefreshTime = 0;
let callbackRegistered = false;
let retryCount = 0;
let pendingWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

const MIN_REFRESH_INTERVAL = 2000;
const LOADING_TIMEOUT = 3000;
const MAX_RETRY_COUNT = 2;

export function resetAgentsState() {
  cachedAgents = [];
  loadingState = 'idle';
  lastRefreshTime = 0;
  retryCount = 0;
  pendingWaiters.forEach(w => w.reject(new Error('Agents state reset')));
  pendingWaiters = [];
}

export function setupAgentsCallback() {
  if (typeof window === 'undefined') return;
  if (callbackRegistered && window.updateAgents) return;

  const handler = (json: string) => {
    try {
      const parsed = JSON.parse(json);
      let agents: AgentItem[] = [];

      if (Array.isArray(parsed)) {
        agents = parsed.map((agent: AgentConfig) => ({
          id: agent.id,
          name: agent.name,
          prompt: agent.prompt,
        }));
      }

      cachedAgents = agents;
      loadingState = 'success';
      retryCount = 0;
      pendingWaiters.forEach(w => w.resolve());
      pendingWaiters = [];
    } catch (error) {
      loadingState = 'failed';
      pendingWaiters.forEach(w => w.reject(error));
      pendingWaiters = [];
    }
  };

  const originalHandler = window.updateAgents;

  window.updateAgents = (json: string) => {
    handler(json);
    originalHandler?.(json);
  };

  callbackRegistered = true;
}

function waitForAgents(signal: AbortSignal, timeoutMs: number): Promise<void> {
  if (loadingState === 'success') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const waiter = { resolve: () => {}, reject: (_error: unknown) => {} } as {
      resolve: () => void;
      reject: (error: unknown) => void;
    };

    const cleanup = () => {
      pendingWaiters = pendingWaiters.filter(w => w !== waiter);
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Agents loading timeout'));
    }, timeoutMs);

    signal.addEventListener('abort', onAbort, { once: true });

    waiter.resolve = () => {
      cleanup();
      resolve();
    };
    waiter.reject = (error: unknown) => {
      cleanup();
      reject(error);
    };

    pendingWaiters.push(waiter);
  });
}

function requestRefresh(): boolean {
  const now = Date.now();

  if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
    return false;
  }

  if (retryCount >= MAX_RETRY_COUNT) {
    loadingState = 'failed';
    return false;
  }

  const attempt = retryCount + 1;
  const sent = sendBridgeEvent('get_agents');
  if (!sent) {
    return false;
  }

  lastRefreshTime = now;
  loadingState = 'loading';
  retryCount = attempt;

  return true;
}

function filterAgents(agents: AgentItem[], query: string): AgentItem[] {
  if (!query) return agents;

  const lowerQuery = query.toLowerCase();
  return agents.filter(agent =>
    agent.name.toLowerCase().includes(lowerQuery) ||
    agent.prompt?.toLowerCase().includes(lowerQuery)
  );
}

export const CREATE_NEW_AGENT_ID = '__create_new__';
export const EMPTY_STATE_ID = '__empty_state__';

export async function agentProvider(
  query: string,
  signal: AbortSignal
): Promise<AgentItem[]> {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  setupAgentsCallback();

  const now = Date.now();

  const createNewAgentItem: AgentItem = {
    id: CREATE_NEW_AGENT_ID,
    name: 'Create Agent',
    prompt: '',
  };

  if (loadingState === 'idle' || loadingState === 'failed') {
    requestRefresh();
  } else if (loadingState === 'loading' && now - lastRefreshTime > LOADING_TIMEOUT) {
    loadingState = 'failed';
    requestRefresh();
  }

  if (loadingState !== 'success') {
    await waitForAgents(signal, LOADING_TIMEOUT).catch(() => {});
  }

  if (loadingState !== 'success') {
    return [{
      id: EMPTY_STATE_ID,
      name: retryCount >= MAX_RETRY_COUNT ? 'Failed to load agents' : 'No agents configured',
      prompt: '',
    }, createNewAgentItem];
  }

  const filtered = cachedAgents.length > 0 ? filterAgents(cachedAgents, query) : [];

  if (filtered.length === 0) {
    return [{
      id: EMPTY_STATE_ID,
      name: 'No agents configured',
      prompt: '',
    }, createNewAgentItem];
  }

  return [...filtered, createNewAgentItem];
}

export function agentToDropdownItem(agent: AgentItem): DropdownItemData {
  if (agent.id === '__loading__' || agent.id === '__empty__' || agent.id === EMPTY_STATE_ID) {
    return {
      id: agent.id,
      label: agent.name,
      description: agent.prompt,
      icon: agent.id === EMPTY_STATE_ID ? 'codicon-info' : 'codicon-robot',
      type: 'info',
      data: { agent },
    };
  }

  if (agent.id === CREATE_NEW_AGENT_ID) {
    return {
      id: agent.id,
      label: agent.name,
      description: 'Create a new agent',
      icon: 'codicon-add',
      type: 'agent',
      data: { agent },
    };
  }

  return {
    id: agent.id,
    label: agent.name,
    description: agent.prompt ?
      (agent.prompt.length > 60 ? agent.prompt.substring(0, 60) + '...' : agent.prompt) :
      undefined,
    icon: 'codicon-robot',
    type: 'agent',
    data: { agent },
  };
}

export function forceRefreshAgents(): void {
  loadingState = 'idle';
  lastRefreshTime = 0;
  retryCount = 0;
  pendingWaiters.forEach(w => w.reject(new Error('Agents refresh requested')));
  pendingWaiters = [];
  requestRefresh();
}

export default agentProvider;
