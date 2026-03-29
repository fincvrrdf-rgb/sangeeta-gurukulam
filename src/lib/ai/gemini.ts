/**
 * lib/ai/gemini.ts
 *
 * Google Gemini API wrapper for vision/multimodal tasks. SERVER-ONLY.
 * Uses Gemini 2.5 Flash model.
 *
 * Used for: payment proof image extraction (reading payer name, amount,
 * date, transaction ID from screenshots/PDFs).
 *
 * Environment variable required: GEMINI_API_KEY
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';

export interface GeminiTextPart {
  text: string;
}

export interface GeminiImagePart {
  inline_data: {
    mime_type: string;
    data: string; // base64
  };
}

export type GeminiPart = GeminiTextPart | GeminiImagePart;

/**
 * Call Gemini with text and/or image content.
 * Returns the text content of the response.
 *
 * @throws Error if GEMINI_API_KEY is not configured or the API call fails.
 */
export async function callGemini(
  parts: GeminiPart[],
  systemInstruction?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.startsWith('REPLACE_')) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Set it in .env.local. ' +
      'Get a key from https://aistudio.google.com/apikey'
    );
  }

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('Gemini API returned empty content');
  }

  return content;
}

/**
 * Extract payment information from an image (screenshot/photo).
 * Returns a structured JSON string with extracted fields.
 *
 * IMPORTANT: This extraction is ALWAYS a draft. It must be reviewed
 * by a teacher/admin before being accepted. See docs/BUSINESS_RULES.md §6.
 */
export async function extractPaymentProof(
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const systemPrompt = `You are extracting payment information from an uploaded payment proof image or screenshot.
Extract ONLY the following fields if visible. Return JSON only, no markdown:
{
  "payerName": "string or null",
  "amount": "number in smallest currency unit (paise) or null",
  "date": "YYYY-MM-DD string or null",
  "transactionId": "string or null",
  "bankContext": "string description of bank/UPI app visible or null",
  "confidence": "number 0-1 indicating overall extraction confidence"
}

Rules:
- If a field is not clearly visible, set it to null.
- Do NOT guess or fabricate information.
- The confidence score should reflect how clearly readable the source is.
- Do NOT store full account numbers — only last 4 digits if visible.
- This is assistive extraction. A human will review and confirm.`;

  return callGemini(
    [
      { text: 'Extract payment details from this image:' },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    systemPrompt
  );
}
