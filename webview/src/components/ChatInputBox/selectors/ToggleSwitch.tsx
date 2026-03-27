import './ToggleSwitch.css';

interface ToggleSwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  onClick?: (checked: boolean, e: React.MouseEvent) => void;
}

export const ToggleSwitch = ({ checked, onClick }: ToggleSwitchProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(!checked, e);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle-switch${checked ? ' toggle-switch--on' : ''}`}
      onClick={handleClick}
    >
      <span className="toggle-switch__thumb" />
    </button>
  );
};
