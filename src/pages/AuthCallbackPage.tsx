import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AuthCallbackPage = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // When auth is done loading and we have a user, redirect to home
    if (!isLoading) {
      if (user) {
        navigate('/home', { replace: true });
      } else {
        // If no user after loading, something went wrong
        navigate('/login', { replace: true });
      }
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={48} className="animate-spin text-slate-400 mx-auto mb-4" />
        <p className="text-slate-400">Completing sign in...</p>
      </div>
    </div>
  );
};
