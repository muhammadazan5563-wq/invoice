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
import { Invoice } from '../types';
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
} from 'lucide-react';

export default function Ledger() {
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [allInvoices, setAllInvoices] = useState<LedgerInvoice[]>([]);
  const [allExpenses, setAllExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state: 'list' shows all ledgers, 'detail' shows a specific ledger's report
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  // Create Ledger Panel State
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [todayInvoices, setTodayInvoices] = useState<Invoice[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  // Cash/Expense entries for the current ledger creation
  const [expenseEntries, setExpenseEntries] = useState<{ name: string; amount: string; description: string }[]>([]);

  // New expense form
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLedgerData();
  }, []);

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
      setLedgerEntries(groupLedgerByDate(invoices, expenses));
    } catch (err: any) {
      setError(err.message || 'Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreatePanel = async () => {
    setShowCreatePanel(true);
    setShowExpenseForm(false);
    setExpenseEntries([]);
    setError(null);
    await fetchInvoicesForDate(selectedDate);
  };

  const fetchInvoicesForDate = async (date: string) => {
    try {
      const invoices = await getInvoices();
      // Show invoices where payment_date matches the selected date (regardless of status)
      const matchingInvoices = invoices.filter((inv) => {
        const invPaymentDate = inv.paymentDate || '';
        return invPaymentDate === date;
      });
      setTodayInvoices(matchingInvoices);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    }
  };

  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    if (showCreatePanel) {
      await fetchInvoicesForDate(newDate);
    }
  };

  const handleAddExpenseEntry = () => {
    if (!newExpenseName.trim() || !newExpenseAmount.trim()) return;
    setExpenseEntries([
      ...expenseEntries,
      { name: newExpenseName.trim(), amount: newExpenseAmount.trim(), description: newExpenseDescription.trim() },
    ]);
    setNewExpenseName('');
    setNewExpenseAmount('');
    setNewExpenseDescription('');
  };

  const handleRemoveExpenseEntry = (index: number) => {
    setExpenseEntries(expenseEntries.filter((_, i) => i !== index));
  };

  const handleSaveLedger = async () => {
    setSaving(true);
    setError(null);
    try {
      // Save invoices as ledger_invoices
      for (const inv of todayInvoices) {
        await createLedgerInvoice({
          guest_name: inv.customerName,
          hotel_name: inv.hotelName || '',
          total_amount: inv.totalAmount,
        });
      }

      // Save expense entries
      for (const exp of expenseEntries) {
        await createCashExpense({
          name: exp.name,
          amount: Number(exp.amount) || 0,
          description: exp.description,
        });
      }

      // Refresh data and close panel
      await fetchLedgerData();
      setShowCreatePanel(false);
      setExpenseEntries([]);
      setTodayInvoices([]);
    } catch (err: any) {
      setError(err.message || 'Failed to save ledger');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLedgerInvoice = async (id: number) => {
    try {
      await deleteLedgerInvoice(id);
      await fetchLedgerData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  };

  const handleDeleteCashExpense = async (id: number) => {
    try {
      await deleteCashExpense(id);
      await fetchLedgerData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
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
  const grandTotalReceived = allInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const grandTotalExpense = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Totals for create panel
  const panelTotalReceived = todayInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const panelTotalExpense = expenseEntries.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

  // Detail view
  if (viewMode === 'detail' && selectedEntry) {
    return (
      <div className="space-y-6 animate-fade-in" id="ledger-detail-section">
        {/* Back Button */}
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ledger List
        </button>

        {/* Report Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Ledger Report - {selectedEntry.date}
              </h2>
              <p className="text-sm text-gray-500 mt-1">Daily income and expense breakdown</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs font-bold text-gray-400 uppercase">Net</span>
                <p className={`text-lg font-black ${(selectedEntry.totalReceived - selectedEntry.totalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ${(selectedEntry.totalReceived - selectedEntry.totalExpense).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-700 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Total Received</span>
              </div>
              <span className="text-2xl font-black text-emerald-800">
                ${selectedEntry.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
              <div className="flex items-center gap-2 text-rose-700 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Total Expense</span>
              </div>
              <span className="text-2xl font-black text-rose-800">
                ${selectedEntry.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Invoices Table */}
          {selectedEntry.invoices.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Income / Invoices ({selectedEntry.invoices.length})
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Guest Name</th>
                      <th className="py-3 px-4">Hotel Name</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedEntry.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4 text-sm font-bold text-indigo-600">#{inv.id}</td>
                        <td className="py-3 px-4 text-sm font-medium text-gray-700">{inv.guest_name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{inv.hotel_name || '-'}</td>
                        <td className="py-3 px-4 text-sm font-bold text-emerald-700 text-right">
                          +${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteLedgerInvoice(inv.id)}
                            className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expenses Table */}
          {selectedEntry.expenses.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-rose-600" />
                Expenses ({selectedEntry.expenses.length})
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedEntry.expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4 text-sm font-medium text-gray-700">{exp.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{exp.description || '-'}</td>
                        <td className="py-3 px-4 text-sm font-bold text-rose-700 text-right">
                          -${exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteCashExpense(exp.id)}
                            className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view (default)
  return (
    <div className="space-y-6 animate-fade-in" id="ledger-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1">Track daily income and expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          />
          <button
            onClick={fetchLedgerData}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleOpenCreatePanel}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-200/50 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Create Ledger
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 text-rose-700 border border-rose-100 p-4 rounded-2xl text-sm font-medium flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Total Received</span>
          </div>
          <span className="text-2xl font-black text-gray-900">
            ${grandTotalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-rose-600 mb-2">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Total Expense</span>
          </div>
          <span className="text-2xl font-black text-gray-900">
            ${grandTotalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Net Balance</span>
          </div>
          <span className={`text-2xl font-black ${(grandTotalReceived - grandTotalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            ${(grandTotalReceived - grandTotalExpense).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Ledger List Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">All Ledger Entries</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click "Show Report" to view full details</p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-gray-400 mt-3">Loading ledger data...</p>
          </div>
        ) : ledgerEntries.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-medium">No ledger entries yet</p>
            <p className="text-xs text-gray-300 mt-1">Click "Create Ledger" to add your first entry</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Date</th>
                  <th className="py-3.5 px-5">Description</th>
                  <th className="py-3.5 px-5 text-right">Total Received</th>
                  <th className="py-3.5 px-5 text-right">Total Expense</th>
                  <th className="py-3.5 px-5 text-right">Net</th>
                  <th className="py-3.5 px-5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.date} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-bold text-gray-800">{entry.date}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-sm text-gray-600">
                      {entry.invoices.length} invoice{entry.invoices.length !== 1 ? 's' : ''}, {entry.expenses.length} expense{entry.expenses.length !== 1 ? 's' : ''}
                    </td>
                    <td className="py-4 px-5 text-sm font-bold text-emerald-700 text-right">
                      +${entry.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-5 text-sm font-bold text-rose-700 text-right">
                      -${entry.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <span className={`text-sm font-black ${(entry.totalReceived - entry.totalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        ${(entry.totalReceived - entry.totalExpense).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-center">
                      <button
                        onClick={() => handleShowReport(entry)}
                        className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer mx-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Show Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Ledger Panel (Full Screen Modal) */}
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-fade-in">
          {/* Full-screen Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreatePanel(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Create Ledger Entry</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
              />
              <button
                onClick={() => setShowCreatePanel(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Full-screen Content */}
          <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
            {/* Today's Invoices Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-gray-800">Payment Received</h3>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-bold">
                  {todayInvoices.length} invoice{todayInvoices.length !== 1 ? 's' : ''}
                </span>
              </div>

              {todayInvoices.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-8 text-center border border-gray-100">
                  <Receipt className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-medium">No invoices with payment date matching {selectedDate}</p>
                  <p className="text-xs text-gray-300 mt-1">Try selecting a different date</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-3.5 px-5">Invoice #</th>
                        <th className="py-3.5 px-5">Guest Name</th>
                        <th className="py-3.5 px-5">Hotel Name</th>
                        <th className="py-3.5 px-5 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {todayInvoices.map((inv, idx) => (
                        <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="py-3.5 px-5 text-sm font-bold text-indigo-600">#{inv.id}</td>
                          <td className="py-3.5 px-5 text-sm font-medium text-gray-700">{inv.customerName}</td>
                          <td className="py-3.5 px-5 text-sm text-gray-600">{inv.hotelName || '-'}</td>
                          <td className="py-3.5 px-5 text-sm font-bold text-emerald-700 text-right">
                            ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cash & Expense Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-rose-600" />
                  <h3 className="text-base font-bold text-gray-800">Cash & Expense</h3>
                  {expenseEntries.length > 0 && (
                    <span className="text-xs bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full font-bold">
                      {expenseEntries.length} entr{expenseEntries.length !== 1 ? 'ies' : 'y'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Cash & Expense
                </button>
              </div>

              {/* Expense Entries Table */}
              {expenseEntries.length > 0 && (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-4">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-3.5 px-5">Name</th>
                        <th className="py-3.5 px-5 text-right">Amount</th>
                        <th className="py-3.5 px-5">Description</th>
                        <th className="py-3.5 px-5 text-center w-16">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expenseEntries.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/30 transition-colors">
                          <td className="py-3.5 px-5 text-sm font-medium text-gray-700">{entry.name}</td>
                          <td className="py-3.5 px-5 text-sm font-bold text-rose-700 text-right">
                            ${Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-5 text-sm text-gray-500">{entry.description || '-'}</td>
                          <td className="py-3.5 px-5 text-center">
                            <button
                              onClick={() => handleRemoveExpenseEntry(idx)}
                              className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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

              {/* Add Expense Form */}
              {showExpenseForm && (
                <div className="bg-gray-50 rounded-2xl p-5 space-y-4 border border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700">New Expense Entry</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Fuel, Food, Rent"
                        value={newExpenseName}
                        onChange={(e) => setNewExpenseName(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Amount</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={newExpenseAmount}
                        onChange={(e) => setNewExpenseAmount(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
                      <input
                        type="text"
                        placeholder="Optional details"
                        value={newExpenseDescription}
                        onChange={(e) => setNewExpenseDescription(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddExpenseEntry}
                    disabled={!newExpenseName.trim() || !newExpenseAmount.trim()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add Entry
                  </button>
                </div>
              )}
            </div>

            {/* Totals Summary */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl p-6 border border-indigo-100">
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Total Amount Received</span>
                  <span className="text-2xl font-black text-emerald-700">
                    ${panelTotalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Total Expense</span>
                  <span className="text-2xl font-black text-rose-700">
                    ${panelTotalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Net Balance</span>
                  <span className={`text-2xl font-black ${(panelTotalReceived - panelTotalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    ${(panelTotalReceived - panelTotalExpense).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3 pb-8">
              <button
                onClick={() => setShowCreatePanel(false)}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLedger}
                disabled={saving || (todayInvoices.length === 0 && expenseEntries.length === 0)}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-200/50 cursor-pointer"
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
      )}
    </div>
  );
}
