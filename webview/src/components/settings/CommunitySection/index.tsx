import styles from './style.module.less';

const CommunitySection = () => {
  const githubUrl = 'https://github.com/LaCreArthur/idea-claude-gui';

  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>Community</h3>
      <p className={styles.sectionDesc}>
        Claude GUI is an open source project. Report issues, request features, or contribute on GitHub.
      </p>

      <div className={styles.linksContainer}>
        <a
          href={`${githubUrl}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkItem}
        >
          <span className="codicon codicon-issues" />
          <span>Report an Issue</span>
        </a>
        <a
          href={`${githubUrl}/discussions`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkItem}
        >
          <span className="codicon codicon-comment-discussion" />
          <span>Discussions</span>
        </a>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkItem}
        >
          <span className="codicon codicon-github" />
          <span>View on GitHub</span>
        </a>
      </div>
    </div>
  );
};

export default CommunitySection;
