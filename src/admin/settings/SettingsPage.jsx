import React from 'react';
import BusinessSection from './BusinessSection';
import BusinessHeroSettings from './business';
import AutomationSection from './AutomationSection';

const SECTION_COMPONENTS = {
  business: BusinessSection,
  hero: BusinessHeroSettings,
  automation: AutomationSection,
};

export default function SettingsPage({
  negocioId,
  user,
  businessName,
  setBusinessName,
  isEditingBusinessName,
  setIsEditingBusinessName,
  onLogout,
  activeSection = 'business',
  whatsappSettings,
  setWhatsappSettings,
  automationLogs,
  toggleWhatsAppConnection,
  handleTestTriggerMessage,
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
      whatsappSettings={whatsappSettings}
      setWhatsappSettings={setWhatsappSettings}
      automationLogs={automationLogs}
      toggleWhatsAppConnection={toggleWhatsAppConnection}
      handleTestTriggerMessage={handleTestTriggerMessage}
    />
  );
}
