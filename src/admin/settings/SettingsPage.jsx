import React from 'react';
import ProfileSection from './ProfileSection';
import BusinessSection from './BusinessSection';
import BusinessHeroSettings from './business';
import ScheduleSection from './ScheduleSection';
import ReservationSection from './ReservationSection';
import SubscriptionSection from './SubscriptionSection';
import NotificationsSection from './NotificationsSection';
import HelpSection from './HelpSection';

const SECTION_COMPONENTS = {
  profile: ProfileSection,
  business: BusinessSection,
  hero: BusinessHeroSettings,
  schedule: ScheduleSection,
  reservations: ReservationSection,
  subscription: SubscriptionSection,
  notifications: NotificationsSection,
  help: HelpSection,
};

export default function SettingsPage({
  negocioId,
  user,
  businessName,
  setBusinessName,
  isEditingBusinessName,
  setIsEditingBusinessName,
  onLogout,
  activeSection = 'profile',
}) {
  const ActiveComponent = SECTION_COMPONENTS[activeSection] || ProfileSection;

  return (
    <ActiveComponent
      negocioId={negocioId}
      user={user}
      businessName={businessName}
      setBusinessName={setBusinessName}
      isEditingBusinessName={isEditingBusinessName}
      setIsEditingBusinessName={setIsEditingBusinessName}
      onLogout={onLogout}
    />
  );
}