import React, { useState, useEffect } from 'react';
import {
  getLedgerInvoices,
  getCashExpenses,
  createLedgerInvoice,
  createCashExpense,
  deleteLedgerInvoice,
  deleteCashExpense,
  groupLedgerByDate,
  LedgerInvoice,
  CashExpense,
  LedgerEntry,
} from '../lib/ledger';
import { getInvoices } from '../lib/supabase';
import { InvoiceTemplate, getUserSettings, getTemplateWithDefaults, getCurrencySymbol } from '../lib/settings';
import { getTodayInTimezone } from '../lib/timezone';
import { Invoice, PaymentRecord } from '../types';
import {
  PlusCircle,
  X,
  BookOpen,
  Calendar,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Trash2,
  RefreshCw,
  Receipt,
  Banknote,
  AlertCircle,
  Eye,
  ArrowLeft,
  Plus,
  Edit3,
} from 'lucide-react';

interface LedgerProps {
  template?: InvoiceTemplate | null;
}

export default function Ledger({ template }: LedgerProps) {
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [allInvoices, setAllInvoices] = useState<LedgerInvoice[]>([]);
  const [allExpenses, setAllExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // View state
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'create'>('list');
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  // Create Ledger State - use timezone-aware date
  const [selectedDate, setSelectedDate] = useState(() => getTodayInTimezone(template?.timezone || 'UTC'));
  const [todayInvoices, setTodayInvoices] = useState<Invoice[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseEntries, setExpenseEntries] = useState<{ name: string; amount: string; description: string; tag: string }[]>([]);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseTag, setNewExpenseTag] = useState<string>('expense');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'entry'; date: string } | null>(null);

  useEffect(() => {
    fetchLedgerData();
  }, []);

  // Update currency symbol when template prop changes
  useEffect(() => {
    if (template?.currency) {
      setCurrencySymbol(getCurrencySymbol(template.currency));
    } else {
      // Fallback: try to load from localStorage/Firebase
      loadCurrencySettings();
    }
  }, [template]);

  const loadCurrencySettings = async () => {
    try {
      const keys = Object.keys(localStorage);
      const firebaseKey = keys.find(k => k.startsWith('firebase:authUser:'));
      if (firebaseKey) {
        const userData = JSON.parse(localStorage.getItem(firebaseKey) || '{}');
        if (userData.uid) {
          const settings = await getUserSettings(userData.uid);
          if (settings?.invoice_template) {
            const tmpl = getTemplateWithDefaults(settings.invoice_template);
            setCurrencySymbol(getCurrencySymbol(tmpl.currency));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load currency settings for ledger:', err);
    }
  };

  const fetchLedgerData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoices, expenses] = await Promise.all([
        getLedgerInvoices(),
        getCashExpenses(),
      ]);
      setAllInvoices(invoices);
      setAllExpenses(expenses);
      setLedgerEntries(groupLedgerByDate(invoices, expenses, template?.timezone || 'UTC'));
    } catch (err: any) {
      setError(err.message || 'Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreatePanel = async (editDate?: string) => {
    const dateToUse = editDate || selectedDate;
    // Update selectedDate immediately so the panel shows the correct date
    setSelectedDate(dateToUse);
    setViewMode('create');
    setShowExpenseForm(false);
    setError(null);

    // Load existing expenses for this date from the database
    // so they appear in the edit panel (not just in the report view)
    const existingEntry = ledgerEntries.find((e) => e.date === dateToUse);
    if (existingEntry && existingEntry.expenses.length > 0) {
      // Pre-populate the expense entries from the saved data
      setExpenseEntries(
        existingEntry.expenses.map((exp) => ({
          name: exp.name,
          amount: String(exp.amount),
          description: exp.description || '',
          tag: exp.tag || 'expense',
        }))
      );
      setShowExpenseForm(true);
    } else {
      setExpenseEntries([]);
    }

    await fetchInvoicesForDate(dateToUse);
  };

  const fetchInvoicesForDate = async (date: string) => {
    try {
      const invoices = await getInvoices();
      // Build a list of invoices that have at least one payment on the selected date.
      // For each matching invoice, override totalAmount to show ONLY the sum of
      // payments made on that specific date (not the full invoice total).
      const matchingInvoices: Invoice[] = [];

      for (const inv of invoices) {
        const paymentsArray: PaymentRecord[] = inv.payments || [];

        if (paymentsArray.length > 0) {
          // Sum only payments whose date matches the selected ledger date
          const datePayments = paymentsArray.filter((p) => p.date === date);
          if (datePayments.length > 0) {
            const dateTotal = datePayments.reduce((sum, p) => sum + p.amount, 0);
            // Create a copy with totalAmount reflecting only this date's payments
            matchingInvoices.push({ ...inv, totalAmount: dateTotal });
          }
        } else {
          // Fallback for invoices without a payments array: use legacy paymentDate field
          if (inv.paymentDate === date) {
            matchingInvoices.push(inv);
          }
        }
      }

      // Sort by invoice ID ascending (1, 2, 3, 4...)
      matchingInvoices.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setTodayInvoices(matchingInvoices);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    }
  };

  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    if (viewMode === 'create') {
      await fetchInvoicesForDate(newDate);
    }
  };

  const handleAddExpenseEntry = () => {
    if (!newExpenseName.trim() || !newExpenseAmount.trim()) return;
    setExpenseEntries([
      ...expenseEntries,
      { name: newExpenseName.trim(), amount: newExpenseAmount.trim(), description: newExpenseDescription.trim(), tag: newExpenseTag },
    ]);
    setNewExpenseName('');
    setNewExpenseAmount('');
    setNewExpenseDescription('');
    setNewExpenseTag('expense');
  };

  const handleRemoveExpenseEntry = (index: number) => {
    setExpenseEntries(expenseEntries.filter((_, i) => i !== index));
  };

  const handleSaveLedger = async () => {
    setSaving(true);
    setError(null);
    try {
      // Check for duplicate entries - build a set of existing ledger invoice IDs
      const existingIds = new Set(allInvoices.map((inv) => String(inv.id)));

      // Save invoices as ledger_invoices (skip duplicates)
      // Note: todayInvoices already has totalAmount adjusted to only the
      // payment amount for the selected date (not the full invoice total).
      for (const inv of todayInvoices) {
        // Build a unique key combining invoice ID and selected date to allow
        // the same invoice to appear in multiple ledger dates for different payments.
        const ledgerKey = `${inv.id}_${selectedDate}`;
        if (existingIds.has(ledgerKey)) {
          continue; // Skip duplicate
        }
        await createLedgerInvoice({
          id: ledgerKey,
          guest_name: inv.customerName,
          hotel_name: inv.hotelName || '',
          total_amount: inv.totalAmount,
        });
      }

      // Save expense entries
      // First, delete existing expenses for this date to avoid duplicates when editing
      const existingEntry = ledgerEntries.find((e) => e.date === selectedDate);
      if (existingEntry && existingEntry.expenses.length > 0) {
        for (const exp of existingEntry.expenses) {
          await deleteCashExpense(exp.id);
        }
      }

      // Then save all expense entries (both pre-existing and newly added)
      for (const exp of expenseEntries) {
        await createCashExpense({
          name: exp.name,
          amount: Number(exp.amount) || 0,
          description: exp.description,
          tag: exp.tag || 'expense',
        });
      }

      // Refresh data and go back to list
      await fetchLedgerData();
      setViewMode('list');
      setExpenseEntries([]);
      setTodayInvoices([]);
    } catch (err: any) {
      setError(err.message || 'Failed to save ledger');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLedgerInvoice = async (id: string) => {
    try {
      await deleteLedgerInvoice(id);
      await fetchLedgerData();
      // Update selected entry if in detail view
      if (selectedEntry) {
        const updated = selectedEntry.invoices.filter((inv) => inv.id !== id);
        setSelectedEntry({ ...selectedEntry, invoices: updated, totalReceived: updated.reduce((s, i) => s + i.total_amount, 0) });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  };

  const handleDeleteCashExpense = async (id: number) => {
    try {
      await deleteCashExpense(id);
      await fetchLedgerData();
      if (selectedEntry) {
        const updated = selectedEntry.expenses.filter((exp) => exp.id !== id);
        const newTotalReceived = selectedEntry.invoices.reduce((s, i) => s + i.total_amount, 0)
          + updated.filter((e) => e.tag === 'cash').reduce((s, e) => s + e.amount, 0);
        const newTotalExpense = updated.filter((e) => e.tag !== 'cash').reduce((s, e) => s + e.amount, 0);
        setSelectedEntry({ ...selectedEntry, expenses: updated, totalReceived: newTotalReceived, totalExpense: newTotalExpense });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  };

  const handleDeleteEntireEntry = async (entry: LedgerEntry) => {
    try {
      for (const inv of entry.invoices) {
        await deleteLedgerInvoice(inv.id);
      }
      for (const exp of entry.expenses) {
        await deleteCashExpense(exp.id);
      }
      await fetchLedgerData();
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete entry');
      setDeleteConfirm(null);
    }
  };

  const handleShowReport = (entry: LedgerEntry) => {
    setSelectedEntry(entry);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedEntry(null);
  };

  // Calculate totals
  // Cash-tagged entries are added to received, expense-tagged entries are deducted
  const grandTotalReceived = allInvoices.reduce((sum, inv) => sum + inv.total_amount, 0)
    + allExpenses.filter((exp) => exp.tag === 'cash').reduce((sum, exp) => sum + exp.amount, 0);
  const grandTotalExpense = allExpenses.filter((exp) => exp.tag !== 'cash').reduce((sum, exp) => sum + exp.amount, 0);

  // Totals for create panel
  // Cash-tagged entries add to received, expense-tagged entries add to expense
  const panelTotalReceived = todayInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
    + expenseEntries.filter((exp) => exp.tag === 'cash').reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const panelTotalExpense = expenseEntries.filter((exp) => exp.tag !== 'cash').reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

  // ============ CREATE VIEW ============
  if (viewMode === 'create') {
    return (
      <div className="min-h-screen -mx-8 -mt-8 -mb-8 bg-white" id="ledger-create-section">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-8 py-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setViewMode('list')}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">Create Ledger Entry</h1>
                <p className="text-sm text-indigo-200 mt-0.5">Record daily income and expenses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 border border-white/20">
                <Calendar className="w-4 h-4 text-indigo-200" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
          {error && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 p-4 rounded-xl text-sm font-medium flex gap-3 items-center">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Payment Received Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Payment Received</h2>
                  <p className="text-xs text-gray-500">Invoices with payment date: {selectedDate}</p>
                </div>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-sm font-bold px-4 py-1.5 rounded-full">
                {todayInvoices.length} invoice{todayInvoices.length !== 1 ? 's' : ''}
              </span>
            </div>

            {todayInvoices.length === 0 ? (
              <div className="bg-slate-50 rounded-2xl p-10 text-center border-2 border-dashed border-slate-200">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-base text-slate-500 font-medium">No invoices found for this date</p>
                <p className="text-sm text-slate-400 mt-1">Try selecting a different date using the date picker above</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice #</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Guest Name</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Hotel Name</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todayInvoices.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="py-4 px-6">
                          <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">#{inv.id}</span>
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-slate-800">{inv.customerName}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">{inv.hotelName || '—'}</td>
                        <td className="py-4 px-6 text-right">
                          <span className="text-sm font-bold text-emerald-700">{currencySymbol}{inv.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Cash & Expense Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Cash & Expense</h2>
                  <p className="text-xs text-gray-500">Add expense entries for today</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Cash & Expense
              </button>
            </div>

            {/* Add Expense Form */}
            {showExpenseForm && (
              <div className="bg-slate-50 rounded-2xl p-6 mb-4 border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Fuel, Food, Rent"
                      value={newExpenseName}
                      onChange={(e) => setNewExpenseName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Amount *</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={newExpenseAmount}
                      onChange={(e) => setNewExpenseAmount(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Tag *</label>
                    <select
                      value={newExpenseTag}
                      onChange={(e) => setNewExpenseTag(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
                    >
                      <option value="cash">Cash</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Description</label>
                    <input
                      type="text"
                      placeholder="Optional details"
                      value={newExpenseDescription}
                      onChange={(e) => setNewExpenseDescription(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    onClick={handleAddExpenseEntry}
                    disabled={!newExpenseName.trim() || !newExpenseAmount.trim()}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold px-5 py-3 rounded-xl transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Expense Entries Table */}
            {expenseEntries.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Tag</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenseEntries.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/40 transition-colors">
                        <td className="py-4 px-6 text-sm font-semibold text-slate-800">{entry.name}</td>
                        <td className="py-4 px-6 text-right">
                          <span className="text-sm font-bold text-rose-700">{currencySymbol}{Number(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${entry.tag === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {entry.tag === 'cash' ? 'Cash' : 'Expense'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-500">{entry.description || '—'}</td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => handleRemoveExpenseEntry(idx)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {expenseEntries.length === 0 && !showExpenseForm && (
              <div className="bg-slate-50 rounded-2xl p-8 text-center border-2 border-dashed border-slate-200">
                <Banknote className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">No expenses added yet</p>
                <p className="text-xs text-slate-400 mt-1">Click "Add Cash & Expense" to add entries</p>
              </div>
            )}
          </section>

          {/* Totals Summary */}
          <section className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-2xl p-8 text-white">
            <div className="grid grid-cols-3 gap-8">
              <div className="text-center">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-2">Total Amount Received</span>
                <span className="text-3xl font-black text-emerald-400">
                  {currencySymbol}{panelTotalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-2">Total Expense</span>
                <span className="text-3xl font-black text-rose-400">
                  {currencySymbol}{panelTotalExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-2">Net Balance</span>
                <span className={`text-3xl font-black ${(panelTotalReceived - panelTotalExpense) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {currencySymbol}{(panelTotalReceived - panelTotalExpense).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pb-8">
            <button
              onClick={() => setViewMode('list')}
              className="px-8 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLedger}
              disabled={saving || (todayInvoices.length === 0 && expenseEntries.length === 0)}
              className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-300/30 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
                  Save Ledger
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ DETAIL VIEW ============
  if (viewMode === 'detail' && selectedEntry) {
    return (
      <div className="space-y-6 animate-fade-in" id="ledger-detail-section">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ledger List
        </button>

        {/* Report Header */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Calendar className="w-5 h-5 text-indigo-300" />
                Ledger Report — {selectedEntry.date}
              </h2>
              <p className="text-sm text-indigo-200 mt-1">Daily income and expense breakdown</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">Net Balance</span>
              <p className={`text-3xl font-black mt-1 ${(selectedEntry.totalReceived - selectedEntry.totalExpense) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currencySymbol}{(selectedEntry.totalReceived - selectedEntry.totalExpense).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-6">
            <div className="bg-white/10 rounded-xl p-5 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-2 text-emerald-300 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Total Received</span>
              </div>
              <span className="text-2xl font-black text-white">
                {currencySymbol}{selectedEntry.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="bg-white/10 rounded-xl p-5 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-2 text-rose-300 mb-2">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Total Expense</span>
              </div>
              <span className="text-2xl font-black text-white">
                {currencySymbol}{selectedEntry.totalExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        {selectedEntry.invoices.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Receipt className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Income / Invoices ({selectedEntry.invoices.length})</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice #</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Guest Name</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Hotel Name</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedEntry.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">#{inv.id}</span>
                    </td>
                    <td className="py-3.5 px-6 text-sm font-semibold text-slate-700">{inv.guest_name}</td>
                    <td className="py-3.5 px-6 text-sm text-slate-600">{inv.hotel_name || '—'}</td>
                    <td className="py-3.5 px-6 text-sm font-bold text-emerald-700 text-right">
                      +{currencySymbol}{inv.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <button
                        onClick={() => handleDeleteLedgerInvoice(inv.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cash Received Table */}
        {selectedEntry.expenses.filter((exp) => exp.tag === 'cash').length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Cash Received ({selectedEntry.expenses.filter((exp) => exp.tag === 'cash').length})</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Tag</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedEntry.expenses.filter((exp) => exp.tag === 'cash').map((exp) => (
                  <tr key={exp.id} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="py-3.5 px-6 text-sm font-semibold text-slate-700">{exp.name}</td>
                    <td className="py-3.5 px-6 text-center">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                        Cash
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-sm text-slate-500">{exp.description || '—'}</td>
                    <td className="py-3.5 px-6 text-sm font-bold text-emerald-700 text-right">
                      +{currencySymbol}{exp.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <button
                        onClick={() => handleDeleteCashExpense(exp.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Expenses Table */}
        {selectedEntry.expenses.filter((exp) => exp.tag !== 'cash').length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-4 h-4 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Expenses ({selectedEntry.expenses.filter((exp) => exp.tag !== 'cash').length})</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Tag</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="py-3.5 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedEntry.expenses.filter((exp) => exp.tag !== 'cash').map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6 text-sm font-semibold text-slate-700">{exp.name}</td>
                    <td className="py-3.5 px-6 text-center">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
                        Expense
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-sm text-slate-500">{exp.description || '—'}</td>
                    <td className="py-3.5 px-6 text-sm font-bold text-rose-700 text-right">
                      -{currencySymbol}{exp.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <button
                        onClick={() => handleDeleteCashExpense(exp.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ============ LIST VIEW (Default) ============
  return (
    <div className="space-y-6 animate-fade-in" id="ledger-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1 ml-13">Track daily income and expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-sm"
          />
          <button
            onClick={fetchLedgerData}
            disabled={loading}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => handleOpenCreatePanel()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-200/50 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Create Ledger
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 p-4 rounded-xl text-sm font-medium flex gap-3 items-center">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Received</span>
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">
            {currencySymbol}{grandTotalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expense</span>
            <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">
            {currencySymbol}{grandTotalExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Balance</span>
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <span className={`text-3xl font-black ${(grandTotalReceived - grandTotalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {currencySymbol}{(grandTotalReceived - grandTotalExpense).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Ledger List Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">All Ledger Entries</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click "Show Report" to view full breakdown</p>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
            {ledgerEntries.length} entr{ledgerEntries.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-slate-400 mt-4">Loading ledger data...</p>
          </div>
        ) : ledgerEntries.length === 0 ? (
          <div className="p-16 text-center">
            <BookOpen className="w-14 h-14 text-slate-200 mx-auto mb-4" />
            <p className="text-base text-slate-500 font-semibold">No ledger entries yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Create Ledger" to add your first entry</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Received</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Expense</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Net</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.date} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <span className="text-sm font-bold text-slate-800">{entry.date}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600">
                      {entry.invoices.length} invoice{entry.invoices.length !== 1 ? 's' : ''}, {entry.expenses.length} expense{entry.expenses.length !== 1 ? 's' : ''}
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-emerald-700 text-right">
                      +{currencySymbol}{entry.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-rose-700 text-right">
                      -{currencySymbol}{entry.totalExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`text-sm font-black ${(entry.totalReceived - entry.totalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {currencySymbol}{(entry.totalReceived - entry.totalExpense).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleShowReport(entry)}
                          className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
                          title="Show Report"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Report
                        </button>
                        <button
                          onClick={() => {
                            setSelectedDate(entry.date);
                            handleOpenCreatePanel(entry.date);
                          }}
                          className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
                          title="Edit Entry"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'entry', date: entry.date })}
                          className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
                          title="Delete Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-7 space-y-5">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Delete Ledger Entry</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Are you sure you want to delete the entire ledger entry for <strong>{deleteConfirm.date}</strong>? This will remove all invoices and expenses for this date. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const entry = ledgerEntries.find((e) => e.date === deleteConfirm.date);
                  if (entry) handleDeleteEntireEntry(entry);
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
