import { useState, useEffect } from 'react';
import type { AgentConfig } from '../types/agent';

interface AgentDialogProps {
  isOpen: boolean;
  agent?: AgentConfig | null;
  onClose: () => void;
  onSave: (data: { name: string; prompt: string }) => void;
}

export default function AgentDialog({
  isOpen,
  agent,
  onClose,
  onSave,
}: AgentDialogProps) {
  const isAdding = !agent;

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (agent) {
        setName(agent.name || '');
        setPrompt(agent.prompt || '');
      } else {
        setName('');
        setPrompt('');
      }
      setNameError('');
    }
  }, [isOpen, agent]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 20) {
      setName(value);
      setNameError('');
    }
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= 10000) {
      setPrompt(value);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Please enter agent name');
      return;
    }

    onSave({
      name: name.trim(),
      prompt: prompt.trim(),
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog agent-dialog">
        <div className="dialog-header">
          <h3>{isAdding ? 'Create Agent' : 'Edit Agent'}</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-body">
          <div className="form-group">
            <label htmlFor="agentName">
              Name
              <span className="required">*</span>
            </label>
            <div className="input-with-counter">
              <input
                id="agentName"
                type="text"
                className={`form-input ${nameError ? 'has-error' : ''}`}
                placeholder="Enter agent name"
                value={name}
                onChange={handleNameChange}
                maxLength={20}
              />
              <span className="char-counter">{name.length}/20</span>
            </div>
            {nameError && (
              <p className="form-error">
                <span className="codicon codicon-error" />
                {nameError}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="agentPrompt">
              Prompt
            </label>
            <div className="textarea-with-counter">
              <textarea
                id="agentPrompt"
                className="form-textarea"
                placeholder="Enter the agent's role, tone, workflow, tool preferences and rules. (Optional)"
                value={prompt}
                onChange={handlePromptChange}
                maxLength={10000}
                rows={8}
              />
              <span className="char-counter">{prompt.length}/10000</span>
            </div>
            <small className="form-hint">The prompt will be sent to AI as system instructions at the start of conversation</small>
          </div>
        </div>

        <div className="dialog-footer">
          <div className="footer-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              <span className="codicon codicon-close" />
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <span className="codicon codicon-save" />
              {isAdding ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
