import React from 'react';

interface KeepAliveProps {
  active: boolean;
  children: React.ReactNode;
}

/**
 * Keeps a page mounted while switching between mobile tabs.
 * Hidden pages are removed from layout/interaction but retain their React
 * state, fetched data, form values, and mounted effects.
 */
export const KeepAlive: React.FC<KeepAliveProps> = ({ active, children }) => (
  <div
    aria-hidden={!active}
    style={{
      display: active ? 'contents' : 'none',
      width: '100%',
      height: '100%',
    }}
  >
    {children}
  </div>
);
