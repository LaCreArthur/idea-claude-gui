import styles from './style.module.less';

const CommunitySection = () => {
  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>Community</h3>
      <p className={styles.sectionDesc}>Scan the QR code below to join the official WeChat group for the latest news and technical support</p>

      <div className={styles.qrcodeContainer}>
        <div className={styles.qrcodeWrapper}>
          <img
            src="https://claudecodecn-1253302184.cos.ap-beijing.myqcloud.com/vscode/wxq.png"
            alt="Official WeChat community QR code"
            className={styles.qrcodeImage}
          />
          <p className={styles.qrcodeTip}>Scan with WeChat to join the community</p>
        </div>
      </div>
    </div>
  );
};

export default CommunitySection;
