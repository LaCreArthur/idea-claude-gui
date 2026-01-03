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
                MCP (Model Context Protocol) is an open protocol developed by Anthropic
                that enables AI models to securely access external tools and data sources.
              </p>
            </section>

            <section className="help-section">
              <h4>
                <span className="codicon codicon-rocket"></span>
                Key Features
              </h4>
              <ul>
                <li><strong>Tool Extensions</strong>: Add file system, network access, and other capabilities to Claude</li>
                <li><strong>Data Connections</strong>: Connect to databases, APIs, and other external data sources</li>
                <li><strong>Secure & Controlled</strong>: Strict permission controls and data isolation</li>
                <li><strong>Easy Integration</strong>: Supports multiple programming languages and runtime environments</li>
              </ul>
            </section>

            <section className="help-section">
              <h4>
                <span className="codicon codicon-book"></span>
                Configuration Types
              </h4>
              <p>Two configuration types are supported:</p>
              <ul>
                <li>
                  <strong>STDIO</strong>: Communicate with local processes via standard I/O
                  <code className="inline-code">npx/uvx command startup</code>
                </li>
                <li>
                  <strong>HTTP/SSE</strong>: Communicate with remote servers via network
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
                Visit the official documentation:
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
