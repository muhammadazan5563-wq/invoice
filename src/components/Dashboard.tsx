import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Invoice } from '../types';
import {
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice
} from '../lib/supabase';
import {
  InvoiceTemplate,
  getUserSettings,
  getTemplateWithDefaults
} from '../lib/settings';
import Charts from './Charts';
import InvoiceList from './InvoiceList';
import InvoiceForm from './InvoiceForm';
import Settings from './Settings';
import {
  Database,
  LogOut,
  RefreshCw,
  PlusCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  DollarSign,
  CloudLightning,
  Settings as SettingsIcon,
  TrendingUp
} from 'lucide-react';

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => Promise<void>;
}

// Deterministic avatar color per customer name, so the same guest always
// gets the same chip color across sessions (not random, not repeated blue).
const AVATAR_PALETTE = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
];

function avatarFor(name: string) {
  const clean = (name || '?').trim();
  const initials = clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const palette = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return { initials, ...palette };
}

const STATUS_STYLE: Record<Invoice['status'], { chipBg: string; chipText: string; amountText: string; dot: string }> = {
  Paid: { chipBg: 'bg-emerald-50', chipText: 'text-emerald-600', amountText: 'text-emerald-600', dot: '#10b981' },
  Due: { chipBg: 'bg-amber-50', chipText: 'text-amber-600', amountText: 'text-amber-600', dot: '#f59e0b' },
  Pending: { chipBg: 'bg-amber-50', chipText: 'text-amber-600', amountText: 'text-amber-600', dot: '#f59e0b' },
  Unpaid: { chipBg: 'bg-rose-50', chipText: 'text-rose-600', amountText: 'text-rose-600', dot: '#f43f5e' },
  Overdue: { chipBg: 'bg-violet-50', chipText: 'text-violet-600', amountText: 'text-violet-600', dot: '#8b5cf6' },
};

// Splits a currency total into integer + 2dp fraction, comma-formatted, so the
// big hero number and its trailing decimal always agree with each other.
function splitCurrency(value: number) {
  const fixed = value.toFixed(2);
  const [whole, frac] = fixed.split('.');
  const formattedWhole = Number(whole).toLocaleString('en-US');
  return { whole: formattedWhole, frac };
}

export default function Dashboard({ user, token, onLogout }: DashboardProps) {
  // Invoices data states
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Template settings loaded from Supabase
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate | null>(null);

  const supabaseSqlSchema = `-- 1. Create the invoices table in Supabase
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  hotel_name TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  payment_date TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  payments JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- 2. Create the user_settings table for session persistence & settings
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  user_email TEXT,
  firebase_token TEXT,
  firebase_refresh_token TEXT,
  spreadsheet_settings JSONB DEFAULT '{}'::jsonb,
  invoice_template JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create index on firebase_uid for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_uid ON user_settings (firebase_uid);

-- 4. Disable Row Level Security (RLS) for simple integration
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(supabaseSqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // View state: 'dashboard' | 'create' | 'edit' | 'settings'
  const [viewState, setViewState] = useState<'dashboard' | 'create' | 'edit' | 'settings'>('dashboard');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);

  // Custom Confirmation Modal state to bypass iframe window.confirm blockages
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    actionLabel: string;
    actionStyle: string;
    onConfirm: () => void;
  } | null>(null);

  // Load invoices and template settings on mount
  useEffect(() => {
    fetchInvoices();
    loadTemplateSettings();
  }, []);

  const loadTemplateSettings = async () => {
    try {
      const settings = await getUserSettings(user.uid);
      if (settings && settings.invoice_template) {
        setInvoiceTemplate(getTemplateWithDefaults(settings.invoice_template));
      }
    } catch (err) {
      console.warn('Failed to load template settings:', err);
    }
  };

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    setError(null);
    try {
      const data = await getInvoices();
      setInvoices(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices from Supabase.');
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Save new or edited invoice back to Supabase
  const handleSaveInvoice = async (invoiceData: Omit<Invoice, 'rowIndex' | 'rawRow'> & { rowIndex?: number }) => {
    const performSave = async () => {
      setLoadingInvoices(true);
      setError(null);
      try {
        if (viewState === 'edit' && editingInvoice) {
          await updateInvoice(editingInvoice.id, invoiceData);
        } else {
          await createInvoice(invoiceData);
        }
        await fetchInvoices();
        setViewState('dashboard');
        setEditingInvoice(undefined);
      } catch (err: any) {
        setError(`Failed to save invoice: ${err.message}`);
      } finally {
        setLoadingInvoices(false);
      }
    };

    if (viewState === 'edit' && editingInvoice) {
      setConfirmModal({
        title: 'Confirm Booking Update',
        message: `Are you sure you want to save your changes to invoice #${invoiceData.id}? This will synchronize directly with Supabase.`,
        actionLabel: 'Update Booking',
        actionStyle: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
        onConfirm: () => {
          performSave();
          setConfirmModal(null);
        }
      });
    } else {
      performSave();
    }
  };

  // Mark invoice as Paid (Quick action)
  const handleMarkAsPaid = async (invoice: Invoice) => {
    const performMark = async () => {
      const updatedInvoice: Omit<Invoice, 'rowIndex' | 'rawRow'> = {
        id: invoice.id,
        date: invoice.date,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        hotelName: invoice.hotelName,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.totalAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        balance: 0,
        status: 'Paid',
        notes: invoice.notes,
        items: invoice.items,
        payments: [{ amount: invoice.totalAmount, date: new Date().toISOString().split('T')[0] }]
      };

      setLoadingInvoices(true);
      try {
        await updateInvoice(invoice.id, updatedInvoice);
        await fetchInvoices();
      } catch (err: any) {
        setError(`Failed to mark invoice as paid: ${err.message}`);
      } finally {
        setLoadingInvoices(false);
      }
    };

    setConfirmModal({
      title: 'Mark as Paid',
      message: `Are you sure you want to mark invoice #${invoice.id} as fully PAID? This will update the status and record the full payment in Supabase.`,
      actionLabel: 'Yes, Mark Paid',
      actionStyle: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      onConfirm: () => {
        performMark();
        setConfirmModal(null);
      }
    });
  };

  // Delete invoice
  const handleDeleteInvoice = async (invoice: Invoice) => {
    const performDelete = async () => {
      setLoadingInvoices(true);
      try {
        await deleteInvoice(invoice.id);
        await fetchInvoices();
      } catch (err: any) {
        setError(`Failed to delete invoice: ${err.message}`);
      } finally {
        setLoadingInvoices(false);
      }
    };

    setConfirmModal({
      title: 'Delete Invoice',
      message: `Are you sure you want to permanently delete invoice #${invoice.id} from your Supabase database? This action cannot be undone.`,
      actionLabel: 'Delete Permanently',
      actionStyle: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
      onConfirm: () => {
        performDelete();
        setConfirmModal(null);
      }
    });
  };

  // Calculate high-level KPIs
  const calculateKPIs = () => {
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let overdueCount = 0;

    invoices.forEach((inv) => {
      // Skip archived if any status is soft-archived
      if (inv.status === ('Archived' as any)) return;
      totalRevenue += inv.totalAmount;
      totalPaid += inv.amountPaid;
      totalPending += inv.balance;
      if (inv.status === 'Overdue') {
        overdueCount += 1;
      }
    });

    return { totalRevenue, totalPaid, totalPending, overdueCount };
  };

  const { totalRevenue, totalPaid, totalPending, overdueCount } = calculateKPIs();
  const revenueSplit = splitCurrency(totalRevenue);

  // Collection health: what % of billed revenue has actually been collected.
  // Drives the gauge in the "Collection Health" card, and its color band.
  const collectionRate = totalRevenue > 0 ? Math.min(100, (totalPaid / totalRevenue) * 100) : 0;
  const collectionLabel =
    collectionRate >= 85 ? 'Excellent' : collectionRate >= 60 ? 'Healthy' : collectionRate >= 35 ? 'Watch' : 'At Risk';
  const collectionColor =
    collectionRate >= 85 ? '#10b981' : collectionRate >= 60 ? '#34d399' : collectionRate >= 35 ? '#f59e0b' : '#f43f5e';
  const gaugeCircumference = 251.2; // half-circle path length, matches the SVG path below
  const gaugeDash = (collectionRate / 100) * gaugeCircumference;

  // Recent invoices, newest first, for the "Recent Activity" panel
  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-slate-50"
      id="dashboard-root"
    >
      {/* 1. Global Navigation Bar */}
      <header className="bg-white/70 backdrop-blur-md border-b border-white/60 sticky top-0 z-40 px-6 py-4" id="global-navbar">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-2xl shadow-md shadow-indigo-200">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">Supabase Invoice Ledger</h1>
              <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-1">
                <CloudLightning className="w-3 h-3 text-emerald-500 animate-pulse" /> Live Supabase Database Connected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setViewState('settings')}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/70 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </button>
            <button
              onClick={fetchInvoices}
              disabled={loadingInvoices}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/70 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInvoices ? 'animate-spin' : ''}`} /> Sync DB
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8" id="dashboard-main">
        {error && (
          <div className="space-y-6 mb-8 animate-fade-in">
            <div className="bg-rose-50 text-rose-600 border border-rose-100 p-5 rounded-2xl text-sm font-medium flex gap-3 items-start shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-800">Supabase Query Error</p>
                <p className="text-xs text-rose-500 mt-1">{error}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">Supabase Table Setup Required</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    If you haven't created the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">invoices</code> table in your Supabase project yet, paste and run the query below in your <strong>Supabase SQL Editor</strong>:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedSql ? "Copied!" : "Copy SQL"}
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed max-h-64 shadow-inner">
                {supabaseSqlSchema}
              </pre>
              <div className="flex flex-col sm:flex-row gap-3 pt-2 text-xs">
                <div className="bg-indigo-50 text-indigo-700 p-3 rounded-xl flex-1 border border-indigo-100/50">
                  <span className="font-bold block mb-1">💡 Step 1: Open Supabase</span>
                  Go to your Supabase project dashboard and open the <strong>SQL Editor</strong> tab on the left navigation panel.
                </div>
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl flex-1 border border-emerald-100/50">
                  <span className="font-bold block mb-1">🚀 Step 2: Paste & Run</span>
                  Click <strong>"New query"</strong>, paste the copied SQL schema, and hit <strong>"Run"</strong>.
                </div>
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl flex-1 border border-amber-100/50">
                  <span className="font-bold block mb-1">🔄 Step 3: Synchronize</span>
                  Once the query completes successfully, click the <strong>"Sync DB"</strong> button above to load your ledger!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1: Main Invoices Control Panel Dashboard */}
        {viewState === 'dashboard' && (
          <div className="space-y-8 animate-fade-in" id="main-dashboard-panels">
            {/* Hero row: revenue hero (2 cols) + recent activity + collection health, Bankio-style 3-card top row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start" id="hero-row">
              {/* Hero card: Total Revenue */}
              <div className="lg:col-span-2 bg-white p-7 rounded-3xl border border-white shadow-sm shadow-slate-200/60">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Revenue</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-slate-900 tracking-tight">
                    ${revenueSplit.whole}
                  </span>
                  <span className="text-lg font-bold text-slate-300">.{revenueSplit.frac}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingInvoice(undefined);
                      setViewState('create');
                    }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-3 rounded-2xl transition-all shadow-md shadow-indigo-100 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> New Invoice
                  </button>
                  <button
                    type="button"
                    onClick={fetchInvoices}
                    className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-bold px-5 py-3 rounded-2xl transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingInvoices ? 'animate-spin' : ''}`} /> Sync DB
                  </button>
                </div>

                {/* Mini stat strip: Paid / Pending / Overdue */}
                <div className="grid grid-cols-3 gap-3 mt-7">
                  <div className="bg-emerald-50 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Collected</span>
                    </div>
                    <span className="text-lg font-black text-emerald-700 block mt-1">
                      ${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Pending</span>
                    </div>
                    <span className="text-lg font-black text-amber-600 block mt-1">
                      ${totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="bg-rose-50 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-rose-600">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Overdue</span>
                    </div>
                    <span className="text-lg font-black text-rose-600 block mt-1">{overdueCount}</span>
                  </div>
                </div>
              </div>

              {/* Recent activity panel */}
              <div className="bg-white p-6 rounded-3xl border border-white shadow-sm shadow-slate-200/60">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-slate-800">Recent Activity</h3>
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{invoices.length} total</span>
                </div>
                <div className="space-y-1">
                  {recentInvoices.length === 0 && (
                    <p className="text-xs text-slate-400 py-6 text-center">No invoices yet. Create your first one.</p>
                  )}
                  {recentInvoices.map((inv) => {
                    const style = STATUS_STYLE[inv.status] || STATUS_STYLE.Pending;
                    const avatar = avatarFor(inv.customerName);
                    return (
                      <div key={`${inv.id}-${inv.rowIndex}`} className="flex items-center gap-3 py-2.5">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${avatar.bg} ${avatar.text}`}>
                          {avatar.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">{inv.customerName}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                            {inv.status} · {inv.date}
                          </p>
                        </div>
                        <span className={`text-xs font-black shrink-0 ${style.amountText}`}>
                          ${inv.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Signature element: Collection Health gauge */}
              <div className="bg-white p-6 rounded-3xl border border-white shadow-sm shadow-slate-200/60 flex flex-col items-center">
                <div className="w-full flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800">Collection Health</h3>
                  <TrendingUp className="w-4 h-4 text-slate-300" />
                </div>

                <svg viewBox="0 0 200 120" className="w-full max-w-[200px] mt-3">
                  <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#f1f5f9" strokeWidth="16" strokeLinecap="round" />
                  <path
                    d="M 20 110 A 80 80 0 0 1 180 110"
                    fill="none"
                    stroke={collectionColor}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={`${gaugeDash} ${gaugeCircumference}`}
                  />
                </svg>

                <div className="text-center -mt-8">
                  <span className="text-3xl font-black text-slate-900">{collectionRate.toFixed(0)}%</span>
                  <p className="text-xs font-bold mt-0.5" style={{ color: collectionColor }}>{collectionLabel}</p>
                </div>

                <p className="text-[10px] text-slate-400 text-center mt-3 leading-relaxed">
                  Share of billed revenue collected across {invoices.length} invoice{invoices.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            {/* Analytics — Charts.tsx manages its own card grid, no extra wrapper */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-black text-slate-800">Real-Time Database Analytics</h2>
                <DollarSign className="w-4 h-4 text-slate-300" />
              </div>
              <Charts invoices={invoices} />
            </div>

            {/* Invoice Ledger — InvoiceList.tsx manages its own card + table */}
            <div className="space-y-3">
              <h2 className="text-base font-black text-slate-800">Invoice Ledger</h2>
              <InvoiceList
                invoices={invoices}
                onEdit={(inv) => {
                  setEditingInvoice(inv);
                  setViewState('edit');
                }}
                onDelete={handleDeleteInvoice}
                onMarkAsPaid={handleMarkAsPaid}
                template={invoiceTemplate}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: Create/Edit Invoice Form Panel */}
        {(viewState === 'create' || viewState === 'edit') && (
          <div className="animate-fade-in" id="invoice-editor-section">
            <InvoiceForm
              invoice={editingInvoice}
              suggestInvoiceId={
                viewState === 'create'
                  ? `INV-${Math.floor(1000 + Math.random() * 9000)}`
                  : undefined
              }
              onSave={handleSaveInvoice}
              onCancel={() => {
                setViewState('dashboard');
                setEditingInvoice(undefined);
              }}
              template={invoiceTemplate}
            />
          </div>
        )}

        {/* VIEW 3: Settings Panel */}
        {viewState === 'settings' && (
          <div className="animate-fade-in" id="settings-section">
            <Settings
              user={user}
              token={token}
              onClose={() => setViewState('dashboard')}
              onSettingsSaved={loadTemplateSettings}
            />
          </div>
        )}
      </main>

      {/* Custom Premium Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" id="custom-confirm-dialog">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{confirmModal.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2.5 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer ${confirmModal.actionStyle}`}
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
