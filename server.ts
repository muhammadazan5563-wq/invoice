import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Supabase client using server-side keys
const supabaseUrl = process.env.SUPABASE_URL || "https://jybjzbtgpnhkdyofayji.supabase.co";
const supabaseKey = process.env.SUPABASE_SECRET_KEY || "sb_secret_UIkjVs1M3xJP2EgPXqRjdw_zC88aiJg";

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

// GET /api/invoices - Retrieve all invoices from Supabase
app.get("/api/invoices", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Map database snake_case fields to camelCase for the frontend React components
    const invoices = (data || []).map((row) => ({
      rowIndex: 0, // Not strictly needed for database row access, but kept for TS interface compatibility
      id: row.id,
      date: row.date,
      customerName: row.customer_name,
      customerEmail: row.customer_email || "",
      hotelName: row.hotel_name || "",
      totalAmount: Number(row.total_amount || 0),
      amountPaid: Number(row.amount_paid || 0),
      paymentDate: row.payment_date || "",
      balance: Number(row.balance || 0),
      status: row.status || "Pending",
      notes: row.notes || "",
      items: row.items || [],
      payments: row.payments || []
    }));

    res.json(invoices);
  } catch (error: any) {
    console.error("Error in GET /api/invoices:", error);
    res.status(500).json({ error: error.message || "Failed to fetch invoices" });
  }
});

// POST /api/invoices - Create a new invoice in Supabase
app.post("/api/invoices", async (req, res) => {
  try {
    const inv = req.body;
    if (!inv.id || !inv.date || !inv.customerName) {
      return res.status(400).json({ error: "Missing required invoice fields (id, date, customerName)" });
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        id: inv.id,
        date: inv.date,
        customer_name: inv.customerName,
        customer_email: inv.customerEmail || "",
        hotel_name: inv.hotelName || "",
        total_amount: Number(inv.totalAmount || 0),
        amount_paid: Number(inv.amountPaid || 0),
        payment_date: inv.paymentDate || "",
        balance: Number(inv.balance || 0),
        status: inv.status || "Pending",
        notes: inv.notes || "",
        items: inv.items || [],
        payments: inv.payments || []
      })
      .select();

    if (error) {
      throw error;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error in POST /api/invoices:", error);
    res.status(500).json({ error: error.message || "Failed to create invoice" });
  }
});

// PUT /api/invoices/:id - Update an existing invoice in Supabase
app.put("/api/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const inv = req.body;

    const { data, error } = await supabase
      .from("invoices")
      .update({
        date: inv.date,
        customer_name: inv.customerName,
        customer_email: inv.customerEmail || "",
        hotel_name: inv.hotelName || "",
        total_amount: Number(inv.totalAmount || 0),
        amount_paid: Number(inv.amountPaid || 0),
        payment_date: inv.paymentDate || "",
        balance: Number(inv.balance || 0),
        status: inv.status || "Pending",
        notes: inv.notes || "",
        items: inv.items || [],
        payments: inv.payments || []
      })
      .eq("id", id)
      .select();

    if (error) {
      throw error;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error in PUT /api/invoices:", error);
    res.status(500).json({ error: error.message || "Failed to update invoice" });
  }
});

// DELETE /api/invoices/:id - Remove or archive invoice from Supabase
app.delete("/api/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/invoices:", error);
    res.status(500).json({ error: error.message || "Failed to delete invoice" });
  }
});

// Vite Middleware & SPA serving configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
