interface McpHelpDialogProps {
  onClose: () => void;
}

/**
 * MCP Help Dialog
 */
export function McpHelpDialog({ onClose }: McpHelpDialogProps) {
  // Click overlay to close
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog mcp-help-dialog">
        <div className="dialog-header">
          <h3>What is MCP?</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-body">
          <div className="help-content">
            <section className="help-section">
              <h4>
                <span className="codicon codicon-info"></span>
                Model Context Protocol
              </h4>
              <p>
                MCP (Model Context Protocol) is an open protocol developed by Anthropic that allows AI models to safely access external tools and data sources.
              </p>
            </section>

            <section className="help-section">
              <h4>
                <span className="codicon codicon-rocket"></span>
                Key Features
              </h4>
              <ul>
                <li><strong>Tool Extension</strong>: Add capabilities like file system and network access to Claude</li>
                <li><strong>Data Connection</strong>: Connect to external data sources such as databases and APIs</li>
                <li><strong>Security & Control</strong>: Strict permission control and data isolation</li>
                <li><strong>Easy Integration</strong>: Support for multiple programming languages and runtime environments</li>
              </ul>
            </section>

            <section className="help-section">
              <h4>
                <span className="codicon codicon-book"></span>
                Configuration Methods
              </h4>
              <p>Two configuration types supported:</p>
              <ul>
                <li>
                  <strong>STDIO</strong>: Communicate with local processes via standard input/output
                  <code className="inline-code">Started with npx/uvx commands</code>
                </li>
                <li>
                  <strong>HTTP/SSE</strong>: Communicate with remote servers over network
                  <code className="inline-code">URL address</code>
                </li>
              </ul>
            </section>

            <section className="help-section">
              <h4>
                <span className="codicon codicon-link-external"></span>
                Learn More
              </h4>
              <p>
                Visit official documentation:
                <a
                  href="https://modelcontextprotocol.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link"
                >
                  modelcontextprotocol.io
                  <span className="codicon codicon-link-external"></span>
                </a>
              </p>
            </section>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
