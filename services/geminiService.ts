
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { InstagramPostData, Profile, GeneratedProfileData, ChatMessage } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PROMPT_TEMPLATE = `
Eres un experto estratega de contenidos y copywriter para Instagram. Tu misión es crear un post magnético que capture la atención, sea coherente con la identidad del perfil y genere interacción.

**Identidad Estrategica del Perfil (Regla Maestra):**
TODA la generación de contenido debe derivar y estar profundamente anclada en esta identidad. Es la base inmutable.
- **Nombre de Usuario (Handle):** "{instagram_handle}"
- **Descripción General:** "{profile_description}"
- **Objetivo Principal:** "{purpose}"
- **Audiencia Ideal (Buyer Persona):** "{audience}"
- **Propuesta de Valor Única (PVU):** "{value_proposition}"

**Tarea Específica del Post**
Ahora, para este post en particular, enfócate en el siguiente tema: "{user_theme}"

**Parámetros Creativos:**
- Estilo Visual: "{image_style}"
- Tono de Voz: "{tone_of_voice}"
- Llamada a la Acción (CTA): "{cta_type}"

**Instrucciones Detalladas:**

1.  **Instrucciones para la Imagen:** Crea un prompt detallado para un generador de imágenes de IA. La escena debe ser una manifestación visual del "Tema Específico del Post" ({user_theme}), pero interpretado a través del lente de la "Identidad Estratégica del Perfil". El estilo debe ser "{image_style}". Describe la composición, la atmósfera, los colores y la emoción que resonará con la "Audiencia Ideal".

2.  **Descripción de Instagram (Copy):** Redacta un copy (máximo 2200 caracteres) que siga estrictamente la siguiente estructura para maximizar el impacto:
    *   **Título de Gancho (Hook):** Empieza SIEMPRE con un título corto y potente que capte la atención de la "Audiencia Ideal". **Usa caracteres Unicode para simular negrita en este título.** Ejemplo: '𝗘𝗟 𝗦𝗘𝗖𝗥𝗘𝗧𝗢 𝗠𝗘𝗝𝗢𝗥 𝗚𝗨𝗔𝗥𝗗𝗔𝗗𝗢...'.
    *   **Cuerpo del Mensaje:** Desarrolla el tema conectándolo con la "Identidad Estratégica del Perfil". Usa MAYÚSCULAS de forma estratégica para enfatizar palabras clave y crear impacto visual. Adopta el "Tono de Voz" ({tone_of_voice}).
    *   **Llamada a la Acción (CTA) Final:** Termina con una CTA irresistible que se alinee con el "Objetivo Principal" ({purpose}) y el tipo de CTA ({cta_type}). Hazla clara, directa y motivadora.
    *   Usa emojis relevantes para la audiencia del perfil de forma natural en todo el texto.

3.  **Hashtags:** Genera entre 5 y 10 hashtags. Deben ser una mezcla estratégica: algunos relacionados con la "Identidad del Perfil" y otros más específicos al "Tema Específico del Post".
`;

export const generatePostDetails = async (theme: string, imageStyle: string, tone: string, cta: string, profile: Omit<Profile, 'id' | 'posts'>): Promise<InstagramPostData> => {
    let prompt = PROMPT_TEMPLATE.replace('{instagram_handle}', profile.instagramHandle);
    prompt = prompt.replace('{profile_description}', profile.description);
    prompt = prompt.replace('{purpose}', profile.purpose);
    prompt = prompt.replace('{audience}', profile.audience);
    prompt = prompt.replace('{value_proposition}', profile.valueProposition);
    prompt = prompt.replace('{user_theme}', theme);
    prompt = prompt.replace('{image_style}', imageStyle);
    prompt = prompt.replace('{tone_of_voice}', tone);
    prompt = prompt.replace('{cta_type}', cta);

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        descripcion: { type: Type.STRING },
                        hashtags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        instrucciones_imagen: { type: Type.STRING }
                    },
                    required: ["descripcion", "hashtags", "instrucciones_imagen"]
                },
                temperature: 0.9
            }
        });
        
        const jsonString = response.text;
        const parsedData = JSON.parse(jsonString);
        
        if (!parsedData.descripcion || !Array.isArray(parsedData.hashtags) || !parsedData.instrucciones_imagen) {
            throw new Error("La respuesta de la API no tiene el formato esperado.");
        }

        return parsedData as InstagramPostData;

    } catch (error: any) {
        console.error("Error al generar detalles del post:", error);
        throw new Error(`No se pudo generar el contenido del post con la IA. Detalles: ${error.message}`);
    }
};

export const generateImage = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        } else {
            throw new Error("La API no devolvió ninguna imagen.");
        }

    } catch (error: any) {
        console.error("Error al generar la imagen:", error);
        throw new Error(`No se pudo generar la imagen con la IA. Detalles: ${error.message}`);
    }
};

const IDEAS_PROMPT_TEMPLATE = `
Eres un experto estratega de contenidos para Instagram y un maestro del brainstorming. Tu misión es generar una lista de ideas de posts específicas y atractivas, basadas en un tema general, pero siempre alineadas con la identidad de un perfil.

**Identidad Estratégica del Perfil (Regla Maestra):**
Todas las ideas de posts deben ser relevantes y coherentes con esta identidad.
- **Nombre de Usuario (Handle):** "{instagram_handle}"
- **Descripción General:** "{profile_description}"
- **Objetivo Principal:** "{purpose}"
- **Audiencia Ideal (Buyer Persona):** "{audience}"
- **Propuesta de Valor Única (PVU):** "{value_proposition}"


**Tarea Específica:**
Genera exactamente {post_count} ideas de posts únicas basadas en el siguiente tema general: "{main_topic}".

**Instrucciones:**
- Cada idea debe ser un tema concreto y específico para un único post de Instagram, formulado como un título que genere CURIOSIDAD en la "Audiencia Ideal".
- No generes descripciones completas, solo el TEMA o TÍTULO del post.
- Las ideas deben ser variadas, cubriendo diferentes ángulos del tema general y alineadas con el "Objetivo Principal".
- Usa un lenguaje que incite a hacer clic y a querer saber más. Puedes usar MAYÚSCULAS estratégicamente para que las ideas sean más llamativas. Ejemplo: 'El ERROR #1 que tu "Audiencia Ideal" comete en...' en lugar de 'El error número uno que cometes en...'.
`;

export const generatePostIdeas = async (mainTopic: string, postCount: number, profile: Omit<Profile, 'id' | 'posts'>): Promise<string[]> => {
    let prompt = IDEAS_PROMPT_TEMPLATE.replace('{instagram_handle}', profile.instagramHandle);
    prompt = prompt.replace('{profile_description}', profile.description);
    prompt = prompt.replace('{purpose}', profile.purpose);
    prompt = prompt.replace('{audience}', profile.audience);
    prompt = prompt.replace('{value_proposition}', profile.valueProposition);
    prompt = prompt.replace('{main_topic}', mainTopic);
    prompt = prompt.replace('{post_count}', postCount.toString());

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        ideas: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["ideas"]
                },
            }
        });

        const jsonString = response.text;
        const parsedData = JSON.parse(jsonString);

        if (!parsedData.ideas || !Array.isArray(parsedData.ideas)) {
            throw new Error("API response is not in the expected format of an object with an 'ideas' array.");
        }
        
        return parsedData.ideas;

    } catch (error: any) {
        console.error("Error generating post ideas:", error);
        throw new Error(`No se pudieron generar las ideas para posts con la IA. Detalles: ${error.message}`);
    }
};

const PROFILE_GENERATION_PROMPT_TEMPLATE = `
Eres un experto estratega de branding y marketing digital, especializado en crear identidades de marca magnéticas para Instagram. Tu misión es transformar una idea de perfil en una identidad de marca completa y lista para usar.

**Tarea:**
Basado en la siguiente descripción proporcionada por el usuario, genera una identidad de perfil de Instagram completa.

**Descripción del Usuario:**
"{desired_profile}"

**Instrucciones Detalladas:**

1.  **Nombre del Perfil (name):** Crea un nombre de marca corto, memorable y relevante.
2.  **Instagram Handle (instagramHandle):** Genera un handle de Instagram único y atractivo, sin el símbolo '@'. Debe ser fácil de recordar y escribir.
3.  **Descripción del Perfil (description):** Escribe una biografía de Instagram concisa y potente (máximo 150 caracteres) que resuma de qué trata la cuenta.
4.  **Objetivo Principal (purpose):** Define el objetivo principal de la cuenta. Ejemplos: vender productos, construir una comunidad, educar, inspirar, generar leads.
5.  **Audiencia Ideal (audience):** Describe en 2-3 frases el buyer persona ideal para esta cuenta. Sé específico sobre sus intereses, demografía y necesidades.
6.  **Propuesta de Valor Única (valueProposition):** Explica qué hace que esta cuenta sea única y por qué la gente debería seguirla. ¿Qué valor distintivo ofrece?
7.  **Prompt para Imagen de Perfil (imagePrompt):** Crea un prompt detallado para un generador de imágenes de IA (como Imagen) para generar una foto de perfil/logo. El estilo debe ser visualmente atractivo y coherente con la marca. Piensa en un logo minimalista, una ilustración o un ícono que represente la esencia de la marca.
`;

export const generateProfileDetails = async (desiredProfile: string): Promise<GeneratedProfileData> => {
    const prompt = PROFILE_GENERATION_PROMPT_TEMPLATE.replace('{desired_profile}', desiredProfile);

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        instagramHandle: { type: Type.STRING },
                        description: { type: Type.STRING },
                        purpose: { type: Type.STRING },
                        audience: { type: Type.STRING },
                        valueProposition: { type: Type.STRING },
                        imagePrompt: { type: Type.STRING }
                    },
                    required: ["name", "instagramHandle", "description", "purpose", "audience", "valueProposition", "imagePrompt"]
                },
            }
        });

        const jsonString = response.text;
        return JSON.parse(jsonString) as GeneratedProfileData;

    } catch (error: any) {
        console.error("Error al generar los detalles del perfil:", error);
        throw new Error(`No se pudo generar la identidad del perfil con la IA. Detalles: ${error.message}`);
    }
};


export const getGroundedResponse = async (history: ChatMessage[], newMessage: string): Promise<{ text: string, grounding: any[] }> => {
    
    const contents = [...history, { role: 'user', parts: [{ text: newMessage }] }];

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        return { text: response.text, grounding };

    } catch (error: any) {
        console.error("Error al obtener respuesta del chat:", error);
        throw new Error(`No se pudo obtener la respuesta del asistente. Detalles: ${error.message}`);
    }
};