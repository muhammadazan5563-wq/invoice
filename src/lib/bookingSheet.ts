import { extractSpreadsheetId } from './sheets';

interface BookingItem {
  checkIn: string;
  checkOut: string;
  nights: number;
  quantity: number;
  roomType: string;
}

// Format date as M/D/YYYY for Google Sheets
function formatDateForSheet(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

/**
 * Sync room booking details to Google Sheets.
 * When an invoice is created or edited, this function:
 * 1. Reads existing data to find the next auto-increment ID
 * 2. Removes any existing rows for the same invoice (REF #)
 * 3. Appends new rows with the booking details
 * 
 * Sheet headers (row 1): CHECK IN | CHECK OUT | TOTAL NIGHTS | ID | Group NAME | REF # | ROOMS | ROOM TYPE
 */
export async function syncBookingToSheet(
  invoiceId: string,
  customerName: string,
  items: BookingItem[],
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<{ success: boolean; rowsAdded: number; startId: number }> {
  const cleanSpreadsheetId = extractSpreadsheetId(spreadsheetId);
  const encodedSheetName = encodeURIComponent(sheetName);

  // Step 1: Read existing data to determine the next ID in the series
  const readResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/'${encodedSheetName}'!A:H`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  let nextId = 1;
  if (readResponse.ok) {
    const readData = await readResponse.json();
    const existingRows = readData.values || [];
    // Find the highest ID in column D (index 3) - skip header row
    for (let i = 1; i < existingRows.length; i++) {
      const row = existingRows[i];
      if (row && row[3]) {
        const idNum = parseInt(row[3], 10);
        if (!isNaN(idNum) && idNum >= nextId) {
          nextId = idNum + 1;
        }
      }
    }
  }

  // Step 2: Delete any existing rows for this invoice (REF # column F, index 5)
  const fullReadResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/'${encodedSheetName}'!A:H`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (fullReadResponse.ok) {
    const fullData = await fullReadResponse.json();
    const allRows = fullData.values || [];

    // Get sheet ID for batch update (delete rows)
    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (sheetMetaResponse.ok) {
      const sheetMeta = await sheetMetaResponse.json();
      const targetSheet = sheetMeta.sheets?.find((s: any) => s.properties?.title === sheetName);
      const sheetId = targetSheet?.properties?.sheetId || 0;

      // Find row indices where REF # (column F, index 5) matches invoiceId
      const rowsToDelete: number[] = [];
      for (let i = 1; i < allRows.length; i++) {
        if (allRows[i] && allRows[i][5] === invoiceId) {
          rowsToDelete.push(i); // 0-indexed row (header is 0)
        }
      }

      // Delete rows in reverse order to maintain correct indices
      if (rowsToDelete.length > 0) {
        const deleteRequests = rowsToDelete
          .sort((a, b) => b - a) // Sort descending
          .map((rowIdx) => ({
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: rowIdx,
                endIndex: rowIdx + 1,
              },
            },
          }));

        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ requests: deleteRequests }),
          }
        );

        // After deleting, re-read to get the correct next ID
        const reReadResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/'${encodedSheetName}'!A:H`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        if (reReadResponse.ok) {
          const reReadData = await reReadResponse.json();
          const remainingRows = reReadData.values || [];
          nextId = 1;
          for (let i = 1; i < remainingRows.length; i++) {
            const row = remainingRows[i];
            if (row && row[3]) {
              const idNum = parseInt(row[3], 10);
              if (!isNaN(idNum) && idNum >= nextId) {
                nextId = idNum + 1;
              }
            }
          }
        }
      }
    }
  }

  // Step 3: Build new rows from invoice items
  // Headers: CHECK IN | CHECK OUT | TOTAL NIGHTS | ID | Group NAME | REF # | ROOMS | ROOM TYPE
  const newRows: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    newRows.push([
      formatDateForSheet(item.checkIn),   // CHECK IN
      formatDateForSheet(item.checkOut),  // CHECK OUT
      String(item.nights || 1),           // TOTAL NIGHTS
      String(nextId + i),                 // ID (auto-increment series)
      customerName,                       // Group NAME
      invoiceId,                          // REF #
      String(item.quantity || 1),         // ROOMS
      item.roomType || "",                // ROOM TYPE
    ]);
  }

  // Step 4: Append the new rows to the sheet
  if (newRows.length > 0) {
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/'${encodedSheetName}'!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: newRows,
        }),
      }
    );

    if (!appendResponse.ok) {
      const errorData = await appendResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "Failed to append booking rows to Google Sheets");
    }
  }

  return { success: true, rowsAdded: newRows.length, startId: nextId };
}
