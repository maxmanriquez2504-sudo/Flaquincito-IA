import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Zap, 
  CheckCircle2,
  TrendingUp, 
  Download,
  Share2,
  AlertCircle,
  Loader2,
  History,
  LogOut,
  Mail,
  ArrowRight,
  Clock,
  Upload,
  X,
  LayoutDashboard,
  Edit3,
  Settings,
  Palette,
  Box
} from 'lucide-react';
import { generateThumbnailPrompt, generateThumbnailImage } from './services/gemini';

// Types
interface GenerationResult {
  id?: number;
  image_prompt?: string; // from DB
  imagePrompt?: string; // from API
  click_advice?: string; // from DB
  clickAdvice?: string; // from API
  suggested_title?: string; // from DB
  suggestedTitle?: string; // from API
  image_url?: string; // from DB
  imageUrl?: string; // from API
  transcript?: string;
  created_at?: string;
}

export default function App() {
  const [description, setDescription] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('flaquincito_email'));
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('free');
  const [emailInput, setEmailInput] = useState('');
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'lab' | 'history' | 'editor'>('lab');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Editor State
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [rotationX, setRotationX] = useState(0);
  const [rotationY, setRotationY] = useState(0);
  const [perspective, setPerspective] = useState(1000);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check for Stripe redirect
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const sessionId = urlParams.get('session_id');

    if (status === 'success' && userEmail) {
      // In a real app, the webhook handles this, but for the demo we'll update here
      updateSubscription('premium');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [userEmail]);

  const updateSubscription = async (status: string) => {
    try {
      await fetch('/api/update-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, status })
      });
      setSubscriptionStatus(status);
    } catch (err) {
      console.error("Failed to update subscription", err);
    }
  };

  useEffect(() => {
    if (userEmail) {
      fetchHistory();
      fetchUserData();
    }
  }, [userEmail]);

  const fetchUserData = async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      const data = await res.json();
      if (data.user) {
        setSubscriptionStatus(data.user.subscription_status);
      }
    } catch (err) {
      console.error("Failed to fetch user data", err);
    }
  };

  const fetchHistory = async () => {
    if (!userEmail) return;
    try {
      const res = await fetch(`/api/thumbnails/${userEmail}`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('flaquincito_email', emailInput);
        setUserEmail(emailInput);
        if (data.user) {
          setSubscriptionStatus(data.user.subscription_status);
        }
      }
    } catch (err) {
      setError("Error al registrar correo.");
    }
  };

  const handleSubscribe = async (plan: 'basic_mxn' | 'standard' | 'premium') => {
    setIsProcessingPayment(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          priceId: plan,
          planName: plan === 'basic_mxn' ? 'Básico MXN' : (plan === 'standard' ? 'Estándar' : 'Premium')
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Error al iniciar el pago.");
      }
    } catch (err) {
      setError("Error de conexión con el servidor de pagos.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('flaquincito_email');
    setUserEmail(null);
    setResult(null);
    setHistory([]);
    setSubscriptionStatus('free');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!description && !uploadedImage) {
      setError("Por favor, escribe una descripción o sube una imagen.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const promptData = await generateThumbnailPrompt(description, uploadedImage || undefined);
      setResult(promptData);
      
      const imageUrl = await generateThumbnailImage(promptData.imagePrompt, uploadedImage || undefined);
      const finalResult = { ...promptData, imageUrl, transcript: description };
      setResult(finalResult);

      // Save to DB
      if (userEmail) {
        await fetch('/api/thumbnails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            transcript: description,
            imagePrompt: promptData.imagePrompt,
            imageUrl: imageUrl,
            clickAdvice: promptData.clickAdvice,
            suggestedTitle: promptData.suggestedTitle
          })
        });
        fetchHistory();
      }
    } catch (err) {
      console.error(err);
      setError('¡Ups! Algo salió mal en el laboratorio de Flaquincito. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-neutral-900 p-8 rounded-3xl border border-white/10 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="bg-red-600 p-2 rounded-xl">
              <Zap className="w-8 h-8 fill-white" />
            </div>
            <span className="text-3xl font-black tracking-tighter font-display uppercase">
              Flaquincito <span className="text-red-600">IA</span>
            </span>
          </div>
          
          <h2 className="text-2xl font-bold text-center mb-2">Bienvenido, Creador</h2>
          <p className="text-neutral-400 text-center mb-8">Registra tu correo para guardar tus miniaturas y acceder a funciones exclusivas.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input 
                type="email" 
                placeholder="tu@correo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-red-600 transition-colors"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all group"
            >
              Comenzar ahora
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          
          <p className="mt-8 text-xs text-neutral-600 text-center">
            Al registrarte, aceptas que Flaquincito IA use tus datos para mejorar tu experiencia de creador.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-red-500 selection:text-white flex">
      {/* Sidebar */}
      <aside className="w-20 md:w-64 border-r border-white/10 flex flex-col bg-neutral-950 sticky top-0 h-screen z-50">
        <div className="p-6 flex items-center gap-2 mb-8">
          <div className="bg-red-600 p-1.5 rounded-lg shrink-0">
            <Zap className="w-6 h-6 fill-white" />
          </div>
          <span className="text-xl font-black tracking-tighter font-display uppercase hidden md:block">
            Flaquincito <span className="text-red-600">IA</span>
          </span>
        </div>

        <nav className="flex-grow px-4 space-y-2">
          <button 
            onClick={() => setActiveTab('lab')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'lab' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-white/5'}`}
          >
            <LayoutDashboard className="w-6 h-6 shrink-0" />
            <span className="font-bold hidden md:block">Laboratorio</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'editor' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-white/5'}`}
          >
            <Edit3 className="w-6 h-6 shrink-0" />
            <span className="font-bold hidden md:block">Editor 3D</span>
          </button>

          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-white/5'}`}
          >
            <History className="w-6 h-6 shrink-0" />
            <span className="font-bold hidden md:block">Historial</span>
          </button>
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <div className="hidden md:block px-2 mb-2">
            <p className="text-[10px] uppercase tracking-widest text-neutral-600 font-black">Usuario</p>
            <p className="text-sm font-bold truncate text-neutral-400">{userEmail.split('@')[0]}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-neutral-500 hover:bg-red-600/10 hover:text-red-500 transition-all"
          >
            <LogOut className="w-6 h-6 shrink-0" />
            <span className="font-bold hidden md:block">Salir</span>
          </button>
        </div>
      </aside>

      <div className="flex-grow flex flex-col">
        {/* Top Bar (Mobile Only Logo) */}
        <div className="md:hidden border-b border-white/10 p-4 flex justify-between items-center bg-neutral-950/50 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="bg-red-600 p-1.5 rounded-lg">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <span className="text-lg font-black tracking-tighter font-display uppercase">
              Flaquincito <span className="text-red-600">IA</span>
            </span>
          </div>
        </div>

        <main className="max-w-6xl mx-auto px-6 py-12 w-full">
          {activeTab === 'history' ? (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-4xl font-black uppercase font-display tracking-tight">Tu Historial Viral</h2>
                <button 
                  onClick={() => setActiveTab('lab')}
                  className="text-red-500 font-bold hover:underline"
                >
                  Volver al laboratorio
                </button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-24 bg-neutral-900 rounded-3xl border border-dashed border-white/10">
                  <Clock className="w-16 h-16 mx-auto mb-4 text-neutral-700" />
                  <p className="text-neutral-500">Aún no has creado miniaturas. ¡Empieza ahora!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map((item) => (
                    <motion.div 
                      key={item.id}
                      whileHover={{ y: -5 }}
                      className="bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 group"
                    >
                      <div className="aspect-video relative">
                        <img src={item.image_url} alt={item.suggested_title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button 
                            onClick={() => {
                              setResult({
                                imagePrompt: item.image_prompt,
                                clickAdvice: item.click_advice,
                                suggestedTitle: item.suggested_title,
                                imageUrl: item.image_url,
                                transcript: item.transcript
                              });
                              setActiveTab('lab');
                            }}
                            className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm"
                          >
                            Ver Detalles
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <h4 className="font-bold truncate mb-1">{item.suggested_title}</h4>
                        <p className="text-xs text-neutral-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.created_at!).toLocaleDateString()}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'editor' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-4xl font-black uppercase font-display tracking-tight">Editor de Imagen 3D</h2>
                <p className="text-neutral-500 hidden md:block">Personaliza tus miniaturas al máximo.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-xl space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                        <Palette className="w-4 h-4" /> Color y Tono
                      </h3>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Tono (Hue)</span>
                          <span>{hue}°</span>
                        </div>
                        <input type="range" min="0" max="360" value={hue} onChange={(e) => setHue(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Saturación</span>
                          <span>{saturation}%</span>
                        </div>
                        <input type="range" min="0" max="200" value={saturation} onChange={(e) => setSaturation(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Brillo</span>
                          <span>{brightness}%</span>
                        </div>
                        <input type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-white/5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                        <Box className="w-4 h-4" /> Efecto 3D
                      </h3>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Rotación X</span>
                          <span>{rotationX}°</span>
                        </div>
                        <input type="range" min="-45" max="45" value={rotationX} onChange={(e) => setRotationX(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Rotación Y</span>
                          <span>{rotationY}°</span>
                        </div>
                        <input type="range" min="-45" max="45" value={rotationY} onChange={(e) => setRotationY(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-500">
                          <span>Perspectiva</span>
                          <span>{perspective}px</span>
                        </div>
                        <input type="range" min="500" max="2000" value={perspective} onChange={(e) => setPerspective(parseInt(e.target.value))} className="w-full accent-red-600" />
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        setHue(0);
                        setSaturation(100);
                        setBrightness(100);
                        setRotationX(0);
                        setRotationY(0);
                        setPerspective(1000);
                      }}
                      className="w-full py-3 rounded-xl border border-white/10 text-xs font-bold hover:bg-white/5 transition-all"
                    >
                      Restablecer Todo
                    </button>
                  </div>
                </div>

                {/* Canvas */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-neutral-900 p-8 rounded-3xl border border-white/10 shadow-xl flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
                    {editorImage ? (
                      <div 
                        style={{ 
                          perspective: `${perspective}px`,
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'center'
                        }}
                      >
                        <motion.div
                          style={{
                            rotateX: rotationX,
                            rotateY: rotationY,
                            filter: `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`,
                            boxShadow: '0 50px 100px rgba(0,0,0,0.5)'
                          }}
                          className="aspect-video w-full max-w-2xl rounded-xl overflow-hidden border-4 border-white/10 transition-all duration-300 ease-out"
                        >
                          <img src={editorImage} alt="Editor" className="w-full h-full object-cover" />
                        </motion.div>
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto">
                          <ImageIcon className="w-10 h-10 text-neutral-600" />
                        </div>
                        <p className="text-neutral-500 font-bold">No hay imagen cargada</p>
                        <button 
                          onClick={() => editorFileInputRef.current?.click()}
                          className="px-6 py-3 bg-red-600 rounded-xl font-bold hover:bg-red-700 transition-all"
                        >
                          Cargar Imagen para Editar
                        </button>
                      </div>
                    )}

                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      ref={editorFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setEditorImage(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>

                  {editorImage && (
                    <div className="flex justify-center gap-4">
                      <button 
                        onClick={() => editorFileInputRef.current?.click()}
                        className="px-6 py-3 bg-neutral-800 rounded-xl font-bold hover:bg-neutral-700 transition-all"
                      >
                        Cambiar Imagen
                      </button>
                      <button 
                        onClick={() => {
                          // In a real app, we'd use a canvas to export the filtered image
                          alert("¡Imagen lista! En la versión Pro podrás descargarla directamente con todos los efectos.");
                        }}
                        className="px-8 py-3 bg-red-600 rounded-xl font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                      >
                        Exportar Resultado
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Hero Section */}
              <div className="text-center mb-16">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-6 font-display uppercase leading-[0.9]">
                    Diseña tu éxito <br />
                    <span className="text-red-600">con IA</span>
                  </h1>
                  <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-10">
                    Flaquincito IA crea miniaturas que disparan tu CTR. Describe tu idea o sube una imagen, 
                    nosotros hacemos la magia visual.
                  </p>
                </motion.div>

                {/* Text & Image Interface */}
                <div className="max-w-3xl mx-auto space-y-6">
                  <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-xl">
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe tu miniatura (ej: 'Un chico asustado con un alien gigante detrás')"
                      className="w-full bg-black border border-white/5 rounded-2xl p-6 text-lg focus:outline-none focus:border-red-600 transition-colors min-h-[120px] resize-none mb-4"
                    />
                    
                    <div className="flex flex-wrap items-center gap-4">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        ref={fileInputRef}
                      />
                      
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold transition-colors"
                      >
                        <Upload className="w-5 h-5" />
                        {uploadedImage ? 'Cambiar Imagen' : 'Subir Referencia'}
                      </button>

                      <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || (!description && !uploadedImage)}
                        className="flex-grow flex items-center justify-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-black uppercase tracking-widest transition-all"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Crear Miniatura
                          </>
                        )}
                      </button>
                    </div>

                    {uploadedImage && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-6 relative inline-block"
                      >
                        <img 
                          src={uploadedImage} 
                          alt="Uploaded reference" 
                          className="h-32 rounded-xl border border-white/20 object-cover"
                        />
                        <button 
                          onClick={() => setUploadedImage(null)}
                          className="absolute -top-2 -right-2 bg-red-600 p-1 rounded-full shadow-lg hover:scale-110 transition-transform"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Section */}
              <AnimatePresence>
                {(result || error) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24"
                  >
                    {/* Image Preview */}
                    <div className="space-y-4">
                      <div className="aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 relative group">
                        {result?.imageUrl ? (
                          <>
                            <img 
                              src={result.imageUrl} 
                              alt="Generated Thumbnail" 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform">
                                <Download className="w-6 h-6" />
                              </button>
                              <button className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" />
                              </button>
                              <button 
                                onClick={() => {
                                  setEditorImage(result.imageUrl!);
                                  setActiveTab('editor');
                                }}
                                className="p-3 bg-red-600 text-white rounded-full hover:scale-110 transition-transform"
                                title="Editar en 3D"
                              >
                                <Edit3 className="w-6 h-6" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600">
                            <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                            <p>Generando imagen...</p>
                          </div>
                        )}
                      </div>
                      {(result?.suggestedTitle || result?.suggested_title) && (
                        <div className="p-6 bg-neutral-900 rounded-2xl border border-white/10">
                          <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Título Sugerido</h3>
                          <p className="text-xl font-bold">{result.suggestedTitle || result.suggested_title}</p>
                        </div>
                      )}
                    </div>

                    {/* Advice & Details */}
                    <div className="space-y-6">
                      {error ? (
                        <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl flex items-start gap-4">
                          <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                          <p className="text-red-200">{error}</p>
                        </div>
                      ) : (
                        <>
                          <div className="p-8 bg-neutral-900 rounded-2xl border border-white/10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                              <TrendingUp className="w-24 h-24" />
                            </div>
                            <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-4">Psicología del Clic</h3>
                            <p className="text-lg text-neutral-300 leading-relaxed italic">
                              "{result?.clickAdvice || result?.click_advice}"
                            </p>
                          </div>

                          <div className="p-8 bg-neutral-900 rounded-2xl border border-white/10">
                            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Prompt Generado</h3>
                            <p className="text-sm font-mono text-neutral-400 bg-black/50 p-4 rounded-lg break-words">
                              {result?.imagePrompt || result?.image_prompt}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Pricing Section */}
          <section id="pricing" className="py-24 border-t border-white/10">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-black uppercase font-display mb-4 tracking-tight">Elige tu arsenal</h2>
              <p className="text-neutral-500">Escala tu canal con las mejores herramientas visuales.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Basic MXN */}
              <div className="p-8 bg-neutral-900 rounded-3xl border border-red-600/30 flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Zap className="w-20 h-20" />
                </div>
                <h3 className="text-xl font-bold mb-2">Flaquincito MX</h3>
                <div className="text-3xl font-black mb-6">$33 <span className="text-sm font-normal text-neutral-500">MXN/mes</span></div>
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    Acceso al Editor 3D
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    5 diseños HD por día
                  </li>
                </ul>
                <button 
                  onClick={() => handleSubscribe('basic_mxn')}
                  disabled={isProcessingPayment || subscriptionStatus === 'basic_mxn'}
                  className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {subscriptionStatus === 'basic_mxn' ? 'Plan Actual' : 'Elegir Plan'}
                </button>
              </div>

              {/* Free */}
              <div className="p-8 bg-neutral-900 rounded-3xl border border-white/10 flex flex-col">
                <h3 className="text-xl font-bold mb-2">Flaquincito Free</h3>
                <div className="text-3xl font-black mb-6">$0 <span className="text-sm font-normal text-neutral-500">/mes</span></div>
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    3 diseños básicos por día
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Con marca de agua
                  </li>
                </ul>
                <button 
                  disabled={subscriptionStatus === 'free'}
                  className="w-full py-3 rounded-xl border border-white/20 font-bold hover:bg-white hover:text-black transition-all disabled:opacity-50"
                >
                  {subscriptionStatus === 'free' ? 'Plan Actual' : 'Plan Básico'}
                </button>
              </div>

              {/* Standard */}
              <div className="p-8 bg-neutral-900 rounded-3xl border-2 border-red-600 relative flex flex-col shadow-[0_20px_50px_rgba(220,38,38,0.15)]">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                  Más Popular
                </div>
                <h3 className="text-xl font-bold mb-2">Flaquincito Estándar</h3>
                <div className="text-3xl font-black mb-6">$19 <span className="text-sm font-normal text-neutral-500">/mes</span></div>
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    Diseños ilimitados
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    Sin marca de agua
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    Plantillas de alta conversión
                  </li>
                </ul>
                <button 
                  onClick={() => handleSubscribe('standard')}
                  disabled={isProcessingPayment || subscriptionStatus === 'standard'}
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {subscriptionStatus === 'standard' ? 'Plan Actual' : 'Suscribirse Ahora'}
                </button>
              </div>

              {/* Premium */}
              <div className="p-8 bg-neutral-900 rounded-3xl border border-white/10 flex flex-col">
                <h3 className="text-xl font-bold mb-2">Creator Pro</h3>
                <div className="text-3xl font-black mb-6">$49 <span className="text-sm font-normal text-neutral-500">/mes</span></div>
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-yellow-500" />
                    Funciones avanzadas
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-yellow-500" />
                    Análisis de competencia
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle2 className="w-4 h-4 text-yellow-500" />
                    Elementos virales
                  </li>
                </ul>
                <button 
                  onClick={() => handleSubscribe('premium')}
                  disabled={isProcessingPayment || subscriptionStatus === 'premium'}
                  className="w-full py-3 rounded-xl border border-white/20 font-bold hover:bg-white hover:text-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {subscriptionStatus === 'premium' ? 'Plan Actual' : 'Suscribirse Ahora'}
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 py-12 px-6 text-center text-neutral-600 text-sm">
          <p>© 2026 Flaquincito IA. Todos los derechos reservados.</p>
        </footer>
      </div>
    </div>
  );
}
