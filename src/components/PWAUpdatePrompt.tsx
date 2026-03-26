import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// Global callback to trigger update prompt from outside React
let triggerUpdate: (() => void) | null = null;

export const setPWAUpdateCallback = (callback: () => void) => {
  triggerUpdate = callback;
};

export const triggerPWAUpdate = () => {
  if (triggerUpdate) {
    triggerUpdate();
  }
};

export const PWAUpdatePrompt = () => {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  useEffect(() => {
    setPWAUpdateCallback(() => {
      setShowUpdatePrompt(true);
    });

    return () => {
      triggerUpdate = null;
    };
  }, []);

  const handleUpdate = () => {
    setShowUpdatePrompt(false);
    window.location.reload();
  };

  return (
    <ConfirmDialog
      isOpen={showUpdatePrompt}
      title="Update Available"
      message="A new version of the app is available. Would you like to reload to get the latest updates?"
      confirmLabel="Reload"
      cancelLabel="Later"
      onConfirm={handleUpdate}
      onCancel={() => setShowUpdatePrompt(false)}
    />
  );
};
