import BusinessSection from './BusinessSection';
import BusinessHeroSettings from './business';
import AutomationSection from './AutomationSection';
import AccountSection from './AccountSection';

const SECTION_COMPONENTS = {
  business: BusinessSection,
  hero: BusinessHeroSettings,
  automation: AutomationSection,
  account: AccountSection,
};

export default function SettingsPage({
  negocioId,
  user,
  businessName,
  setBusinessName,
  isEditingBusinessName,
  setIsEditingBusinessName,
  onLogout,
  onChangeSection,
  activeSection = 'business',
  registrosMode = false,
}) {
  const ActiveComponent = SECTION_COMPONENTS[activeSection] || BusinessSection;

  return (
    <ActiveComponent
      negocioId={negocioId}
      user={user}
      businessName={businessName}
      setBusinessName={setBusinessName}
      isEditingBusinessName={isEditingBusinessName}
      setIsEditingBusinessName={setIsEditingBusinessName}
      onLogout={onLogout}
      onChangeSection={onChangeSection}
      registrosMode={registrosMode}
    />
  );
}
