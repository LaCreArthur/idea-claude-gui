import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './codicon.css';
import './styles/app.less';
import i18n from './i18n/config';
import { setupSlashCommandsCallback } from './components/ChatInputBox/providers/slashCommandProvider';
import { sendBridgeEvent } from './utils/bridge';

// vConsole debugging tool
const enableVConsole =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_VCONSOLE === 'true';

if (enableVConsole) {
  void import('vconsole').then(({ default: VConsole }) => {
    new VConsole();
    // Move vConsole button to bottom-left to avoid blocking send button in bottom-right
    setTimeout(() => {
      const vcSwitch = document.getElementById('__vconsole') as HTMLElement;
      if (vcSwitch) {
        vcSwitch.style.left = '10px';
        vcSwitch.style.right = 'auto';
      }
    }, 100);
  });
}

/**
 * Apply IDEA editor font configuration to CSS variables
 */
function applyFontConfig(config: { fontFamily: string; fontSize: number; lineSpacing: number; fallbackFonts?: string[] }) {
  const root = document.documentElement;

  // Build font family string including primary font, fallback fonts and system default fallbacks
  const fontParts: string[] = [`'${config.fontFamily}'`];

  // Add IDEA configured fallback fonts
  if (config.fallbackFonts && config.fallbackFonts.length > 0) {
    for (const fallback of config.fallbackFonts) {
      fontParts.push(`'${fallback}'`);
    }
  }

  // Add system default fallback fonts
  fontParts.push("'Consolas'", 'monospace');

  const fontFamily = fontParts.join(', ');

  root.style.setProperty('--idea-editor-font-family', fontFamily);
  root.style.setProperty('--idea-editor-font-size', `${config.fontSize}px`);
  root.style.setProperty('--idea-editor-line-spacing', String(config.lineSpacing));

  console.log('[Main] Applied IDEA font config:', config, 'fontFamily CSS:', fontFamily);
}

/**
 * Apply IDEA language configuration to i18n
 */
function applyLanguageConfig(config: { language: string }) {
  const { language } = config;
  
  // Validate that the language is supported
  const supportedLanguages = ['en', 'zh', 'zh-TW', 'es', 'fr', 'hi', 'ja'];
  const targetLanguage = supportedLanguages.includes(language) ? language : 'en';
  
  console.log('[Main] Applying IDEA language config:', language, '-> ' + targetLanguage);
  
  // Update i18n language
  i18n.changeLanguage(targetLanguage).then(() => {
    // Save to localStorage for consistency
    localStorage.setItem('language', targetLanguage);
    console.log('[Main] Language changed to:', targetLanguage);
  }).catch((error) => {
    console.error('[Main] Failed to change language:', error);
  });
}

// Register applyIdeaFontConfig function
window.applyIdeaFontConfig = applyFontConfig;

// Register applyIdeaLanguageConfig function
window.applyIdeaLanguageConfig = applyLanguageConfig;

// Check for pending font configuration (Java side may execute before JS)
if (window.__pendingFontConfig) {
  console.log('[Main] Found pending font config, applying...');
  applyFontConfig(window.__pendingFontConfig);
  delete window.__pendingFontConfig;
}

// Check for pending language configuration (Java side may execute before JS)
if (window.__pendingLanguageConfig) {
  console.log('[Main] Found pending language config, applying...');
  applyLanguageConfig(window.__pendingLanguageConfig);
  delete window.__pendingLanguageConfig;
}

// Pre-register updateSlashCommands to avoid backend call before React initialization
if (typeof window !== 'undefined' && !window.updateSlashCommands) {
  console.log('[Main] Pre-registering updateSlashCommands placeholder');
  window.updateSlashCommands = (json: string) => {
    console.log('[Main] Storing pending slash commands, length=' + json.length);
    window.__pendingSlashCommands = json;
  };
}

// 渲染 React 应用
ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

/**
 * 等待 sendToJava 桥接函数可用
 */
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

// 等待桥接可用后，初始化斜杠命令
waitForBridge(() => {
  console.log('[Main] Bridge ready, setting up slash commands');
  setupSlashCommandsCallback();

  console.log('[Main] Sending frontend_ready signal');
  sendBridgeEvent('frontend_ready');

  console.log('[Main] Sending refresh_slash_commands request');
  sendBridgeEvent('refresh_slash_commands');
});
