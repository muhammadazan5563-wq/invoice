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
  Settings as SettingsIcon
} from 'lucide-react';

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => Promise<void>;
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
        actionStyle: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
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
      actionStyle: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
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

  return (
    <div className="min-h-screen bg-slate-50/50" id="dashboard-root">
      {/* 1. Global Navigation Bar */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 py-4" id="global-navbar">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-sm shadow-blue-100">
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
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </button>

            <button
              onClick={fetchInvoices}
              disabled={loadingInvoices}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
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
            <div className="bg-red-50 text-red-600 border border-red-100 p-5 rounded-2xl text-sm font-medium flex gap-3 items-start shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">Supabase Query Error</p>
                <p className="text-xs text-red-500 mt-1">{error}</p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedSql ? "Copied!" : "Copy SQL"}
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed max-h-64 shadow-inner">
                {supabaseSqlSchema}
              </pre>

              <div className="flex flex-col sm:flex-row gap-3 pt-2 text-xs">
                <div className="bg-blue-50 text-blue-700 p-3 rounded-xl flex-1 border border-blue-100/50">
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
            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="kpi-cards-grid">
              {/* KPI 1: Revenue */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="bg-blue-50 text-blue-600 p-3.5 rounded-xl">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Revenue</span>
                  <span className="text-xl font-black text-slate-800">
                    ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* KPI 2: Paid */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-xl">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Collected / Paid</span>
                  <span className="text-xl font-black text-emerald-700">
                    ${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* KPI 3: Pending */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="bg-amber-50 text-amber-600 p-3.5 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unpaid / Pending</span>
                  <span className="text-xl font-black text-amber-600">
                    ${totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* KPI 4: Overdue */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="bg-violet-50 text-violet-600 p-3.5 rounded-xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overdue Invoices</span>
                  <span className="text-xl font-black text-violet-600">{overdueCount}</span>
                </div>
              </div>
            </div>

            {/* Charts View Toggle Header */}
            <div className="flex justify-between items-center pb-1">
              <h2 className="text-lg font-extrabold text-slate-800">Real-Time Database Analytics</h2>
              
              <button
                type="button"
                onClick={() => {
                  setEditingInvoice(undefined);
                  setViewState('create');
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-100 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Create Invoice
              </button>
            </div>

            {/* Graphs / Charts component */}
            <Charts invoices={invoices} />

            {/* Invoices List Display */}
            <div className="space-y-4 pt-4">
              <h2 className="text-lg font-extrabold text-slate-800">Invoice Ledger</h2>
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
