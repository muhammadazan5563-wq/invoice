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
} from 'lucide-react';

export default function Ledger() {
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [allInvoices, setAllInvoices] = useState<LedgerInvoice[]>([]);
  const [allExpenses, setAllExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Ledger Panel State
  const [showCreatePanel, setShowCreatePanel] = useState(false);
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

    // Fetch today's paid invoices
    try {
      const invoices = await getInvoices();
      const today = new Date().toISOString().split('T')[0];
      const todayPaid = invoices.filter((inv) => {
        const invDate = inv.paymentDate || inv.date;
        return invDate === today && inv.status === 'Paid';
      });
      setTodayInvoices(todayPaid);
    } catch (err: any) {
      setError(err.message || 'Failed to load today invoices');
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
      // Save today's invoices as ledger_invoices
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

  // Calculate totals
  const grandTotalReceived = allInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const grandTotalExpense = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Today's totals for create panel
  const todayTotalReceived = todayInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const todayTotalExpense = expenseEntries.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

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

      {/* Ledger List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">All Ledger Entries</h2>
          <p className="text-xs text-gray-400 mt-0.5">Grouped by date</p>
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
          <div className="divide-y divide-gray-100">
            {ledgerEntries.map((entry) => (
              <div key={entry.date} className="p-5 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-bold text-gray-800">{entry.date}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <span className="text-emerald-600">
                      +${entry.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-rose-600">
                      -${entry.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Invoices for this date */}
                {entry.invoices.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Income / Invoices</span>
                    <div className="mt-1 space-y-1">
                      {entry.invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between bg-emerald-50 px-3 py-2 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-xs font-semibold text-gray-700">#{inv.id}</span>
                            <span className="text-xs text-gray-600">{inv.guest_name}</span>
                            {inv.hotel_name && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                                {inv.hotel_name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700">
                              +${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              onClick={() => handleDeleteLedgerInvoice(inv.id)}
                              className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expenses for this date */}
                {entry.expenses.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expenses</span>
                    <div className="mt-1 space-y-1">
                      {entry.expenses.map((exp) => (
                        <div key={exp.id} className="flex items-center justify-between bg-rose-50 px-3 py-2 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Banknote className="w-3.5 h-3.5 text-rose-600" />
                            <span className="text-xs font-semibold text-gray-700">{exp.name}</span>
                            {exp.description && (
                              <span className="text-xs text-gray-400">- {exp.description}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-rose-700">
                              -${exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              onClick={() => handleDeleteCashExpense(exp.id)}
                              className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Ledger Panel (Modal) */}
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-gray-900/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-gray-100 shadow-2xl overflow-hidden my-4">
            {/* Panel Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Create Ledger Entry</h2>
                <p className="text-sm text-indigo-100 mt-0.5">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setShowCreatePanel(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Today's Invoices Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-gray-800">Today's Payment Received</h3>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                    {todayInvoices.length} invoices
                  </span>
                </div>

                {todayInvoices.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-400">No paid invoices found for today</p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4">Invoice #</th>
                          <th className="py-3 px-4">Guest Name</th>
                          <th className="py-3 px-4">Hotel Name</th>
                          <th className="py-3 px-4 text-right">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {todayInvoices.map((inv, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-3 px-4 text-sm font-bold text-indigo-600">#{inv.id}</td>
                            <td className="py-3 px-4 text-sm font-medium text-gray-700">{inv.customerName}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{inv.hotelName || '-'}</td>
                            <td className="py-3 px-4 text-sm font-bold text-emerald-700 text-right">
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
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-rose-600" />
                    <h3 className="text-sm font-bold text-gray-800">Cash & Expense</h3>
                    {expenseEntries.length > 0 && (
                      <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">
                        {expenseEntries.length} entries
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowExpenseForm(!showExpenseForm)}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Expense
                  </button>
                </div>

                {/* Expense Entries Table */}
                {expenseEntries.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4 text-center w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {expenseEntries.map((entry, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-3 px-4 text-sm font-medium text-gray-700">{entry.name}</td>
                            <td className="py-3 px-4 text-sm font-bold text-rose-700 text-right">
                              ${Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-500">{entry.description || '-'}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleRemoveExpenseEntry(idx)}
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
                )}

                {/* Add Expense Form */}
                {showExpenseForm && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Name"
                        value={newExpenseName}
                        onChange={(e) => setNewExpenseName(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                      <input
                        type="number"
                        placeholder="Amount"
                        value={newExpenseAmount}
                        onChange={(e) => setNewExpenseAmount(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={newExpenseDescription}
                        onChange={(e) => setNewExpenseDescription(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleAddExpenseEntry}
                      disabled={!newExpenseName.trim() || !newExpenseAmount.trim()}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Add Entry
                    </button>
                  </div>
                )}
              </div>

              {/* Totals Summary */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Amount Received</span>
                    <span className="text-xl font-black text-emerald-700">
                      ${todayTotalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Expense</span>
                    <span className="text-xl font-black text-rose-700">
                      ${todayTotalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Net</span>
                  <span className={`text-2xl font-black ${(todayTotalReceived - todayTotalExpense) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    ${(todayTotalReceived - todayTotalExpense).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Panel Footer */}
            <div className="bg-gray-50 border-t border-gray-100 p-5 flex justify-end gap-3">
              <button
                onClick={() => setShowCreatePanel(false)}
                className="px-5 py-2.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLedger}
                disabled={saving || (todayInvoices.length === 0 && expenseEntries.length === 0)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer"
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
