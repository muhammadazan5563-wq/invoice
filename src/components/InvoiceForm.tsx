import React, { useState, useEffect } from 'react';
import { Invoice, BookingItem, PaymentRecord } from '../types';
import { InvoiceTemplate, getCurrencySymbol } from '../lib/settings';
import { Plus, Trash2, ArrowLeft, Save, Sparkles, Calendar } from 'lucide-react';

interface InvoiceFormProps {
  invoice?: Invoice; // If passed, we are in EDIT mode
  onSave: (invoiceData: Omit<Invoice, 'rowIndex' | 'rawRow'> & { rowIndex?: number }) => Promise<void>;
  onCancel: () => void;
  suggestInvoiceId?: string;
  template?: InvoiceTemplate | null; // Template settings from Supabase
}

export default function InvoiceForm({ invoice, onSave, onCancel, suggestInvoiceId, template }: InvoiceFormProps) {
  // Get currency symbol from template settings
  const currencySymbol = getCurrencySymbol(template?.currency || 'USD');

  const [id, setId] = useState('');
  const [date, setDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState('');
  const [status, setStatus] = useState<'Paid' | 'Unpaid' | 'Pending' | 'Overdue'>('Pending');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<BookingItem[]>([
    { roomType: '', quantity: 1, checkIn: '', checkOut: '', nights: 1, price: 0, total: 0 }
  ]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use template payment details if available, otherwise use hardcoded default
  const defaultNotes = template?.paymentDetails || `Beneficiaire Bank of America\nSwift Sort\nAccount No.: 324 6654 7766 9992`;

  // Load existing invoice data if in EDIT mode
  useEffect(() => {
    if (invoice) {
      setId(invoice.id);
      setDate(invoice.date);
      setCustomerName(invoice.customerName);
      setCustomerEmail(invoice.customerEmail);
      setHotelName(invoice.hotelName || '');
      setAmountPaid(invoice.amountPaid);
      setPaymentDate(invoice.paymentDate || invoice.date);
      setStatus(invoice.status);
      setNotes(invoice.notes);
      setItems(invoice.items.length > 0 ? invoice.items : [{ roomType: '', quantity: 1, checkIn: '', checkOut: '', nights: 1, price: 0, total: 0 }]);
      setSubtotal(invoice.totalAmount);

      // Load payments
      let initialPayments = invoice.payments || [];
      if (initialPayments.length === 0 && invoice.amountPaid > 0) {
        initialPayments = [{ amount: invoice.amountPaid, date: invoice.paymentDate || invoice.date }];
      }
      if (initialPayments.length === 0) {
        initialPayments = [{ amount: 0, date: invoice.date }];
      }
      setPayments(initialPayments);
    } else {
      // Create mode - use template defaults from Supabase settings
      const today = new Date().toISOString().split('T')[0];
      setId(suggestInvoiceId || `Z${Math.floor(1 + Math.random() * 99)}`);
      setDate(today);
      setCustomerName('');
      setCustomerEmail('');
      setHotelName(template?.defaultHotelName || '');
      setAmountPaid(0);
      setPaymentDate(today);
      setStatus('Due');
      // Use template payment details or default notes from template
      const notesValue = template?.paymentDetails || template?.defaultNotes || defaultNotes;
      setNotes(notesValue);
      setItems([{ roomType: 'AVG 4.5', quantity: 1, checkIn: today, checkOut: getNextDayStr(today), nights: 1, price: 50.00, total: 50.00 }]);
      setPayments([{ amount: 0, date: today }]);
    }
  }, [invoice, suggestInvoiceId, template]);

  function getNextDayStr(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  // Calculate nights difference between check-in and check-out
  const calculateNights = (checkInStr: string, checkOutStr: string): number => {
    if (!checkInStr || !checkOutStr) return 1;
    try {
      const d1 = new Date(checkInStr);
      const d2 = new Date(checkOutStr);
      const diffTime = d2.getTime() - d1.getTime();
      if (diffTime <= 0) return 1;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 1;
    }
  };

  // Handle dynamic subtotal calculation whenever booking items change
  useEffect(() => {
    const calculatedSubtotal = items.reduce((acc, curr) => acc + (curr.quantity * curr.nights * curr.price), 0);
    setSubtotal(calculatedSubtotal);
  }, [items]);

  // Sync total amount paid and main payment date from payments array
  useEffect(() => {
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    setAmountPaid(totalPaid);
    
    const firstDate = payments.find(p => p.date)?.date;
    if (firstDate) {
      setPaymentDate(firstDate);
    }
  }, [payments]);

  // Auto transition status based on balance
  useEffect(() => {
    const currentBalance = subtotal - amountPaid;
    if (currentBalance <= 0) {
      setStatus('Paid');
    } else if (status === 'Paid') {
      setStatus('Due');
    }
  }, [subtotal, amountPaid, status]);

  // Handle multi-payment actions
  const handleAddPayment = () => {
    const today = new Date().toISOString().split('T')[0];
    setPayments([...payments, { amount: 0, date: today }]);
  };

  const handleRemovePayment = (index: number) => {
    if (payments.length === 1) return;
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handlePaymentChange = (index: number, field: keyof PaymentRecord, value: any) => {
    const updated = [...payments];
    const item = { ...updated[index] };
    if (field === 'amount') {
      item.amount = Math.max(0, parseFloat(value) || 0);
    } else if (field === 'date') {
      item.date = value;
    }
    updated[index] = item;
    setPayments(updated);
  };

  // Handle item cell updates
  const handleItemChange = (index: number, field: keyof BookingItem, value: any) => {
    const updated = [...items];
    const currentItem = { ...updated[index] };

    if (field === 'roomType') {
      currentItem.roomType = value;
    } else if (field === 'quantity') {
      currentItem.quantity = Math.max(1, parseInt(value) || 0);
    } else if (field === 'checkIn') {
      currentItem.checkIn = value;
      currentItem.nights = calculateNights(value, currentItem.checkOut);
    } else if (field === 'checkOut') {
      currentItem.checkOut = value;
      currentItem.nights = calculateNights(currentItem.checkIn, value);
    } else if (field === 'nights') {
      currentItem.nights = Math.max(1, parseInt(value) || 0);
    } else if (field === 'price') {
      currentItem.price = Math.max(0, parseFloat(value) || 0);
    }

    currentItem.total = currentItem.quantity * currentItem.nights * currentItem.price;
    updated[index] = currentItem;
    setItems(updated);
  };

  const addItemRow = () => {
    const today = new Date().toISOString().split('T')[0];
    setItems([...items, { roomType: 'AVG 4.5', quantity: 1, checkIn: today, checkOut: getNextDayStr(today), nights: 1, price: 50.00, total: 50.00 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) return; // Keep at least one booking item
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) {
      setError('Invoice ID is required');
      return;
    }
    if (!customerName.trim()) {
      setError('Guest name is required');
      return;
    }
    if (items.some(item => !item.roomType.trim())) {
      setError('All booking lines must specify a Room or Room Type');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const balanceValue = subtotal - amountPaid;
      await onSave({
        rowIndex: invoice?.rowIndex,
        id: id.trim(),
        date,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        hotelName: hotelName.trim(),
        totalAmount: subtotal,
        amountPaid: amountPaid,
        paymentDate: paymentDate || date,
        balance: balanceValue,
        status,
        notes: notes.trim(),
        items: items.map(item => ({
          ...item,
          total: item.quantity * item.nights * item.price
        })),
        payments: payments.filter(p => p.amount > 0 || p.date)
      });
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save booking invoice to Google Sheets');
    } finally {
      setIsSaving(false);
    }
  };

  // Populate exactly the data shown in the user's screenshot!
  const generateSampleItems = () => {
    setId('Z5');
    setDate('2026-07-18');
    setCustomerName('FAIZ');
    setCustomerEmail('Albert@invoicefly.com');
    setAmountPaid(600.00);
    setPaymentDate('2026-07-18');
    setStatus('Pending');
    setNotes(defaultNotes);
    setItems([
      { roomType: 'AVG 4.5', quantity: 4, checkIn: '2026-07-18', checkOut: '2026-07-20', nights: 2, price: 50.00, total: 400.00 },
      { roomType: 'AVG 4.5', quantity: 4, checkIn: '2026-07-18', checkOut: '2026-07-22', nights: 4, price: 75.00, total: 1200.00 }
    ]);
    setPayments([{ amount: 600.00, date: '2026-07-18' }]);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 lg:p-8 animate-fade-in" id="invoice-form-container">
      {/* Form Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div>
          <button 
            type="button" 
            onClick={onCancel}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold text-slate-800">
            {invoice ? `Edit Booking Invoice #${invoice.id}` : 'Create New Booking Invoice'}
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Create hotel room booking invoices. Fully compatible with Google Sheets.
          </p>
        </div>
        
        {!invoice && (
          <button
            type="button"
            onClick={generateSampleItems}
            className="flex items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-semibold px-4 py-2.5 rounded-full border border-blue-100 transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" /> Fill Spreadsheet Sample
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-50 text-red-600 border border-red-100 p-4 rounded-2xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* 1. Basic Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Invoice No / Number *
            </label>
            <input
              type="text"
              required
              disabled={!!invoice}
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm disabled:opacity-60 font-semibold"
              placeholder="e.g. Z5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Invoice Date *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* 2. Guest Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Guest / Customer Name *
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm"
              placeholder="e.g. FAIZ"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Guest Email Address
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm"
              placeholder="e.g. Albert@invoicefly.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Hotel Name
            </label>
            <input
              type="text"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm"
              placeholder="e.g. FAIZ GROUP HOTEL"
            />
          </div>
        </div>

        {/* 3. Booking Lines / Room Inventory */}
        <div className="pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Room Booking Details
            </h3>
            <button
              type="button"
              onClick={addItemRow}
              className="flex items-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-blue-100"
            >
              <Plus className="w-3.5 h-3.5" /> Add Room Booking
            </button>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-1/4">Room / Room Type</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-center">Qty</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-center">Check-In</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-center">Check-Out</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-center">Nights</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-28 text-right">Price ({currencySymbol}/Night)</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-28 text-right">Total ({currencySymbol})</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      {/* Room Type */}
                      <td className="p-3">
                        <input
                          type="text"
                          required
                          value={item.roomType}
                          onChange={(e) => handleItemChange(index, 'roomType', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-800 placeholder-slate-400 text-sm focus:outline-none transition-all"
                          placeholder="e.g. AVG 4.5, Suite"
                        />
                      </td>

                      {/* Quantity */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          required
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-center text-slate-800 text-sm focus:outline-none transition-all"
                        />
                      </td>

                      {/* Check-In */}
                      <td className="p-3 text-center">
                        <input
                          type="date"
                          required
                          value={item.checkIn}
                          onChange={(e) => handleItemChange(index, 'checkIn', e.target.value)}
                          className="bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-slate-800 text-sm focus:outline-none transition-all"
                        />
                      </td>

                      {/* Check-Out */}
                      <td className="p-3 text-center">
                        <input
                          type="date"
                          required
                          value={item.checkOut}
                          onChange={(e) => handleItemChange(index, 'checkOut', e.target.value)}
                          className="bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-slate-800 text-sm focus:outline-none transition-all"
                        />
                      </td>

                      {/* Nights */}
                      <td className="p-3 text-center font-mono font-bold text-slate-700">
                        {item.nights}
                      </td>

                      {/* Price per night */}
                      <td className="p-3">
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={item.price || ''}
                          onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                          className="w-24 ml-auto bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-right text-slate-800 text-sm focus:outline-none transition-all"
                          placeholder="0.00"
                        />
                      </td>

                      {/* Total line item amount */}
                      <td className="p-3 text-right font-bold text-slate-800 text-sm pr-4 font-mono">
                        {currencySymbol}{(item.quantity * item.nights * item.price).toFixed(2)}
                      </td>

                      {/* Remove action */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          disabled={items.length === 1}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors p-1.5 rounded-lg hover:bg-red-50"
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
        </div>

        {/* 4. Totals, Paid Status and Banking Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4 border-t border-slate-100">
          
          {/* Notes & Status */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Booking Invoice Status
              </label>
              <div className="flex flex-wrap gap-2">
                {(['Paid', 'Due', 'Unpaid', 'Pending', 'Overdue'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                      status === s
                        ? s === 'Paid'
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                          : s === 'Due'
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : s === 'Unpaid'
                          ? 'bg-red-500 border-red-500 text-white shadow-sm'
                          : s === 'Pending'
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'bg-violet-500 border-violet-500 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Payment Information & Banking details
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none transition-all text-sm font-mono leading-relaxed"
                placeholder={defaultNotes}
              />
            </div>
          </div>

          {/* Pricing Totals Box */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
              Booking Receipt Totals
            </h4>

            {/* Total Gross Amount */}
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Total Gross Amount ({currencySymbol})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={subtotal || ''}
                onChange={(e) => setSubtotal(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-right text-xs focus:outline-none font-bold text-slate-800 font-mono"
                placeholder="0.00"
              />
            </div>

            {/* Payments List */}
            <div className="border-t border-slate-200/60 pt-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">Payments History</span>
                <button
                  type="button"
                  onClick={handleAddPayment}
                  className="text-xs font-extrabold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors border border-blue-100/50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Payment Row
                </button>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm relative">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Amount Paid ({currencySymbol})</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.amount || ''}
                        onChange={(e) => handlePaymentChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 font-mono focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Payment Date</label>
                      <input
                        type="date"
                        value={p.date}
                        onChange={(e) => handlePaymentChange(idx, 'date', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePayment(idx)}
                        className="mt-4 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100"
                        title="Remove Payment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total Paid Summary */}
            <div className="flex justify-between items-center text-sm text-slate-600 border-t border-slate-200/60 pt-3">
              <span className="font-bold text-slate-700">Total Amount Paid</span>
              <span className="font-extrabold text-emerald-600 font-mono text-base">{currencySymbol}{amountPaid.toFixed(2)}</span>
            </div>

            {/* Custom Blue Banner mimicking the screenshot's BALANCE segment */}
            <div className={`pt-3 border-t border-slate-200 flex justify-between items-center ${subtotal - amountPaid < 0 ? 'bg-emerald-600' : 'bg-blue-600'} text-white p-3 rounded-xl shadow-sm transition-colors duration-200`}>
              <span className="text-xs font-black italic tracking-widest">
                {subtotal - amountPaid < 0 ? 'CHANGE DUE' : 'BALANCE DUE'}
              </span>
              <span className="text-lg font-black font-mono">
                {subtotal - amountPaid < 0 
                  ? `-${currencySymbol}${Math.abs(subtotal - amountPaid).toFixed(2)}` 
                  : `${currencySymbol}${(subtotal - amountPaid).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Form Action Footer */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-xl text-sm font-black transition-all shadow-md shadow-blue-100"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Syncing with Google Sheets...' : invoice ? 'Update Booking' : 'Register Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
