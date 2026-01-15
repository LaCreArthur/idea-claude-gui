import UsageStatisticsSection from '../../UsageStatisticsSection';
import styles from './style.module.less';

interface UsageSectionProps {
  currentProvider?: string;
}

const UsageSection = ({ currentProvider }: UsageSectionProps) => {
  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>Usage Statistics</h3>
      <p className={styles.sectionDesc}>View your Token consumption, cost statistics and usage trend analysis</p>
      <UsageStatisticsSection currentProvider={currentProvider} />
    </div>
  );
};

export default UsageSection;
