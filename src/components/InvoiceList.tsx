import React, { useState, useEffect } from 'react';
import { Invoice } from '../types';
import { InvoiceTemplate, getCurrencySymbol } from '../lib/settings';
import { Search, Eye, Edit2, CheckCircle, Trash2, Printer, FileText, Mail, Calendar, User, Phone, MapPin, X, Plus } from 'lucide-react';

interface InvoiceListProps {
  invoices: Invoice[];
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => Promise<void>;
  onMarkAsPaid: (invoice: Invoice) => Promise<void>;
  template?: InvoiceTemplate | null;
}

export default function InvoiceList({ invoices, onEdit, onDelete, onMarkAsPaid, template }: InvoiceListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Get currency symbol from template settings
  const currencySymbol = getCurrencySymbol(template?.currency || 'USD');

  // Reset visible count when search or filter changes
  useEffect(() => {
    setVisibleCount(50);
  }, [search, statusFilter]);

  // Filter invoices based on search terms and selected status
  const filteredInvoices = invoices.filter((inv) => {
    if (inv.status === ('Archived' as any)) return false;

    const matchesSearch = 
      inv.id.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerEmail.toLowerCase().includes(search.toLowerCase());
      
    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusStyle = (status: Invoice['status']) => {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Due':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Unpaid':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Overdue':
        return 'bg-violet-50 text-violet-700 border-violet-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById("invoice-receipt-body")?.cloneNode(true) as HTMLElement;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${template?.companyName || 'FAIZ GROUP'} - Invoice #${selectedInvoice?.id}</title>
            <meta charset="utf-8">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap');
              
              body {
                font-family: 'Inter', sans-serif;
                background-color: white !important;
                color: #1e293b !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                padding: 40px;
              }
              .font-display {
                font-family: 'Space Grotesk', sans-serif !important;
              }
              .font-mono {
                font-family: 'JetBrains Mono', monospace !important;
              }
              @media print {
                body {
                  padding: 20px 0;
                }
                .bg-blue-600 {
                  background-color: #2563eb !important;
                }
                .bg-slate-50 {
                  background-color: #f8fafc !important;
                }
                .text-white {
                  color: #ffffff !important;
                }
                .text-blue-100 {
                  color: #dbeafe !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="max-w-4xl mx-auto">
              ${printContent.innerHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 400);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  return (
    <div className="space-y-6" id="invoice-list-section">
      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by invoice no, customer name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:outline-none transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {['All', 'Paid', 'Due', 'Unpaid', 'Pending', 'Overdue'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: List on Left, Active Preview on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Table/List View */}
        <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${selectedInvoice ? 'xl:col-span-1' : 'xl:col-span-3'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <th className="py-4 px-5">Invoice No</th>
                  <th className="py-4 px-5">Customer / Guest</th>
                  <th className="py-4 px-5">Date</th>
                  <th className="py-4 px-5 text-right">Total ({currencySymbol})</th>
                  <th className="py-4 px-5 text-right">Paid ({currencySymbol})</th>
                  <th className="py-4 px-5 text-right">Balance ({currencySymbol})</th>
                  <th className="py-4 px-5 text-center">Status</th>
                  <th className="py-4 px-5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      No booking invoices found matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.slice(0, visibleCount).map((inv, index) => (
                    <tr 
                      key={`${inv.id}-${inv.rowIndex || index}`} 
                      className={`hover:bg-slate-50/70 transition-colors ${selectedInvoice?.id === inv.id ? 'bg-blue-50/20' : ''}`}
                    >
                      {/* Invoice ID */}
                      <td className="py-4 px-5">
                        <button 
                          onClick={() => setSelectedInvoice(inv)}
                          className="font-bold text-blue-600 hover:text-blue-800 text-sm focus:outline-none flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          #{inv.id}
                        </button>
                      </td>

                      {/* Customer Info */}
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-800 text-sm">{inv.customerName}</div>
                        {inv.customerEmail && (
                          <div className="text-xs text-slate-400 mt-0.5">{inv.customerEmail}</div>
                        )}
                        {inv.hotelName && (
                          <div className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold w-max mt-1 uppercase tracking-wide">
                            {inv.hotelName}
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-4 px-5 text-sm text-slate-600">
                        {inv.date}
                      </td>

                      {/* Total */}
                      <td className="py-4 px-5 text-right font-bold text-slate-800 text-sm">
                        {currencySymbol}{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Paid */}
                      <td className="py-4 px-5 text-right text-emerald-600 font-medium text-sm">
                        {currencySymbol}{inv.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Balance */}
                      <td className={`py-4 px-5 text-right font-bold text-sm ${
                        inv.balance === 0 ? 'text-emerald-600' : inv.balance < 0 ? 'text-blue-600' : 'text-blue-600'
                      }`}>
                        {inv.balance < 0
                          ? `-${currencySymbol}${Math.abs(inv.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${currencySymbol}${inv.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusStyle(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5">
                        <div className="flex items-center justify-center gap-1">
                          {/* Quick Eye */}
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            title="View Invoice"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Quick Edit */}
                          <button
                            onClick={() => onEdit(inv)}
                            title="Edit Invoice"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Quick Mark Paid */}
                          {inv.status !== 'Paid' && (
                            <button
                              onClick={() => onMarkAsPaid(inv)}
                              title="Mark as Paid"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Quick Delete */}
                          <button
                            onClick={() => onDelete(inv)}
                            title="Delete Invoice"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Showing Count and Load More Button */}
          <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
            <span className="text-xs font-semibold text-slate-500">
              Showing {Math.min(visibleCount, filteredInvoices.length)} of {filteredInvoices.length} invoices
            </span>
            {filteredInvoices.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((prev) => prev + 50)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm hover:shadow text-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Load More Invoices ({filteredInvoices.length - visibleCount} left)
              </button>
            )}
          </div>
        </div>

        {/* Floating / Slide-out Detailed Booking Invoice Preview (Matches the screenshot exactly!) */}
        {selectedInvoice && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden flex flex-col xl:col-span-2 h-full animate-fade-in print:fixed print:inset-0 print:bg-white print:z-50 print:p-0" id="invoice-detail-preview">
            {/* Detail Header (Controls) */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm">Invoice Receipt #{selectedInvoice.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Receipt
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* The Invoice Preview Body (Styled to look exactly like the spreadsheet / FAIZ GROUP screenshot) */}
            <div id="invoice-receipt-body" className="p-8 overflow-y-auto flex-1 space-y-8 print:overflow-visible print:p-0 bg-white">
              
              {/* Branding Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-6">
                <div>
                  {/* Blue Logo Block Accent */}
                  <div className="flex items-center gap-3">
                    {template?.companyLogo ? (
                      <img src={template.companyLogo} alt="Logo" className="w-12 h-10 object-contain rounded-sm" />
                    ) : (
                      <div className="w-12 h-10 bg-blue-600 rounded-sm flex items-center justify-center text-white font-black text-xl tracking-tighter">
                        {(template?.companyName || 'FG').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h1 className="text-3xl font-black italic tracking-wide text-slate-900 uppercase font-display">
                        {template?.companyName || 'FAIZ GROUP'}
                      </h1>
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
                        Luxury Hotel & Suites
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stylish Wireframe Sphere SVG representing the exact visual pattern on the top-right */}
                <div className="w-20 h-20 text-slate-400 opacity-80 select-none">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1,1" />
                    <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    {/* Intersecting lines */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      const angle = (i * 30 * Math.PI) / 180;
                      const x1 = 50 + 45 * Math.cos(angle);
                      const y1 = 50 + 45 * Math.sin(angle);
                      const x2 = 50 - 45 * Math.cos(angle);
                      const y2 = 50 - 45 * Math.sin(angle);
                      return (
                        <line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="currentColor"
                          strokeWidth="0.3"
                        />
                      );
                    })}
                    {/* Inner web lines */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      const angle1 = (i * 30 * Math.PI) / 180;
                      const angle2 = (((i + 2) % 12) * 30 * Math.PI) / 180;
                      return (
                        <polygon
                          key={i}
                          points={`50,50 ${50 + 45 * Math.cos(angle1)},${50 + 45 * Math.sin(angle1)} ${50 + 45 * Math.cos(angle2)},${50 + 45 * Math.sin(angle2)}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.25"
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Guest & Invoice Metadata Block */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Guest Information:</div>
                  <div className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-1 text-slate-800 uppercase font-display">
                    NAME: {selectedInvoice.customerName}
                  </div>
                  {selectedInvoice.customerEmail && (
                    <div className="text-sm text-slate-500 font-medium">
                      Email: {selectedInvoice.customerEmail}
                    </div>
                  )}
                  {selectedInvoice.hotelName && (
                    <div className="text-sm text-slate-600 font-bold flex items-center gap-1 mt-0.5">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hotel:</span> {selectedInvoice.hotelName}
                    </div>
                  )}
                </div>

                {/* Blue Block representing the "Invoice No / Date" container */}
                <div className="bg-blue-600 text-white rounded-lg overflow-hidden shadow-sm flex min-w-[240px]">
                  <div className="bg-blue-700/50 p-3 flex-1 border-r border-blue-500/30 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100 opacity-90">Invoice No:</div>
                    <div className="text-lg font-black tracking-wider mt-0.5">{selectedInvoice.id}</div>
                  </div>
                  <div className="p-3 flex-1 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100 opacity-90">Date:</div>
                    <div className="text-sm font-bold mt-1">{selectedInvoice.date}</div>
                  </div>
                </div>
              </div>

              {/* Main Booking Items Table (Formatted exactly like the spreadsheet) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider">
                      <th className="py-3 px-4 border-r border-slate-200">Room</th>
                      <th className="py-3 px-4 text-center border-r border-slate-200 w-24">Quantity</th>
                      <th className="py-3 px-4 text-center border-r border-slate-200">Check-In</th>
                      <th className="py-3 px-4 text-center border-r border-slate-200">Check-Out</th>
                      <th className="py-3 px-4 text-center border-r border-slate-200 w-20">Nights</th>
                      <th className="py-3 px-4 text-right border-r border-slate-200 w-28">Price</th>
                      <th className="py-3 px-4 text-right w-36">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800 text-sm">
                    {selectedInvoice.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                          No booking items added to this invoice.
                        </td>
                      </tr>
                    ) : (
                      selectedInvoice.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-800 border-r border-slate-200">{item.roomType || 'Standard Room'}</td>
                          <td className="py-3 px-4 text-center border-r border-slate-200 font-medium">{item.quantity}</td>
                          <td className="py-3 px-4 text-center border-r border-slate-200 font-mono text-xs">{item.checkIn || '-'}</td>
                          <td className="py-3 px-4 text-center border-r border-slate-200 font-mono text-xs">{item.checkOut || '-'}</td>
                          <td className="py-3 px-4 text-center border-r border-slate-200 font-medium">{item.nights}</td>
                          <td className="py-3 px-4 text-right border-r border-slate-200 font-mono">
                            {currencySymbol}{item.price.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                            {currencySymbol}{item.total.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                    {/* Fill blank rows for a authentic spreadsheet feeling if list is short */}
                    {selectedInvoice.items.length < 4 && 
                      Array.from({ length: 4 - selectedInvoice.items.length }).map((_, i) => (
                        <tr key={`empty-${i}`} className="h-9">
                          <td className="py-2 px-4 border-r border-slate-200"></td>
                          <td className="py-2 px-4 border-r border-slate-200"></td>
                          <td className="py-2 px-4 border-r border-slate-200"></td>
                          <td className="py-2 px-4 border-r border-slate-200"></td>
                          <td className="py-2 px-4 border-r border-slate-200 text-center text-xs text-slate-300 font-mono">0</td>
                          <td className="py-2 px-4 border-r border-slate-200"></td>
                          <td className="py-2 px-4 text-right text-xs text-slate-300 font-mono">{currencySymbol}0.00</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {/* Subtotals & Payment Info Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                
                {/* Left Column: Terms, Bank Details, Contact */}
                <div className="space-y-6">
                  {/* Terms & Conditions */}
                  <div className="text-xs text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-slate-700 block mb-1">Terms & Conditions:</span>
                    <p className="leading-relaxed font-medium whitespace-pre-line">
                      {template?.termsAndConditions || 'Any delay in payment will be subjected to a late payment fee. Thank you for your residency.'}
                    </p>
                  </div>

                  {/* Payment Info */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1.5">
                    <span className="font-bold uppercase tracking-wider text-slate-800 block mb-1">Payment Information:</span>
                    <p className="font-semibold text-slate-700 whitespace-pre-line">
                      {template?.paymentDetails || 'Beneficiaire Bank of America\nSwift Sort\nAccount No.: 324 6654 7766 9992'}
                    </p>
                  </div>
                </div>

                {/* Right Column: Pricing & Balance Box */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm font-semibold text-slate-600">
                    <span>Total Amount:</span>
                    <span className="text-xl font-extrabold text-slate-900 font-mono">
                      {currencySymbol}{selectedInvoice.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm text-slate-600 border-t border-slate-100 pt-3">
                    <span className="font-medium">Amount Paid:</span>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-600 font-mono">
                        {currencySymbol}{selectedInvoice.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">Date: {selectedInvoice.paymentDate || selectedInvoice.date}</div>
                    </div>
                  </div>

                  {/* Solid Balance Banner */}
                  <div className={`${
                    selectedInvoice.balance === 0 ? 'bg-emerald-600 shadow-emerald-100' : selectedInvoice.balance < 0 ? 'bg-blue-600 shadow-blue-100' : 'bg-blue-600 shadow-blue-100'
                  } text-white p-3.5 rounded-lg flex justify-between items-center font-display shadow-md transition-colors duration-200`}>
                    <span className="font-black italic tracking-wider uppercase text-sm">
                      {selectedInvoice.balance < 0 ? 'CHANGE DUE' : selectedInvoice.balance === 0 ? 'PAID IN FULL' : 'BALANCE'}
                    </span>
                    <span className="text-xl font-black tracking-widest font-mono">
                      {selectedInvoice.balance < 0
                        ? `-${currencySymbol}${Math.abs(selectedInvoice.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : `${currencySymbol}${selectedInvoice.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                </div>

              </div>

              {/* Contact Footer matching phone, mail, address from the screenshot */}
              <div className="border-t border-slate-100 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 pb-2">
                <div className="flex items-center gap-2 font-medium">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <span>Phone: 123-456-7890</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span>Mail: Albert@invoicefly.com</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span>Address: 123 Anywhere St., Any City</span>
                </div>
              </div>

            </div>

            {/* Quick action triggers at bottom of sheet preview */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2 print:hidden justify-end">
              {selectedInvoice.status !== 'Paid' && (
                <button
                  onClick={() => {
                    onMarkAsPaid(selectedInvoice);
                    setSelectedInvoice({ 
                      ...selectedInvoice, 
                      status: 'Paid',
                      amountPaid: selectedInvoice.totalAmount,
                      balance: 0
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Mark Full Paid
                </button>
              )}
              <button
                onClick={() => onEdit(selectedInvoice)}
                className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Edit Invoice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
