import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock localStorage (used by i18n config)
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock vscode API (provided by IntelliJ webview)
const mockVscode = {
  postMessage: vi.fn(),
};

Object.defineProperty(window, 'vscode', {
  value: mockVscode,
  writable: true,
});

// Mock i18n to return keys as values
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
