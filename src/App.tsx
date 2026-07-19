import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout } from './lib/auth';
import { saveFirebaseToken } from './lib/settings';
import Dashboard from './components/Dashboard';
import { 
  FileSpreadsheet, 
  Layers, 
  Users, 
  BarChart3, 
  Zap, 
  ShieldCheck, 
  Check, 
  ArrowRight,
  Printer,
  Sparkles
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setAuthChecked(true);
      },
      () => {
        setUser(null);
        setToken(null);
        setAuthChecked(true);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        // Save token to Supabase for session persistence
        try {
          await saveFirebaseToken(
            result.user.uid,
            result.user.email || '',
            result.accessToken,
            ''
          );
        } catch (e) {
          console.warn('Failed to persist token to Supabase:', e);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" id="loading-spinner">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-300 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-500">Securing Google session...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, render the main dashboard
  if (user && token) {
    return <Dashboard user={user} token={token} onLogout={handleLogout} />;
  }

  // Render highly-polished design-centric Landing Page for unauthenticated users
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans" id="landing-page-root">
      {/* 1. Header Hero */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-sm shadow-emerald-100">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <span className="font-black text-sm tracking-tight text-slate-800">Sheets Invoice Manager</span>
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          {isLoggingIn ? 'Connecting...' : 'Sign In'}
        </button>
      </header>

      {/* 2. Main Question Hero Section */}
      <section className="max-w-5xl mx-auto px-6 py-12 md:py-16 text-center space-y-6" id="landing-hero">
        <span className="bg-emerald-50 text-emerald-600 text-xs font-extrabold px-3 py-1.5 rounded-full border border-emerald-100 inline-block uppercase tracking-wide">
          Yes, it's 100% possible!
        </span>

        <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.1] max-w-3xl mx-auto">
          Make a beautiful React Interface with Google Sheets as a Backend
        </h1>
        
        <p className="text-slate-500 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Google Sheets is a fantastic, collaborative, and free database engine. We built a premium React interface 
          integrated with your Sheets API. No servers, no database costs—fully synchronized.
        </p>

        {/* Dynamic official-looking google sign in button */}
        <div className="flex flex-col items-center justify-center pt-4" id="google-login-action-box">
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="gsi-material-button shadow-md shadow-slate-100 hover:shadow-lg hover:shadow-slate-200 transition-all cursor-pointer"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlnsXlink="http://www.w3.org/1999/xlink" style={{ display: 'block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents font-bold">Connect Spreadsheet with Google</span>
            </div>
          </button>
          
          <p className="text-xs text-slate-400 mt-3 font-medium">
            Requires Google Spreadsheet permission to read and append rows securely.
          </p>
        </div>
      </section>

      {/* 3. Features Bento Grid */}
      <section className="max-w-6xl mx-auto px-6 py-12" id="landing-benefits">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mb-8">
          Why build full-stack React UIs on Google Sheets?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl inline-block">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Perfect Separation of Concerns</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your billing team can view or type details directly inside their Google Sheet tab, while your external client uses our elegant React interface. No databases to manage.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl inline-block">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Real-time Collaboration</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Google Sheets allows multiple editors to work concurrently. React reads from the sheets API instantly, so your application is updated automatically for all users.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl inline-block">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Automated Analytics</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Compile summaries, graphs, monthly revenue, tax calculations, and status breakdowns automatically in the React UI based on Google Sheet cell rows.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Interactive Live Showcase explanation */}
      <section className="max-w-4xl mx-auto px-6 py-12 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-6" id="tech-architecture">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" /> Professional Design & Print Engine
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          One of the biggest issues with standard spreadsheets is that they don't look beautiful when presented to customers. 
          By building the frontend in React, we render printable receipts and invoices, with elegant totals and structured tables, 
          which can be printed directly as beautifully formatted PDFs via standard print commands.
        </p>
        
        <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-lg border border-slate-200">
            <Check className="w-4 h-4 text-emerald-500" /> Automatic Tax Calculations
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-lg border border-slate-200">
            <Check className="w-4 h-4 text-emerald-500" /> Multi-Item Dynamic Rows
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-lg border border-slate-200">
            <Check className="w-4 h-4 text-emerald-500" /> Printable PDF Receipts
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 text-center text-xs text-slate-400 border-t border-slate-100 mt-12">
        <p>Sheets Invoice Manager © 2026. Made with React, Tailwind, and the Google Sheets API.</p>
      </footer>
    </div>
  );
}
