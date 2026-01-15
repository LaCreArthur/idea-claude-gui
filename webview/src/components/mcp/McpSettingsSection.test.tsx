import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { McpSettingsSection } from './McpSettingsSection';

// Mock the bridge
vi.mock('../../utils/bridge', () => ({
  sendToJava: vi.fn(),
}));

// Mock the sub-components to simplify testing
vi.mock('./McpServerDialog', () => ({
  McpServerDialog: () => null,
}));
vi.mock('./McpPresetDialog', () => ({
  McpPresetDialog: () => null,
}));
vi.mock('./McpHelpDialog', () => ({
  McpHelpDialog: () => null,
}));
vi.mock('./McpConfirmDialog', () => ({
  McpConfirmDialog: () => null,
}));

import { sendToJava } from '../../utils/bridge';

describe('McpSettingsSection', () => {
  const mockServer = {
    id: 'test-server',
    name: 'Test Server',
    description: 'A test MCP server',
    enabled: true,
    apps: { claude: true },
    server: { command: 'npx', args: ['test-server'] },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up window callbacks that the component registers
    (window as any).updateMcpServers = undefined;
    (window as any).updateMcpServerStatus = undefined;
  });

  it('renders loading state initially', () => {
    render(<McpSettingsSection />);

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders server list after loading', async () => {
    render(<McpSettingsSection />);

    // Simulate server data coming back
    const updateServers = (window as any).updateMcpServers;
    expect(updateServers).toBeDefined();

    updateServers(JSON.stringify([mockServer]));

    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument();
    });
  });

  it('renders toggle switch for each server', async () => {
    render(<McpSettingsSection />);

    // Simulate server data
    (window as any).updateMcpServers(JSON.stringify([mockServer]));

    await waitFor(() => {
      // Toggle should be rendered (checkbox input)
      const toggle = screen.getByRole('checkbox');
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();
    });
  });

  it('calls sendToJava when toggle is clicked', async () => {
    render(<McpSettingsSection />);

    // Simulate server data
    (window as any).updateMcpServers(JSON.stringify([mockServer]));

    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument();
    });

    // Find and click the toggle
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);

    // Should call sendToJava with toggle_mcp_server
    expect(sendToJava).toHaveBeenCalledWith('toggle_mcp_server', expect.objectContaining({
      id: 'test-server',
      enabled: false,
    }));
  });

  it('uses English strings for toast messages (not Chinese)', async () => {
    render(<McpSettingsSection />);

    // Simulate server data
    (window as any).updateMcpServers(JSON.stringify([mockServer]));

    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument();
    });

    // Click toggle to disable
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);

    // Toast should show with i18n key (not Chinese characters)
    await waitFor(() => {
      // The toast message should use mcp.disabled key
      const toastText = document.body.textContent || '';
      // Should NOT contain Chinese characters
      expect(toastText).not.toMatch(/[\u4e00-\u9fff]/);
    });
  });

  it('shows disabled server with visual indicator', async () => {
    const disabledServer = { ...mockServer, enabled: false };
    render(<McpSettingsSection />);

    (window as any).updateMcpServers(JSON.stringify([disabledServer]));

    await waitFor(() => {
      const serverCard = document.querySelector('.server-card');
      expect(serverCard).toHaveClass('disabled');
    });
  });
});
