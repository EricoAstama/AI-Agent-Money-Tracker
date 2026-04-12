/**
 * Parse a free-text expense message into { item, amount }.
 *
 * Supported formats:
 *   "kopi susu 25k"       → { item: "kopi susu",  amount: 25000 }
 *   "nasi goreng 15rebu"  → { item: "nasi goreng", amount: 15000 }
 *   "bensin 50000"        → { item: "bensin",      amount: 50000 }
 *   "25k kopi susu"       → { item: "kopi susu",  amount: 25000 }
 *   "50.000 makan siang"  → { item: "makan siang", amount: 50000 }
 *   "2.5k kopi"           → { item: "kopi",        amount: 2500  }
 *   "1,5jt sewa"          → { item: "sewa",        amount: 1500000 }
 *
 * Returns null if no valid amount is found.
 */
function parseExpense(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim();
  if (!cleaned) return null;

  // Regex: capture a number (with optional dots/commas as thousand/decimal separators)
  // followed by optional multiplier suffix
  const amountRegex = /(\d[\d.,]*)\s*(k|rb|rebu|ribu|jt|juta)?/i;

  const match = cleaned.match(amountRegex);
  if (!match) return null;

  // Parse the numeric part
  let numStr = match[1];

  // Determine if dots/commas are decimal or thousand separators
  // Logic: if the pattern is like "50.000" or "50,000" → thousand separator
  //        if the pattern is like "2.5" or "1,5" → decimal
  const hasDot = numStr.includes('.');
  const hasComma = numStr.includes(',');

  if (hasDot && !hasComma) {
    // Check if it's a thousand separator (e.g., "50.000") or decimal (e.g., "2.5")
    const parts = numStr.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      // Thousand separator: "50.000" → 50000
      numStr = numStr.replace(/\./g, '');
    } else {
      // Decimal: "2.5" → 2.5
      // keep as-is, parseFloat handles it
    }
  } else if (hasComma && !hasDot) {
    // Comma as decimal separator: "1,5" → "1.5"
    // Or thousand separator: "50,000" → "50000"
    const parts = numStr.split(',');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      numStr = numStr.replace(/,/g, '');
    } else {
      numStr = numStr.replace(',', '.');
    }
  } else if (hasDot && hasComma) {
    // Mixed: "1.500,50" → remove dots, replace comma with dot
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  }

  let amount = parseFloat(numStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Apply multiplier suffix
  const suffix = (match[2] || '').toLowerCase();
  if (['k', 'rb', 'rebu', 'ribu'].includes(suffix)) {
    amount *= 1000;
  } else if (['jt', 'juta'].includes(suffix)) {
    amount *= 1000000;
  }

  // Extract the item name (everything that's NOT the amount part)
  const amountPart = match[0];
  const item = cleaned
    .replace(amountPart, '')  // Remove the matched amount
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();

  if (!item) return null;

  return { item, amount };
}

module.exports = { parseExpense };
