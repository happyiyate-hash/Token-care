import React from 'react';
import { DeveloperView } from './DeveloperView';

interface ApiConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Kept under the existing component name so the current Settings/App wiring
 * remains compatible. The old API laboratory is now the full Developer page.
 */
export const ApiConsoleModal: React.FC<ApiConsoleModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-[#06080E]">
      <DeveloperView onBack={onClose} />
    </div>
  );
};
