import { copyToClipboard } from '../../utils/helpers';

interface SkillHelpDialogProps {
  onClose: () => void;
}

/**
 * Skills 帮助弹窗
 * 解释什么是 Skills 以及如何使用
 */
export function SkillHelpDialog({ onClose }: SkillHelpDialogProps) {
  // 阻止事件冒泡
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 复制链接并提示
  const handleLinkClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    const success = await copyToClipboard(url);
    if (success) {
      alert('Link copied, please open in your browser');
    }
  };

  return (
    <div className="skill-dialog-backdrop" onClick={handleBackdropClick}>
      <div className="skill-dialog help-dialog">
        {/* 标题栏 */}
        <div className="dialog-header">
          <h3>What are Skills?</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        {/* 内容 */}
        <div className="dialog-content help-content">
          <section className="help-section">
            <h4>
              <span className="codicon codicon-extensions"></span>
              Overview
            </h4>
            <p>
              Skills are dynamically loaded folders of instructions, scripts, and resources that Claude uses to enhance performance on specific tasks.
              Skills can teach Claude to complete specific tasks in a repeatable way, such as creating documents using company brand guidelines,
              analyzing data according to organization-specific workflows, or automating personal tasks.
            </p>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-folder"></span>
              Skill Structure
            </h4>
            <p>A Skill is a folder containing a <code>SKILL.md</code> file:</p>
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
              SKILL.md 格式
            </h4>
            <p>The SKILL.md file uses YAML frontmatter + Markdown format:</p>
            <pre className="code-block">
{`---
name: my-skill-name
description: Skill description and when to use it
---

# Skill Instructions

Detailed instruction content...`}
            </pre>
            <p className="hint-text">
              <code>name</code> 和 <code>description</code> 是必填字段，
              可选字段包括 <code>license</code>、<code>allowed-tools</code>、<code>metadata</code>
            </p>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-gear"></span>
              Configuration
            </h4>
            <p>Ways to add a Skill:</p>
            <ul>
              <li>
                <strong>Local path</strong>: Specify the folder path containing <code>SKILL.md</code>
              </li>
              <li>
                <strong>Relative path</strong>: Relative to project root, e.g. <code>./skills/my-skill</code>
              </li>
              <li>
                <strong>Absolute path</strong>: Full file system path
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h4>
              <span className="codicon codicon-lightbulb"></span>
              Usage Tips
            </h4>
            <ul>
              <li>Ensure the Skill directory contains a valid <code>SKILL.md</code> file</li>
              <li>Skill names must use lowercase letters, numbers, and hyphens (hyphen-case)</li>
              <li>Once loaded, Skills automatically take effect in Claude sessions</li>
              <li>You can control individual Skill status via the enable/disable toggle</li>
              <li>Mention the Skill name in chat to use it, e.g.: "use pdf skill to extract form fields"</li>
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
                  How to Create Custom Skills
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

        {/* 底部按钮 */}
        <div className="dialog-footer">
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
