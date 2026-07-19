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
  getTemplateWithDefaults,
  getCurrencySymbol
} from '../lib/settings';
import Charts from './Charts';
import InvoiceList from './InvoiceList';
import InvoiceForm from './InvoiceForm';
import Settings from './Settings';
import Ledger from './Ledger';
import {
  LogOut,
  RefreshCw,
  PlusCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  Settings as SettingsIcon,
  Receipt,
  TrendingUp,
  Search,
  Bell,
  ChevronRight,
  BookOpen
} from 'lucide-react';

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => Promise<void>;
}

export default function Dashboard({ user, token, onLogout }: DashboardProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

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

  const [viewState, setViewState] = useState<'dashboard' | 'create' | 'edit' | 'settings' | 'ledger'>('dashboard');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    actionLabel: string;
    actionStyle: string;
    onConfirm: () => void;
  } | null>(null);

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
        actionStyle: 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400',
        onConfirm: () => {
          performSave();
          setConfirmModal(null);
        }
      });
    } else {
      performSave();
    }
  };

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
      actionStyle: 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-400',
      onConfirm: () => {
        performMark();
        setConfirmModal(null);
      }
    });
  };

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
      actionStyle: 'bg-rose-500 hover:bg-rose-600 focus:ring-rose-400',
      onConfirm: () => {
        performDelete();
        setConfirmModal(null);
      }
    });
  };

  // Calculate KPIs
  const calculateKPIs = () => {
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let overdueCount = 0;

    invoices.forEach((inv) => {
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

  // Get currency symbol from template settings
  const currencySymbol = getCurrencySymbol(invoiceTemplate?.currency || 'USD');

  const collectionRate = totalRevenue > 0 ? Math.min(100, (totalPaid / totalRevenue) * 100) : 0;
  const collectionLabel =
    collectionRate >= 85 ? 'Excellent' : collectionRate >= 60 ? 'Healthy' : collectionRate >= 35 ? 'Watch' : 'At Risk';
  const collectionColor =
    collectionRate >= 85 ? '#10b981' : collectionRate >= 60 ? '#34d399' : collectionRate >= 35 ? '#f59e0b' : '#f43f5e';

  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Rotating avatar colors for variety (like in the screenshot)
  const avatarColors = [
    { bg: 'bg-purple-100', text: 'text-purple-600' },
    { bg: 'bg-rose-100', text: 'text-rose-600' },
    { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    { bg: 'bg-blue-100', text: 'text-blue-600' },
    { bg: 'bg-teal-100', text: 'text-teal-600' },
  ];

  const getAvatarColor = (index: number) => avatarColors[index % avatarColors.length];

  const statusChip = (status: string) => {
    switch (status) {
      case 'Paid':
        return { dot: 'bg-emerald-500', text: 'text-emerald-600' };
      case 'Overdue':
        return { dot: 'bg-rose-500', text: 'text-rose-600' };
      default:
        return { dot: 'bg-orange-400', text: 'text-orange-600' };
    }
  };

  // Get user initials for avatar
  const userInitials = user.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-[#f8f9fc]" id="dashboard-root">
      {/* Clean Top Navigation */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40" id="global-navbar">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex justify-between items-center">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200/50">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">InvoiceHub</span>
            </div>

            {/* Navigation tabs */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setViewState('dashboard')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  viewState === 'dashboard'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => { setEditingInvoice(undefined); setViewState('create'); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  viewState === 'create'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Create
              </button>
              <button
                onClick={() => setViewState('ledger')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  viewState === 'ledger'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Ledger
              </button>
              <button
                onClick={() => setViewState('settings')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  viewState === 'settings'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="hidden lg:flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                className="bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none w-40"
              />
            </div>

            {/* Sync button */}
            <button
              onClick={fetchInvoices}
              disabled={loadingInvoices}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all cursor-pointer"
              title="Sync Database"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loadingInvoices ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications */}
            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all cursor-pointer relative">
              <Bell className="w-4 h-4 text-gray-500" />
              {overdueCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {overdueCount}
                </span>
              )}
            </button>

            {/* User avatar + logout */}
            <div className="flex items-center gap-2 ml-2">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-md shadow-purple-200/50">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  userInitials
                )}
              </div>
              <button
                onClick={onLogout}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-8 py-8" id="dashboard-main">
        {error && (
          <div className="space-y-6 mb-8 animate-fade-in">
            <div className="bg-rose-50 text-rose-700 border border-rose-100 p-5 rounded-2xl text-sm font-medium flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-800">Connection Error</p>
                <p className="text-xs text-rose-500 mt-1">{error}</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 p-8 rounded-3xl space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Database Setup Required</h3>
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed max-w-xl">
                    Create the <code className="bg-gray-100 px-1.5 py-0.5 rounded-md font-mono text-xs text-gray-700">invoices</code> table in your Supabase project by running this SQL:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  {copiedSql ? "Copied!" : "Copy SQL"}
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-5 rounded-2xl font-mono text-[11px] overflow-x-auto leading-relaxed max-h-56">
                {supabaseSqlSchema}
              </pre>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-blue-50 text-blue-700 p-4 rounded-2xl">
                  <span className="font-semibold block mb-1 text-sm">Step 1</span>
                  <p className="text-xs leading-relaxed">Open your Supabase SQL Editor</p>
                </div>
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl">
                  <span className="font-semibold block mb-1 text-sm">Step 2</span>
                  <p className="text-xs leading-relaxed">Paste the SQL and click Run</p>
                </div>
                <div className="bg-amber-50 text-amber-700 p-4 rounded-2xl">
                  <span className="font-semibold block mb-1 text-sm">Step 3</span>
                  <p className="text-xs leading-relaxed">Click Sync to load your data</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard View */}
        {viewState === 'dashboard' && (
          <div className="space-y-8 animate-fade-in" id="main-dashboard-panels">
            {/* Hero Row: Total Revenue (wider) + Recent Activity + Today Collection */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-6 items-start" id="hero-row">
              {/* Total Revenue Card - Widest (spans 4 of 8 cols) */}
              <div className="lg:col-span-4 bg-white p-8 rounded-3xl shadow-md shadow-gray-200/60">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Revenue</span>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-gray-900 tracking-tight">
                    {currencySymbol}{totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xl font-bold text-gray-300">.{String(Math.round((totalRevenue % 1) * 100)).padStart(2, '0')}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mt-6">
                  <button
                    onClick={() => { setEditingInvoice(undefined); setViewState('create'); }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl transition-all shadow-lg shadow-indigo-200/50 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> New Invoice
                  </button>
                  <button
                    onClick={fetchInvoices}
                    className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-semibold px-5 py-3 rounded-2xl transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingInvoices ? 'animate-spin' : ''}`} /> Sync DB
                  </button>
                </div>

                {/* Mini Stats: Collected / Pending / Overdue */}
                <div className="grid grid-cols-3 gap-3 mt-7">
                  <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-600 mb-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Collected</span>
                    </div>
                    <span className="text-lg font-black text-emerald-700">
                      {currencySymbol}{totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-amber-600 mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Pending</span>
                    </div>
                    <span className="text-lg font-black text-amber-600">
                      {currencySymbol}{totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="bg-rose-50 rounded-2xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-rose-600 mb-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Overdue</span>
                    </div>
                    <span className="text-lg font-black text-rose-600">{overdueCount}</span>
                  </div>
                </div>
              </div>

              {/* Recent Activity Panel - Narrower */}
              <div className="lg:col-span-2 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-bold text-gray-900">Recent Activity</h3>
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">{invoices.length} total</span>
                </div>

                <div className="space-y-1">
                  {recentInvoices.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400 font-medium">No invoices yet</p>
                      <p className="text-xs text-gray-300 mt-1">Create your first one</p>
                    </div>
                  )}
                  {recentInvoices.map((inv, idx) => {
                    const chip = statusChip(inv.status);
                    // Varied avatar colors for visual interest
                    const avatarColors = [
                      'bg-blue-100 text-blue-600',
                      'bg-orange-100 text-orange-600',
                      'bg-rose-100 text-rose-600',
                      'bg-emerald-100 text-emerald-600',
                      'bg-purple-100 text-purple-600',
                      'bg-amber-100 text-amber-600',
                      'bg-cyan-100 text-cyan-600',
                    ];
                    const avatarColor = avatarColors[idx % avatarColors.length];
                    return (
                      <div key={inv.id} className="flex items-center gap-3 py-2.5">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${avatarColor}`}>
                          <span className="text-sm font-bold">
                            {inv.customerName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{inv.customerName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`}></span>
                            <span className="text-xs text-gray-400">{inv.status} · {inv.date}</span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-900">
                          {currencySymbol}{inv.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Today Collection Card */}
              <div className="lg:col-span-2 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">Today Collection</h3>
                  <TrendingUp className="w-4 h-4 text-gray-300" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-4">
                  <span className="text-4xl font-black text-gray-900">
                    {currencySymbol}{invoices
                      .filter(inv => inv.status === 'Paid' && inv.paymentDate === new Date().toISOString().split('T')[0])
                      .reduce((sum, inv) => sum + inv.amountPaid, 0)
                      .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <p className="text-sm text-gray-400 mt-2">Collected today</p>
                </div>

                <div className="mt-auto space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Invoices paid today</span>
                    <span className="font-bold text-gray-700">
                      {invoices.filter(inv => inv.status === 'Paid' && inv.paymentDate === new Date().toISOString().split('T')[0]).length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Pending today</span>
                    <span className="font-bold text-gray-700">
                      {invoices.filter(inv => inv.status === 'Pending' && inv.date === new Date().toISOString().split('T')[0]).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Collection Health + Quick Actions Row - Same 8-col grid as hero */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-6 items-start">
              {/* Quick Actions - spans 4 cols (first column) */}
              <div className="lg:col-span-4 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setEditingInvoice(undefined); setViewState('create'); }}
                    className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-2xl transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-700">New Invoice</span>
                  </button>
                  <button
                    onClick={fetchInvoices}
                    className="flex items-center gap-3 p-4 bg-indigo-50 hover:bg-indigo-100 rounded-2xl transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-5 h-5 text-indigo-600 ${loadingInvoices ? 'animate-spin' : ''}`} />
                    <span className="text-sm font-semibold text-indigo-700">Sync Database</span>
                  </button>
                  <button
                    onClick={() => setViewState('settings')}
                    className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all cursor-pointer"
                  >
                    <SettingsIcon className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">Settings</span>
                  </button>
                  <button
                    className="flex items-center gap-3 p-4 bg-emerald-50 hover:bg-emerald-100 rounded-2xl transition-all cursor-pointer"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">Mark All Paid</span>
                  </button>
                </div>
              </div>

              {/* Collection Health Gauge - spans 4 cols (original size) */}
              <div className="lg:col-span-4 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">Collection Health</h3>
                  <TrendingUp className="w-4 h-4 text-gray-300" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-4">
                  <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
                    <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#f1f5f9" strokeWidth="16" strokeLinecap="round" />
                    <path
                      d="M 20 110 A 80 80 0 0 1 180 110"
                      fill="none"
                      stroke={collectionColor}
                      strokeWidth="16"
                      strokeLinecap="round"
                      strokeDasharray={`${(collectionRate / 100) * 251.2} 251.2`}
                    />
                  </svg>

                  <div className="text-center -mt-5">
                    <span className="text-4xl font-black text-gray-900">{collectionRate.toFixed(0)}%</span>
                    <p className="text-sm font-bold mt-1" style={{ color: collectionColor }}>{collectionLabel}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-400 text-center leading-relaxed mt-auto">
                  Share of billed revenue collected across {invoices.length} invoice{invoices.length === 1 ? '' : 's'}.
                </p>
              </div>

            </div>

            {/* Charts + Analytics + Summary Row */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-6 items-start">
              {/* Analytics - spans 6 cols */}
              <div className="lg:col-span-6 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60">
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Analytics</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Revenue trends & status breakdown</p>
                  </div>
                  <button className="text-xs text-blue-500 font-medium hover:text-blue-600 transition-colors cursor-pointer flex items-center gap-1">
                    See All <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <Charts invoices={invoices} />
              </div>

              {/* Summary Card - spans 2 cols (right side) */}
              <div className="lg:col-span-2 bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">Summary</h3>
                  <Receipt className="w-4 h-4 text-gray-300" />
                </div>
                <div className="flex-1 space-y-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Total Invoices</span>
                    <span className="text-sm font-bold text-gray-800">{invoices.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Paid</span>
                    <span className="text-sm font-bold text-emerald-600">{invoices.filter(i => i.status === 'Paid').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Pending</span>
                    <span className="text-sm font-bold text-amber-600">{invoices.filter(i => i.status === 'Pending').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Overdue</span>
                    <span className="text-sm font-bold text-rose-600">{overdueCount}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">Avg Invoice</span>
                    <span className="text-sm font-bold text-gray-800">
                      {currencySymbol}{invoices.length > 0 ? Math.round(totalRevenue / invoices.length).toLocaleString() : '0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Ledger Table */}
            <div className="bg-white p-7 rounded-3xl shadow-md shadow-gray-200/60">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Invoice Ledger</h2>
                  <p className="text-xs text-gray-400 mt-0.5">All your invoices in one place</p>
                </div>
                <button
                  onClick={() => { setEditingInvoice(undefined); setViewState('create'); }}
                  className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" /> Add New
                </button>
              </div>
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

        {/* Create/Edit Invoice */}
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

        {/* Ledger */}
        {viewState === 'ledger' && (
          <Ledger template={invoiceTemplate} />
        )}

        {/* Settings */}
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

      {/* Custom Confirmation Modal - Clean style */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in" id="custom-confirm-dialog">
          <div className="bg-white rounded-3xl max-w-md w-full border border-gray-100 shadow-2xl p-7 space-y-5">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-gray-900">{confirmModal.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2.5 text-white rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer ${confirmModal.actionStyle}`}
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
