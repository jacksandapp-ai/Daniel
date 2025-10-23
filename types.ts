
export interface InstagramPostData {
    descripcion: string;
    hashtags: string[];
    instrucciones_imagen: string;
}

export interface GeneratedProfileData {
    name: string;
    instagramHandle: string;
    description: string;
    purpose: string;
    audience: string;
    valueProposition: string;
    imagePrompt: string;
}

export interface KPIs {
    alcance: number;
    likes: number;
    comentarios: number;
    guardados: number;
    compartidos: number;
}

export interface Post {
    id: number;
    imageUrl: string;
    // Entradas del generador
    inputTheme: string;
    inputImageStyle: string;
    inputTone: string;
    inputCTA: string;
    // Salidas generadas
    generatedDescription: string;
    generatedHashtags: string[];
    generatedImagePrompt: string;
    // Métricas de rendimiento
    kpis: KPIs;
}

export interface Profile {
    id: number;
    name: string;
    instagramHandle: string;
    profilePictureUrl?: string;
    description: string;
    baseImageStyle: string;
    baseToneOfVoice: string;
    baseCTA: string;
    posts: Post[];
    // Campos estratégicos
    purpose: string;
    audience: string;
    valueProposition: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
    grounding?: any[];
}
