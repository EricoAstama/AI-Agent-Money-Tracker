const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Ask Groq (Llama 3) to classify `item` into one of the user's categories.
 * Returns the matched category name (string) or null if API fails/unsure.
 */
async function classifyCategory(item, categories) {
  const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const prompt = `You are a personal finance categorization assistant for Indonesian users. Categorize the expense item into EXACTLY one of the numbered categories below.

Categories:
${categoryList}

Guidelines:
- "Pangan": Food for meals, staple groceries (rice, oil), daily eating needs.
- "Jajan": Snacks, coffee/drinks for pleasure, dessert, non-essential eating.
- "Transportasi": Fuel/gasoline, ride-hailing, parking, vehicle maintenance/service, bus/train tickets.
- "Kebutuhan & Tech": App subscriptions, phone credit/data, electronics, toiletries (soap, shampoo, skincare).
- "Sosial & Keluarga": Gifts, donations, family allowance, wedding contributions.
- "Lain-lain": Only if the item truly doesn't fit any other category.

Expense item: "${item}"

Respond with ONLY the category name, exactly as written in the list above. No extra words, no punctuation, no explanation. If unsure, respond with: UNKNOWN`;

  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
    });

    const rawResponse = response.choices[0]?.message?.content?.trim();
    console.log(`🤖 Groq prediction: "${rawResponse}"`);

    if (!rawResponse || rawResponse === 'UNKNOWN') return null;

    // Handle if model returned a number index ("1", "2", etc.)
    const numericMatch = rawResponse.match(/^(\d+)\.?$/);
    if (numericMatch) {
      const idx = parseInt(numericMatch[1]) - 1;
      return categories[idx] || null;
    }

    // Exact match first (most reliable)
    const exactMatch = categories.find(c => c === rawResponse);
    if (exactMatch) return exactMatch;

    // Case-insensitive match as fallback
    const cleaned = rawResponse.replace(/[*"'`._]/g, '').trim();
    const caseInsensitiveMatch = categories.find(
      c => c.toLowerCase() === cleaned.toLowerCase()
    );
    if (caseInsensitiveMatch) return caseInsensitiveMatch;

    // Partial match: check if the response contains the category name
    const partialMatch = categories.find(
      c => cleaned.toLowerCase().includes(c.toLowerCase().split('&')[0].trim())
    );
    if (partialMatch) return partialMatch;

    console.log(`⚠️ Groq returned unrecognized category: "${rawResponse}"`);
    return null;
  } catch (error) {
    console.error('❌ Groq API error:', error.message);
    return null;
  }
}

module.exports = { classifyCategory };
