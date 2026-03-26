import { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutState {
  pageTitle?: string;
  headerLeft?: ReactNode;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  showSidebar: boolean;
}

interface LayoutContextType extends LayoutState {
  setLayout: (config: LayoutState) => void;
}

const LayoutContext = createContext<LayoutContextType | null>(null);

export const useLayoutState = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutState must be used within a LayoutProvider');
  }
  return context;
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context.setLayout;
};

export const LayoutProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LayoutState>({
    showSidebar: true
  });

  return (
    <LayoutContext.Provider value={{ ...state, setLayout: setState }}>
      {children}
    </LayoutContext.Provider>
  );
};
