import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PROMPT = `You are a sports data extraction AI.
Look at the provided cricket scorecard screenshots. Extract the player's overall batting and bowling statistics and output them strictly as a valid JSON object matching the schema below.
If a value is not found in the images, omit the key or return null. Use numbers for all stats, except bestBowling which is a string (e.g. "4/12").
Do NOT wrap the output in markdown code blocks like \`\`\`json. Return only the raw JSON.

{
  "matches": number,
  "innings": number, // total innings across batting/bowling
  "runs": number, // batting runs
  "highestScore": number,
  "notOuts": number,
  "battingAverage": number,
  "battingStrikeRate": number,
  "halfCenturies": number,
  "centuries": number,
  "fours": number,
  "sixes": number,
  "battingDotBalls": number,
  "ducks": number,

  "oversBowled": number,
  "maidens": number,
  "wickets": number,
  "runsConceded": number,
  "bestBowling": string, // e.g. "4/12"
  "economy": number,
  "bowlingStrikeRate": number,
  "bowlingAverage": number,
  "wides": number,
  "noBalls": number,
  "dotBalls": number, // bowling dot balls
  "foursConceded": number,
  "sixesConceded": number
}`;

export async function extractStatsFromImages(imageUrls) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing in backend environment variables.');
  }

  // Fetch images and convert to base64 parts
  const parts = [];
  for (const url of imageUrls) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      parts.push({
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'image/jpeg', // assuming jpegs
        },
      });
    } catch (e) {
      console.error('Failed to fetch image:', url, e);
    }
  }

  if (parts.length === 0) {
    throw new Error('Failed to load any valid images for extraction.');
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [...parts, { text: PROMPT }]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    let rawText = response.text || '{}';
    return JSON.parse(rawText);
  } catch (error) {
    console.error('Gemini extraction error:', error);
    throw new Error('Failed to extract stats using AI.');
  }
}
