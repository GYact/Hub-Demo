import { ReactNode, useEffect } from 'react';
import { useLayout } from '../contexts/LayoutContext';

interface LayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  pageTitle?: string;
  headerLeft?: ReactNode;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
}

export const Layout = ({ children, showSidebar = true, pageTitle, headerLeft, headerCenter, headerRight }: LayoutProps) => {
  const setLayout = useLayout();

  useEffect(() => {
    setLayout({
      showSidebar,
      pageTitle,
      headerLeft,
      headerCenter,
      headerRight,
    });
  }, [setLayout, showSidebar, pageTitle, headerLeft, headerCenter, headerRight]);

  return <>{children}</>;
};
