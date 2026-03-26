import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Network, Loader2, Lock, LogIn, UserPlus, Play } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { EmailInput } from "../components/EmailInput";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";

export const LoginPage = () => {
  const {
    user,
    isLoading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsDemo,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const appleStatusMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    );
    const previousTheme = themeMeta?.getAttribute("content") ?? "#f0f4f8";
    const previousApple = appleStatusMeta?.getAttribute("content") ?? "default";

    if (themeMeta) {
      themeMeta.setAttribute("content", "#f0f4f8");
    }
    if (appleStatusMeta) {
      appleStatusMeta.setAttribute("content", "default");
    }

    return () => {
      if (themeMeta) {
        themeMeta.setAttribute("content", previousTheme);
      }
      if (appleStatusMeta) {
        appleStatusMeta.setAttribute("content", previousApple);
      }
    };
  }, []);

  // Already logged in, redirect to home
  if (user) {
    return <Navigate to="/home" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center neu-bg">
        <Loader2 size={40} className="animate-spin text-slate-500" />
      </div>
    );
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = isSignUp
        ? await signUpWithEmail(email, password)
        : await signInWithEmail(email, password);

      if (result.error) {
        setError(result.error.message);
      } else if (isSignUp) {
        setError("Confirmation email sent. Please check your inbox.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 neu-bg">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 neu-btn rounded-2xl mb-4">
            <Network className="w-8 h-8 text-sky-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Hub</h1>
          <p className="text-slate-500 text-sm">Your Central Workspace</p>
        </div>

        {/* Login Card */}
        <div className="neu-card rounded-2xl p-6">
          {IS_DEMO && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 text-center mb-4">
                Demo Mode
              </h2>
              <button
                onClick={async () => {
                  setError(null);
                  setIsSubmitting(true);
                  try {
                    const result = await signInAsDemo();
                    if (result.error) setError(result.error.message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-400 text-white font-medium py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] mb-4 shadow-md hover:shadow-lg"
              >
                {isSubmitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Play size={20} />
                    デモアカウントでログイン
                  </>
                )}
              </button>
              <p className="text-xs text-slate-400 text-center mb-4">
                共有デモアカウントで全機能をお試しいただけます
              </p>
              {error && (
                <div className="text-sm p-3 rounded-lg bg-red-100 text-red-700 border border-red-200 mb-4">
                  {error}
                </div>
              )}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="neu-divider w-full"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 neu-bg text-slate-400">
                    or sign in with your account
                  </span>
                </div>
              </div>
            </>
          )}

          {!IS_DEMO && (
            <h2 className="text-lg font-semibold text-slate-700 text-center mb-6">
              {isSignUp ? "Create Account" : "Sign In"}
            </h2>
          )}

          {/* Google Login */}
          <button
            onClick={() => signInWithGoogle()}
            className="w-full flex items-center justify-center gap-3 neu-btn text-slate-700 font-medium py-3 px-4 rounded-xl transition-all active:scale-[0.98] mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="neu-divider w-full"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 neu-bg text-slate-400">or</span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <EmailInput
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="email@example.com"
                required
                showValidation={false}
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  minLength={6}
                  className="neu-input w-full pl-11 pr-4 py-3 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none transition-all"
                />
              </div>
            </div>

            {error && (
              <div
                className={`text-sm p-3 rounded-lg ${
                  error.includes("Confirmation email")
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-red-100 text-red-700 border border-red-200"
                }`}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-400 text-white font-medium py-3 px-4 rounded-xl transition-all active:scale-[0.98] disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isSubmitting ? (
                <Loader2 size={20} className="animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus size={20} />
                  Create Account
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              {isSignUp ? (
                <>
                  Already have an account?{" "}
                  <span className="text-sky-600 ml-1 font-medium">Sign In</span>
                </>
              ) : (
                <>
                  Don't have an account?{" "}
                  <span className="text-sky-600 ml-1 font-medium">Sign Up</span>
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
};
