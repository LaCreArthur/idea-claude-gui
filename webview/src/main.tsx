import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './codicon.css';
import './styles/app.less';
import { setupSlashCommandsCallback } from './components/ChatInputBox/providers/slashCommandProvider';
import { sendBridgeEvent } from './utils/bridge';

function applyFontConfig(config: { fontFamily: string; fontSize: number; lineSpacing: number; fallbackFonts?: string[] }) {
  const root = document.documentElement;

  const fontParts: string[] = [`'${config.fontFamily}'`];

  if (config.fallbackFonts && config.fallbackFonts.length > 0) {
    for (const fallback of config.fallbackFonts) {
      fontParts.push(`'${fallback}'`);
    }
  }

  fontParts.push("'Consolas'", 'monospace');

  const fontFamily = fontParts.join(', ');

  root.style.setProperty('--idea-editor-font-family', fontFamily);
  root.style.setProperty('--idea-editor-font-size', `${config.fontSize}px`);
  root.style.setProperty('--idea-editor-line-spacing', String(config.lineSpacing));

  console.log('[Main] Applied IDEA font config:', config, 'fontFamily CSS:', fontFamily);
}

window.applyIdeaFontConfig = applyFontConfig;

if (window.__pendingFontConfig) {
  console.log('[Main] Found pending font config, applying...');
  applyFontConfig(window.__pendingFontConfig);
  delete window.__pendingFontConfig;
}

if (typeof window !== 'undefined' && !window.updateSlashCommands) {
  console.log('[Main] Pre-registering updateSlashCommands placeholder');
  window.updateSlashCommands = (json: string) => {
    console.log('[Main] Storing pending slash commands, length=' + json.length);
    window.__pendingSlashCommands = json;
  };
}

if (typeof window !== 'undefined' && !window.setSessionId) {
  console.log('[Main] Pre-registering setSessionId placeholder');
  window.setSessionId = (sessionId: string) => {
    console.log('[Main] Storing pending session ID:', sessionId);
    (window as any).__pendingSessionId = sessionId;
  };
}

if (typeof window !== 'undefined' && !window.updateDependencyStatus) {
  console.log('[Main] Pre-registering updateDependencyStatus placeholder');
  window.updateDependencyStatus = (json: string) => {
    console.log('[Main] Storing pending dependency status, length=' + (json ? json.length : 0));
    window.__pendingDependencyStatus = json;
  };
}

if (typeof window !== 'undefined' && !window.dependencyUpdateAvailable) {
  console.log('[Main] Pre-registering dependencyUpdateAvailable placeholder');
  window.dependencyUpdateAvailable = (json: string) => {
    console.log('[Main] Storing pending dependency updates, length=' + (json ? json.length : 0));
    window.__pendingDependencyUpdates = json;
  };
}

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

function waitForBridge(callback: () => void, maxAttempts = 50, interval = 100) {
  let attempts = 0;

  const check = () => {
    attempts++;
    if (window.sendToJava) {
      console.log('[Main] Bridge available after ' + attempts + ' attempts');
      callback();
    } else if (attempts < maxAttempts) {
      setTimeout(check, interval);
    } else {
      console.error('[Main] Bridge not available after ' + maxAttempts + ' attempts');
    }
  };

  check();
}

waitForBridge(() => {
  console.log('[Main] Bridge ready, setting up slash commands');
  setupSlashCommandsCallback();

  console.log('[Main] Sending frontend_ready signal');
  sendBridgeEvent('frontend_ready');

  console.log('[Main] Sending refresh_slash_commands request');
  sendBridgeEvent('refresh_slash_commands');

  console.log('[Main] Requesting dependency status');
  sendBridgeEvent('get_dependency_status');
});
