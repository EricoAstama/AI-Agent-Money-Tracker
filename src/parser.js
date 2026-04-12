/**
 * Core utility to convert currency strings (e.g., "1.5jt", "25k", "2.000.000") to Numbers.
 */
function parseAmount(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim().toLowerCase();
  
  // Regex: capture a number (with optional dots/commas) followed by optional suffix
  const amountRegex = /(\d[\d.,]*)\s*(miliar|juta|ribu|rebu|rebo|rb|jt|m|k)?/i;
  const match = cleaned.match(amountRegex);
  
  if (!match) return null;

  let numStr = match[1];
  const hasDot = numStr.includes('.');
  const hasComma = numStr.includes(',');

  // Normalize separators
  if (hasDot && !hasComma) {
    const parts = numStr.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      numStr = numStr.replace(/\./g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = numStr.split(',');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      numStr = numStr.replace(/,/g, '');
    } else {
      numStr = numStr.replace(',', '.');
    }
  } else if (hasDot && hasComma) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  }

  let amount = parseFloat(numStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Apply multiplier
  const suffix = (match[2] || '').toLowerCase();
  if (['k', 'rb', 'rebu', 'ribu', 'rebo'].includes(suffix)) {
    amount *= 1000;
  } else if (['jt', 'juta'].includes(suffix)) {
    amount *= 1000000;
  } else if (['m', 'miliar'].includes(suffix)) {
    amount *= 1000000000;
  }

  return amount;
}

/**
 * Parse a free-text expense message into { item, amount }.
 */
function parseExpense(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim();
  if (!cleaned) return null;

  const amount = parseAmount(cleaned);
  if (!amount) return null;

  // To find the original "amount string" for removal, we need to find what parseAmount matched
  const amountRegex = /(\d[\d.,]*)\s*(miliar|juta|ribu|rebu|rebo|rb|jt|m|k)?/i;
  const match = cleaned.match(amountRegex);
  const amountPart = match[0];

  const item = cleaned
    .replace(amountPart, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!item) return null;
  return { item, amount };
}

module.exports = { parseExpense, parseAmount };
