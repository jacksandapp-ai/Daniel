import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  generatePostDetails,
  generateImage,
  generatePostIdeas,
  generateProfileDetails,
  getGroundedResponse,
} from './services/geminiService';
import type { Profile, Post, InstagramPostData, GeneratedProfileData, ChatMessage } from './types';
import { Loader, Sparkles, Plus, Copy, Check, Download, Instagram, Send, BotIcon, MicrophoneIcon, MicOffIcon } from './components/icons';
// FIX: Remove non-exported 'LiveSession' and alias 'Blob' to avoid name conflicts with browser's Blob.
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GeminiBlob } from '@google/genai';

// --- Helper Functions ---
const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
};

// --- Audio Helper Functions for Live API ---
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// FIX: Use the aliased 'GeminiBlob' type for the @google/genai Blob interface.
function createBlob(data: Float32Array): GeminiBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

// FIX: Define the missing Card component used for UI layout.
const Card = ({ children }: { children: React.ReactNode }) => <div className="card">{children}</div>;

// --- Main App Component ---
const App: React.FC = () => {
    const [activeView, setActiveView] = useState<'generator' | 'assistant' | 'live'>('generator');

    // --- Render Logic ---
    return (
        <>
            <style>{`
                :root { --primary-color: #4A90E2; --secondary-color: #50E3C2; --text-color: #333; --bg-color: #f7f9fc; --card-bg: #fff; --border-color: #e0e0e0; }
                body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; background-color: var(--bg-color); color: var(--text-color); }
                .container { max-width: 1400px; margin: 0 auto; padding: 1rem 2rem; }
                .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;}
                .header h1 { color: var(--primary-color); display: flex; align-items: center; gap: 0.5rem; margin: 0; }
                .nav { display: flex; gap: 0.5rem; }
                .nav-button { background-color: #fff; color: var(--primary-color); border: 1px solid var(--primary-color); padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.5rem; }
                .nav-button.active, .nav-button:hover { background-color: var(--primary-color); color: white; }
                .grid { display: grid; grid-template-columns: 300px 1fr; gap: 2rem; margin-top: 2rem;}
                .sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
                .main-content { display: flex; flex-direction: column; gap: 1.5rem; }
                .card { background: var(--card-bg); border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 1.5rem; }
                .card h2 { margin-top: 0; display: flex; align-items: center; gap: 0.5rem;}
                .error { color: #D8000C; background-color: #FFD2D2; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; }
                button { background-color: var(--primary-color); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;}
                button:hover { background-color: #357ABD; }
                button:disabled { background-color: #a0c3e8; cursor: not-allowed; }
                .loader { animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .form-group { margin-bottom: 1rem; }
                .form-group label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
                .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 1rem; box-sizing: border-box; }
            `}</style>
            <div className="container">
                <header className="header">
                    <h1><Instagram /> Instagenius AI</h1>
                    <nav className="nav">
                        <button onClick={() => setActiveView('generator')} className={`nav-button ${activeView === 'generator' ? 'active' : ''}`}><Plus /> Generador</button>
                        <button onClick={() => setActiveView('assistant')} className={`nav-button ${activeView === 'assistant' ? 'active' : ''}`}><BotIcon /> Asistente</button>
                        <button onClick={() => setActiveView('live')} className={`nav-button ${activeView === 'live' ? 'active' : ''}`}><MicrophoneIcon /> Conversación</button>
                    </nav>
                </header>

                {activeView === 'generator' && <PostGenerator />}
                {activeView === 'assistant' && <AiAssistant />}
                {activeView === 'live' && <LiveConversation />}
            </div>
        </>
    );
};

const PostGenerator = () => {
    // --- State Management ---
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
    
    // UI/Loading States
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
    const [loadingState, setLoadingState] = useState({ active: false, message: '' });
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

    // Generated Content
    const [generatedIdeas, setGeneratedIdeas] = useState<string[]>([]);
    const [generatedPost, setGeneratedPost] = useState<(InstagramPostData & { imageUrl: string; inputTheme: string }) | null>(null);

    // Form Inputs
    const [profileDescription, setProfileDescription] = useState('');
    const [ideasTopic, setIdeasTopic] = useState('');
    const [postTheme, setPostTheme] = useState('');
    const [imageStyle, setImageStyle] = useState('');
    const [toneOfVoice, setToneOfVoice] = useState('');
    const [cta, setCta] = useState('');
    
    // Google Drive States
    const [authStatus, setAuthStatus] = useState({ isAuthenticated: false, isFolderSet: false, folderId: null });
    const [driveFolderUrl, setDriveFolderUrl] = useState('');

    // --- Memoized Derived State ---
    const selectedProfile = useMemo(() => 
        profiles.find(p => p.id === selectedProfileId) || null,
        [profiles, selectedProfileId]
    );

    // --- Effects ---
    useEffect(() => {
        try {
            const storedProfiles = localStorage.getItem('profiles');
            if (storedProfiles) {
                const parsedProfiles: Profile[] = JSON.parse(storedProfiles);
                setProfiles(parsedProfiles);
                if (parsedProfiles.length > 0) {
                    setSelectedProfileId(parsedProfiles[0].id);
                }
            }
        } catch (e) { console.error("Failed to load profiles", e); }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('profiles', JSON.stringify(profiles));
        } catch (e) { console.error("Failed to save profiles", e); }
    }, [profiles]);
    
    useEffect(() => {
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    console.error('Auth Status Error:', data.error, data.details);
                    setError(`Error de Configuración del Backend: ${data.error} ${data.details || ''}`);
                    setAuthStatus({ isAuthenticated: false, isFolderSet: false, folderId: null });
                } else {
                    setAuthStatus(data);
                }
            })
            .catch(err => {
                console.error("Network error:", err);
                setError("No se pudo conectar con el servidor del backend. ¿Está en funcionamiento?");
            });
    }, []);

    useEffect(() => {
        if (selectedProfile) {
            setImageStyle(selectedProfile.baseImageStyle);
            setToneOfVoice(selectedProfile.baseToneOfVoice);
            setCta(selectedProfile.baseCTA);
        }
    }, [selectedProfile]);


    // --- Event Handlers ---
    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => setCopiedStates(prev => ({ ...prev, [id]: false })), 2000);
    };

    const handleProfileGeneration = async () => {
        if (!profileDescription) {
            setError("Please describe the profile you want to create.");
            return;
        }
        setIsLoadingProfile(true);
        setError(null);
        try {
            const profileData: GeneratedProfileData = await generateProfileDetails(profileDescription);
            const imageUrl = await generateImage(profileData.imagePrompt);
            const newProfile: Profile = {
                id: Date.now(),
                name: profileData.name,
                instagramHandle: profileData.instagramHandle,
                description: profileData.description,
                purpose: profileData.purpose,
                audience: profileData.audience,
                valueProposition: profileData.valueProposition,
                baseImageStyle: 'Photorealistic, cinematic lighting',
                baseToneOfVoice: 'Inspirational and direct',
                baseCTA: 'Comment your thoughts below!',
                posts: [],
                profilePictureUrl: imageUrl
            };
            setProfiles(prev => [...prev, newProfile]);
            setSelectedProfileId(newProfile.id);
            setProfileDescription('');
        } catch (e: any) {
            setError(e.message || "Failed to generate profile.");
        } finally {
            setIsLoadingProfile(false);
        }
    };
    
    const handleGenerateIdeas = async () => {
        if (!ideasTopic || !selectedProfile) return;
        setIsLoadingIdeas(true);
        setError(null);
        setGeneratedIdeas([]);
        try {
            const ideas = await generatePostIdeas(ideasTopic, 5, selectedProfile);
            setGeneratedIdeas(ideas);
        } catch (e: any) {
            setError(e.message || "Failed to generate ideas.");
        } finally {
            setIsLoadingIdeas(false);
        }
    };

    const handleGeneratePost = async () => {
        if (!postTheme || !selectedProfile) {
            setError("Please provide a theme for the post.");
            return;
        }
        setLoadingState({ active: true, message: 'Writing compelling copy...' });
        setError(null);
        setGeneratedPost(null);

        try {
            const details = await generatePostDetails(postTheme, imageStyle, toneOfVoice, cta, selectedProfile);
            setGeneratedPost({ ...details, imageUrl: '', inputTheme: postTheme });
            
            setLoadingState({ active: true, message: 'Creating a stunning visual...' });
            const imageUrl = await generateImage(details.instrucciones_imagen);

            setGeneratedPost(prev => prev ? { ...prev, imageUrl } : null);

        } catch (e: any) {
            setError(e.message || "Failed to generate post.");
        } finally {
           setLoadingState({ active: false, message: '' });
        }
    };
    
    const handleSetDriveFolder = async () => {
        if (!driveFolderUrl) return;
        try {
            const res = await fetch('/api/drive/set-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderUrl: driveFolderUrl }),
            });
            if (!res.ok) throw new Error('Failed to set folder.');
            const data = await res.json();
            setAuthStatus(prev => ({ ...prev, isFolderSet: true, folderId: data.folderId }));
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    const handleUploadToDrive = async () => {
        if (!generatedPost || !generatedPost.imageUrl) return;
        setIsUploading(true);
        setError(null);
        try {
            const base64Data = generatedPost.imageUrl.split(',')[1];
            const imageBlob = base64ToBlob(base64Data, 'image/jpeg');
            const textContent = `${generatedPost.descripcion}\n\nHashtags:\n${generatedPost.hashtags.join(' ')}`;
            const textBlob = new Blob([textContent], { type: 'text/plain' });

            const formData = new FormData();
            formData.append('image', imageBlob, `${generatedPost.inputTheme.replace(/\s/g, '_')}.jpg`);
            formData.append('text', textBlob, `${generatedPost.inputTheme.replace(/\s/g, '_')}.txt`);
            formData.append('postTheme', generatedPost.inputTheme);

            const response = await fetch('/api/drive/upload-post', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to upload to drive.');
            }
            alert('Post uploaded successfully to Google Drive!');
            setGeneratedPost(null);

        } catch(e: any) {
            setError(e.message);
        } finally {
            setIsUploading(false);
        }
    };
    
    return (
        <>
        <style>{`
            .profile-list button { display: block; width: 100%; text-align: left; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: #fff; cursor: pointer; margin-bottom: 0.5rem; transition: all 0.2s ease; }
            .profile-list button.selected { border-color: var(--primary-color); background-color: #e9f2fe; font-weight: bold; }
            .profile-list button:hover:not(.selected) { border-color: #ccc; }
            .profile-list .profile-item { display: flex; align-items: center; gap: 10px; }
            .profile-list .profile-item img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
            .profile-list .profile-item div { display: flex; flex-direction: column; }
            .profile-list .profile-item span:first-child { font-weight: 600; }
            .profile-list .profile-item span:last-child { font-size: 0.8rem; color: #666; }
            .generated-ideas ul { list-style: none; padding: 0; }
            .generated-ideas li { background: #f0f8ff; padding: 0.75rem; border-radius: 4px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
            .generated-post-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; }
            .generated-image-container { position: relative; aspect-ratio: 1/1; }
            .generated-image-container img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
            .image-loader { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; border-radius: 8px; }
            .copy-button { background: none; border: none; cursor: pointer; color: #555; padding: 0.25rem; }
            .post-description { white-space: pre-wrap; background: #fafafa; padding: 1rem; border-radius: 6px; max-height: 400px; overflow-y: auto; }
            .hashtags span { display: inline-block; background-color: #e0eafc; color: #3b5998; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.9rem; margin: 0.25rem; }
            .actions { display: flex; gap: 1rem; margin-top: 1rem; }
            .drive-auth a { color: var(--primary-color); }
        `}</style>
        {error && <div className="error">{error}</div>}
        <div className="grid">
            <aside className="sidebar">
                <Card>
                    <h2>Profiles</h2>
                    <div className="profile-list">
                        {profiles.map(p => (
                            <button key={p.id} onClick={() => setSelectedProfileId(p.id)} className={p.id === selectedProfileId ? 'selected' : ''}>
                                <div className="profile-item">
                                    <img src={p.profilePictureUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${p.name}`} alt={p.name} />
                                    <div><span>{p.name}</span><span>@{p.instagramHandle}</span></div>
                                </div>
                            </button>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h2><Sparkles /> New Profile</h2>
                    <div className="form-group">
                        <label htmlFor="profile-desc">Describe your desired profile:</label>
                        <textarea id="profile-desc" rows={4} value={profileDescription} onChange={e => setProfileDescription(e.target.value)} placeholder="e.g., A personal finance coach for millennials..."></textarea>
                    </div>
                    <button onClick={handleProfileGeneration} disabled={isLoadingProfile}>
                        {isLoadingProfile && <Loader className="loader" />}
                        Generate Profile
                    </button>
                </Card>
                    <Card>
                    <h2>Google Drive</h2>
                    {!authStatus.isAuthenticated ? (
                        <div className="drive-auth"><p>Connect Google Drive to save posts.</p><a href="/api/auth/google">Authenticate with Google</a></div>
                    ) : !authStatus.isFolderSet ? (
                        <div>
                            <p>Authenticated! Set a folder to save posts.</p>
                            <div className="form-group">
                                <label htmlFor="folder-url">Drive Folder URL</label>
                                <input type="text" id="folder-url" value={driveFolderUrl} onChange={e => setDriveFolderUrl(e.target.value)} placeholder="Paste Google Drive folder URL" />
                            </div>
                            <button onClick={handleSetDriveFolder}>Set Folder</button>
                        </div>
                    ) : ( <p>✅ Connected to Google Drive.</p> )}
                </Card>
            </aside>

            <main className="main-content">
                {!selectedProfile ? (
                    <Card><h2>Welcome to Instagenius!</h2><p>Create or select a profile to get started.</p></Card>
                ) : (
                    <>
                        <Card>
                            <h2><Sparkles /> Generate Post Ideas</h2>
                            <div className="form-group">
                                <label htmlFor="ideas-topic">Main Topic:</label>
                                <input id="ideas-topic" type="text" value={ideasTopic} onChange={e => setIdeasTopic(e.target.value)} placeholder="e.g., 'Tips for saving money'" />
                            </div>
                            <button onClick={handleGenerateIdeas} disabled={isLoadingIdeas}>
                                {isLoadingIdeas && <Loader className="loader" />}
                                Generate Ideas
                            </button>
                            {generatedIdeas.length > 0 && (
                                <div className="generated-ideas"><h3>Generated Ideas:</h3><ul>{generatedIdeas.map((idea, i) => <li key={i}>{idea}</li>)}</ul></div>
                            )}
                        </Card>
                        
                        <Card>
                            <h2><Plus/> Create New Post</h2>
                            <div className="form-group"><label htmlFor="post-theme">Post Theme:</label><input id="post-theme" type="text" value={postTheme} onChange={e => setPostTheme(e.target.value)} placeholder="e.g., 'The 50/30/20 budget rule'" /></div>
                            <div className="form-group"><label htmlFor="image-style">Image Style:</label><input id="image-style" type="text" value={imageStyle} onChange={e => setImageStyle(e.target.value)} /></div>
                            <div className="form-group"><label htmlFor="tone-voice">Tone of Voice:</label><input id="tone-voice" type="text" value={toneOfVoice} onChange={e => setToneOfVoice(e.target.value)} /></div>
                            <div className="form-group"><label htmlFor="cta">Call to Action:</label><input id="cta" type="text" value={cta} onChange={e => setCta(e.target.value)} /></div>
                            <button onClick={handleGeneratePost} disabled={loadingState.active}>
                                {loadingState.active && <Loader className="loader" />}
                                {loadingState.active ? loadingState.message : 'Generate Post'}
                            </button>
                        </Card>
                        
                        { generatedPost && (
                            <Card>
                                <h2>Generated Post</h2>
                                <div className="generated-post-grid">
                                    <div>
                                        <h3>Image</h3>
                                        <div className="generated-image-container">
                                            {generatedPost.imageUrl ? <img src={generatedPost.imageUrl} alt={generatedPost.inputTheme} /> : (
                                                <div className="image-loader"><Loader className="loader" /><p>Creating a stunning visual...</p></div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h3>Copy & Hashtags</h3>
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h4>Description</h4><button className="copy-button" onClick={() => handleCopy(generatedPost.descripcion, 'desc')}>{copiedStates['desc'] ? <Check /> : <Copy />}</button>
                                                </div>
                                                <p className="post-description">{generatedPost.descripcion}</p>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                                                    <h4>Hashtags</h4><button className="copy-button" onClick={() => handleCopy(generatedPost.hashtags.join(' '), 'tags')}>{copiedStates['tags'] ? <Check /> : <Copy />}</button>
                                                </div>
                                                <div className="hashtags">{generatedPost.hashtags.map(h => <span key={h}>{h}</span>)}</div>
                                                <div className="actions">
                                                    <button onClick={() => window.open(generatedPost.imageUrl, '_blank')} disabled={!generatedPost.imageUrl}><Download /> Download Image</button>
                                                    <button onClick={handleUploadToDrive} disabled={!generatedPost.imageUrl || isUploading || !authStatus.isFolderSet}>
                                                        {isUploading && <Loader className="loader" />}<Send /> Save to Drive
                                                    </button>
                                                </div>
                                            </>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </>
                )}
            </main>
        </div>
        </>
    )
};

const AiAssistant = () => {
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatContainerRef.current?.scrollTo(0, chatContainerRef.current.scrollHeight);
    }, [history]);

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;
        
        const newUserMessage: ChatMessage = { role: 'user', parts: [{ text: userInput }] };
        setHistory(prev => [...prev, newUserMessage]);
        setUserInput('');
        setIsLoading(true);

        try {
            const response = await getGroundedResponse(history, userInput);
            const newModelMessage: ChatMessage = { 
                role: 'model', 
                parts: [{ text: response.text }],
                grounding: response.grounding
            };
            setHistory(prev => [...prev, newModelMessage]);
        } catch (error) {
            console.error(error);
            const errorMessage: ChatMessage = { role: 'model', parts: [{ text: "Sorry, I couldn't get a response. Please try again." }] };
            setHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <style>{`
            .chat-container { display: flex; flex-direction: column; height: 75vh; }
            .chat-history { flex-grow: 1; overflow-y: auto; padding: 1rem; background: #f0f4f8; border-radius: 8px; }
            .chat-message { margin-bottom: 1rem; display: flex; }
            .chat-message.user { justify-content: flex-end; }
            .message-bubble { max-width: 80%; padding: 0.75rem 1rem; border-radius: 18px; line-height: 1.5; }
            .message-bubble.user { background-color: var(--primary-color); color: white; border-bottom-right-radius: 4px; }
            .message-bubble.model { background-color: white; color: var(--text-color); border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
            .chat-input-area { display: flex; padding-top: 1rem; }
            .chat-input-area input { flex-grow: 1; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px 0 0 6px; font-size: 1rem; }
            .chat-input-area button { border-radius: 0 6px 6px 0; }
            .grounding-sources { margin-top: 0.5rem; font-size: 0.8rem; }
            .grounding-sources a { color: #555; text-decoration: none; margin-right: 1rem; }
            .grounding-sources a:hover { text-decoration: underline; }
            `}</style>
            <div className="chat-container">
                <div className="chat-history" ref={chatContainerRef}>
                    {history.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.role}`}>
                            <div className={`message-bubble ${msg.role}`}>
                                {msg.parts[0].text}
                                {msg.role === 'model' && msg.grounding && msg.grounding.length > 0 && (
                                    <div className="grounding-sources">
                                        <strong>Fuentes:</strong>
                                        {msg.grounding.map((chunk, i) => chunk.web && (
                                            <a key={i} href={chunk.web.uri} target="_blank" rel="noopener noreferrer">{chunk.web.title}</a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && <div className="chat-message model"><div className="message-bubble model">...</div></div>}
                </div>
                <div className="chat-input-area">
                    <input 
                        type="text" 
                        value={userInput} 
                        onChange={e => setUserInput(e.target.value)} 
                        onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask me anything with up-to-date information..."
                        disabled={isLoading}
                    />
                    <button onClick={handleSendMessage} disabled={isLoading}>
                        {isLoading ? <Loader className="loader" /> : <Send />}
                    </button>
                </div>
            </div>
        </>
    );
};

const LiveConversation = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcripts, setTranscripts] = useState<Array<{type: 'user' | 'model' | 'info', text: string}>>([]);
    
    // FIX: Replace non-exported 'LiveSession' type with 'any'.
    const sessionPromise = useRef<Promise<any> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startConversation = async () => {
        setIsRecording(true);
        setTranscripts([{type: 'info', text: 'Connecting...'}]);

        try {
            if (!process.env.API_KEY) throw new Error("API Key not found");
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            let nextStartTime = 0;
            const sources = new Set<AudioBufferSourceNode>();

            sessionPromise.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setTranscripts(prev => [...prev, {type: 'info', text: 'Connection open. Start talking!'}]);
                        mediaStreamSourceRef.current = audioContextRef.current!.createMediaStreamSource(stream);
                        scriptProcessorRef.current = audioContextRef.current!.createScriptProcessor(4096, 1, 1);

                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(audioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                             setTranscripts(prev => {
                                const last = prev[prev.length -1];
                                if (last?.type === 'user') {
                                    const updated = [...prev];
                                    updated[prev.length - 1] = {type: 'user', text: last.text + text};
                                    return updated;
                                }
                                return [...prev, {type: 'user', text: text}];
                             });
                        }
                         if (message.serverContent?.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            setTranscripts(prev => {
                                const last = prev[prev.length -1];
                                if (last?.type === 'model') {
                                    const updated = [...prev];
                                    updated[prev.length - 1] = {type: 'model', text: last.text + text};
                                    return updated;
                                }
                                return [...prev, {type: 'model', text: text}];
                             });
                        }
                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData) {
                            nextStartTime = Math.max(nextStartTime, outputAudioContextRef.current!.currentTime);
                            const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current!, 24000, 1);
                            const source = outputAudioContextRef.current!.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current!.destination);
                            source.addEventListener('ended', () => { sources.delete(source); });
                            source.start(nextStartTime);
                            nextStartTime += audioBuffer.duration;
                            sources.add(source);
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Live session error:', e);
                        setTranscripts(prev => [...prev, {type: 'info', text: `Error: ${e.message}`}]);
                        stopConversation();
                    },
                    onclose: () => {
                        setTranscripts(prev => [...prev, {type: 'info', text: 'Connection closed.'}]);
                    },
                },
            });
        } catch (err: any) {
            console.error(err);
            setTranscripts([{type: 'info', text: `Failed to start: ${err.message}`}]);
            setIsRecording(false);
        }
    };
    
    const stopConversation = () => {
        setIsRecording(false);
        
        sessionPromise.current?.then(session => session.close());
        sessionPromise.current = null;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if(mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
         if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
    };

    useEffect(() => {
        // Cleanup on component unmount
        return () => {
            if (isRecording) {
                stopConversation();
            }
        };
    }, [isRecording]);

    return (
        <>
        <style>{`
            .live-container { display: flex; flex-direction: column; height: 75vh; }
            .live-transcript { flex-grow: 1; overflow-y: auto; padding: 1rem; background: #f0f4f8; border-radius: 8px; font-size: 1.1rem; line-height: 1.6; }
            .live-transcript p { margin: 0 0 1rem 0; }
            .live-transcript .user { color: var(--primary-color); font-weight: 600; }
            .live-transcript .model { color: var(--text-color); }
            .live-transcript .info { color: #666; font-style: italic; text-align: center; }
            .live-controls { padding-top: 1rem; text-align: center; }
            .record-button { width: 80px; height: 80px; border-radius: 50%; font-size: 1.5rem; background-color: #dc3545; }
            .record-button.recording { background-color: #28a745; animation: pulse 1.5s infinite; }
            @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(40, 167, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); } }
        `}</style>
         <div className="live-container">
            <div className="live-transcript">
                {transcripts.map((t, i) => (
                    <p key={i} className={t.type}>
                        {t.type === 'user' && 'You: '}
                        {t.type === 'model' && 'Gemini: '}
                        {t.text}
                    </p>
                ))}
            </div>
            <div className="live-controls">
                <button 
                    onClick={isRecording ? stopConversation : startConversation}
                    className={`record-button ${isRecording ? 'recording' : ''}`}
                >
                    {isRecording ? <MicOffIcon /> : <MicrophoneIcon />}
                </button>
            </div>
         </div>
        </>
    )
}


export default App;