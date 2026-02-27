import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateThumbnailPrompt(userInput: string, base64Image?: string) {
  const parts: any[] = [
    {
      text: `Actúa como Flaquincito IA, un experto en miniaturas de YouTube. 
      El usuario dice: "${userInput}". 
      Tu tarea es:
      1. Crear un prompt detallado para generación de imágenes (en inglés) que resulte en una miniatura de YouTube de alto CTR.
      2. Dar un consejo rápido de "Psicología del Clic" sobre por qué este diseño funcionará.
      3. Sugerir un título optimizado para el video.
      ${base64Image ? "El usuario ha proporcionado una imagen de referencia. Úsala para inspirar el diseño." : ""}
      
      Responde estrictamente en formato JSON con las siguientes claves:
      - imagePrompt: string (el prompt en inglés)
      - clickAdvice: string (el consejo en español)
      - suggestedTitle: string (el título en español)`
    }
  ];

  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image.split(",")[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          imagePrompt: { type: Type.STRING },
          clickAdvice: { type: Type.STRING },
          suggestedTitle: { type: Type.STRING },
        },
        required: ["imagePrompt", "clickAdvice", "suggestedTitle"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateThumbnailImage(prompt: string, base64Image?: string) {
  const parts: any[] = [
    {
      text: `High-quality YouTube thumbnail, vibrant colors, professional lighting, 8k resolution, cinematic composition: ${prompt}`,
    }
  ];

  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image.split(",")[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}
