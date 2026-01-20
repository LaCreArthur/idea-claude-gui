import { copyToClipboard } from '../../utils/copyUtils';

interface SkillHelpDialogProps {
  onClose: () => void;
}

export function SkillHelpDialog({ onClose }: SkillHelpDialogProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLinkClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    const success = await copyToClipboard(url);
    if (success) {
      alert('Link copied, please open in browser');
    }
  };

  return (
    <div className="skill-dialog-backdrop" onClick={handleBackdropClick}>
      <div className="skill-dialog help-dialog">
        <div className="dialog-header">
          <h3>What are Skills?</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-content help-content">
          <section className="help-section">
            <h4>
              <span className="codicon codicon-extensions"></span>
              Overview
            </h4>
            <p>
              Skills are dynamically loaded instruction sets, scripts, and resource folders that enhance Claude's performance for specific tasks. Skills teach Claude how to complete particular tasks in a repeatable way, such as creating documents using company brand guidelines, analyzing data following organization-specific workflows, or automating personal tasks.
            </p>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-folder"></span>
              Skill Structure
            </h4>
            <p>A Skill is a folder containing a SKILL.md file:</p>
            <pre className="code-block">
{`my-skill/
├── SKILL.md          # Required: skill definition file
├── templates/        # Optional: template files
└── references/       # Optional: reference materials`}
            </pre>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-file-code"></span>
              SKILL.md Format
            </h4>
            <p>SKILL.md files use YAML frontmatter + Markdown format:</p>
            <pre className="code-block">
{`---
name: my-skill-name
description: Skill description and when to use
---

# Skill Instructions

Detailed instruction content...`}
            </pre>
            <p className="hint-text">
              name and description are required fields. Optional fields include license, allowed-tools, metadata
            </p>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-gear"></span>
              Configuration Methods
            </h4>
            <p>Ways to add a Skill:</p>
            <ul>
              <li>
                <strong>Local Path</strong>: Specify folder path containing SKILL.md
              </li>
              <li>
                <strong>Relative Path</strong>: Relative to project root, e.g., ./skills/my-skill
              </li>
              <li>
                <strong>Absolute Path</strong>: Complete filesystem path
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-lightbulb"></span>
              Usage Tips
            </h4>
            <ul>
              <li>Ensure Skill directory contains a valid SKILL.md file</li>
              <li>Skill names must use lowercase letters, numbers, and hyphens (hyphen-case)</li>
              <li>Skills automatically take effect in Claude sessions after loading</li>
              <li>Control individual Skill status with enable/disable toggles</li>
              <li>Mention Skill name in chat to use it, e.g., "Use the pdf skill to extract form fields"</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-link-external"></span>
              Learn More
            </h4>
            <p>More information about Skills:</p>
            <ul>
              <li>
                <a
                  href="https://support.claude.com/en/articles/12512176-what-are-skills"
                  onClick={(e) => handleLinkClick(e, 'https://support.claude.com/en/articles/12512176-what-are-skills')}
                >
                  What are Skills?
                </a>
              </li>
              <li>
                <a
                  href="https://support.claude.com/en/articles/12512198-creating-custom-skills"
                  onClick={(e) => handleLinkClick(e, 'https://support.claude.com/en/articles/12512198-creating-custom-skills')}
                >
                  Creating Custom Skills
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/anthropics/skills"
                  onClick={(e) => handleLinkClick(e, 'https://github.com/anthropics/skills')}
                >
                  Anthropic Skills Example Repository
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="dialog-footer">
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
