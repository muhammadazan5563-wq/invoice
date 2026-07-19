import { Invoice } from '../types';

// Fetch all invoices from the Express proxy endpoint (which queries Supabase)
export async function getInvoices(): Promise<Invoice[]> {
  const response = await fetch('/api/invoices');
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch invoices (Status: ${response.status})`);
  }
  return response.json();
}

// Add a new invoice
export async function createInvoice(invoice: Omit<Invoice, 'rowIndex' | 'rawRow'>): Promise<void> {
  const response = await fetch('/api/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invoice),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save new invoice');
  }
}

// Update an existing invoice
export async function updateInvoice(id: string, invoice: Omit<Invoice, 'rowIndex' | 'rawRow'>): Promise<void> {
  const response = await fetch(`/api/invoices/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invoice),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to update invoice');
  }
}

// Delete an invoice
export async function deleteInvoice(id: string): Promise<void> {
  const response = await fetch(`/api/invoices/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete invoice');
  }
}
