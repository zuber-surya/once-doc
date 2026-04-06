import { useState, useEffect, useMemo, FormEvent } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { 
  Book, 
  Code2, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Menu, 
  X, 
  Sun, 
  Moon, 
  Copy, 
  Check, 
  Play, 
  Globe, 
  Lock, 
  Settings,
  ExternalLink,
  Plus,
  Trash2,
  Save,
  Edit,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  documentation as initialDocs, 
  apiExplorer as initialApis, 
  glossary as initialGlossary, 
  ApiEndpoint, 
  DocSection, 
  ApiModule, 
  GlossaryItem 
} from './data';
import { generateCodeSnippet } from './lib/codeGen';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Breadcrumbs = ({ path }: { path: string[] }) => (
  <div className="flex items-center gap-2 text-xs text-slate-500 mb-6 overflow-x-auto whitespace-nowrap pb-2">
    <Globe size={14} />
    {path.map((item, i) => (
      <div key={i} className="flex items-center gap-2">
        {i > 0 && <ChevronRight size={12} />}
        <span className={i === path.length - 1 ? "text-slate-900 dark:text-slate-100 font-medium" : ""}>
          {item}
        </span>
      </div>
    ))}
  </div>
);

const MethodBadge = ({ method }: { method: string }) => {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-500',
    POST: 'bg-blue-500',
    PUT: 'bg-amber-500',
    DELETE: 'bg-red-500',
    PATCH: 'bg-violet-500',
  };
  return <span className={`method-badge ${colors[method]}`}>{method}</span>;
};

const JsonViewer = ({ data, title }: { data: any, title?: string }) => {
  const [activeTab, setActiveTab] = useState<'example' | 'schema'>('example');
  
  if (!data) return null;

  const hasSchema = !!data.schema;
  const hasExample = !!data.example || (!data.schema && typeof data === 'object');
  const displayData = activeTab === 'example' ? (data.example || data) : data.schema;

  return (
    <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/50">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-4">
          {hasExample && (
            <button 
              onClick={() => setActiveTab('example')}
              className={`text-[10px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'example' ? 'text-brand-blue border-brand-blue' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
            >
              Example Value
            </button>
          )}
          {hasSchema && (
            <button 
              onClick={() => setActiveTab('schema')}
              className={`text-[10px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'schema' ? 'text-brand-blue border-brand-blue' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
            >
              Schema
            </button>
          )}
        </div>
        {title && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>}
      </div>
      <div className="p-4 overflow-auto max-h-[400px] custom-scrollbar">
        <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
          <code>{JSON.stringify(displayData, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // CMS State (Source of Truth)
  const [docs, setDocs] = useState<DocSection[]>(initialDocs);
  const [apis, setApis] = useState<ApiModule[]>(initialApis);
  const [terms, setTerms] = useState<GlossaryItem[]>(initialGlossary);

  const [activeTab, setActiveTab] = useState<'docs' | 'api' | 'terms' | 'cms'>('docs');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [selectedId, setSelectedId] = useState('introduction');
  const [selectedApi, setSelectedApi] = useState<ApiEndpoint | null>(null);
  const [environment, setEnvironment] = useState('Production');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Routing Simulation
  const [currentPath, setCurrentPath] = useState(window.location.hash || '#/docs/introduction');
  
  // Real-time Firestore Sync
  useEffect(() => {
    const unsubDocs = onSnapshot(collection(db, 'docs'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as DocSection);
      if (data.length > 0) setDocs(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'docs'));

    const unsubApis = onSnapshot(collection(db, 'apis'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as ApiModule);
      if (data.length > 0) setApis(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'apis'));

    const unsubTerms = onSnapshot(collection(db, 'terms'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as GlossaryItem);
      if (data.length > 0) setTerms(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'terms'));

    return () => {
      unsubDocs();
      unsubApis();
      unsubTerms();
    };
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === 'zuber.s@crestinfosystems.com');
      setIsAuthReady(true);
    });
    return unsub;
  }, []);

  // Initial Data Migration (One-time)
  useEffect(() => {
    const migrate = async () => {
      if (!isAdmin) return;
      
      const docsSnap = await getDocs(collection(db, 'docs'));
      if (docsSnap.empty) {
        const batch = writeBatch(db);
        initialDocs.forEach(d => batch.set(doc(db, 'docs', d.id), d));
        await batch.commit();
      }

      const apisSnap = await getDocs(collection(db, 'apis'));
      if (apisSnap.empty) {
        const batch = writeBatch(db);
        initialApis.forEach(m => batch.set(doc(db, 'apis', m.id), m));
        await batch.commit();
      }

      const termsSnap = await getDocs(collection(db, 'terms'));
      if (termsSnap.empty) {
        const batch = writeBatch(db);
        initialGlossary.forEach(t => batch.set(doc(db, 'terms', t.term.replace(/\s+/g, '_')), t));
        await batch.commit();
      }
    };
    if (isAuthReady && isAdmin) migrate();
  }, [isAuthReady, isAdmin]);

  // Set initial selected API once apis are loaded
  useEffect(() => {
    if (apis.length > 0 && !selectedApi) {
      setSelectedApi(apis[0].endpoints[0]);
    }
  }, [apis, selectedApi]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setCurrentPath(hash);
      
      // Update Canonical Link
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', window.location.href);

      if (hash.startsWith('#/admin')) {
        if (isAdmin) {
          setActiveTab('cms');
        } else {
          window.location.hash = '#/login';
        }
      } else if (hash.startsWith('#/login')) {
        setActiveTab('docs'); 
      } else if (hash.startsWith('#/api')) {
        setActiveTab('api');
        const apiId = hash.split('/')[2];
        if (apiId) {
          const api = apis.flatMap(m => m.endpoints).find(e => e.id === apiId);
          if (api) setSelectedApi(api);
        }
      } else if (hash.startsWith('#/terms')) {
        setActiveTab('terms');
      } else if (hash.startsWith('#/docs')) {
        setActiveTab('docs');
        const docId = hash.split('/')[2];
        if (docId) setSelectedId(docId);
      } else {
        // Default redirect
        if (!hash || hash === '#/') {
          window.location.hash = '#/docs/introduction';
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAdmin, apis]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setLoginEmail('');
      setLoginPassword('');
      window.location.hash = '#/admin';
    } catch (err: any) {
      setLoginError(err.message || 'Invalid credentials');
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
      setLoginEmail('');
      setLoginPassword('');
      window.location.hash = '#/admin';
    } catch (err: any) {
      setLoginError(err.message || 'Error creating account');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.hash = '#/docs';
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // CMS Editing State
  const [cmsMode, setCmsMode] = useState<'docs' | 'apis' | 'terms'>('docs');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [cmsSearchQuery, setCmsSearchQuery] = useState('');
  const [slugError, setSlugError] = useState('');

  useEffect(() => {
    localStorage.setItem('1nce_docs', JSON.stringify(docs));
  }, [docs]);

  useEffect(() => {
    localStorage.setItem('1nce_apis', JSON.stringify(apis));
  }, [apis]);

  useEffect(() => {
    localStorage.setItem('1nce_terms', JSON.stringify(terms));
  }, [terms]);

  // API Explorer State
  const [headers, setHeaders] = useState<Record<string, string>>({ 'Authorization': 'Bearer YOUR_TOKEN' });
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLang, setActiveLang] = useState('cURL');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  const baseUrl = useMemo(() => {
    switch (environment) {
      case 'Dev': return 'https://api-dev.1nce.com';
      case 'Staging': return 'https://api-staging.1nce.com';
      case 'Internal': return 'http://1nce-dev-alb-167730360.us-east-2.elb.amazonaws.com';
      default: return 'https://api.1nce.com';
    }
  }, [environment]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executeRequest = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setResponse({
        status: 200,
        time: '124ms',
        data: {
          success: true,
          message: "Request executed successfully in " + environment + " environment.",
          timestamp: new Date().toISOString(),
          received: {
            method: selectedApi?.method,
            url: `${baseUrl}${selectedApi?.path}`,
            headers,
            queryParams,
            body: requestBody ? JSON.parse(requestBody) : null
          }
        }
      });
      setIsLoading(false);
    }, 800);
  };

  const currentContent = useMemo(() => {
    if (activeTab === 'docs') {
      const findDoc = (dList: DocSection[]): DocSection | undefined => {
        for (const d of dList) {
          if (d.id === selectedId) return d;
          if (d.subsections) {
            const sub = findDoc(d.subsections);
            if (sub) return sub;
          }
        }
      };
      return findDoc(docs);
    }
    return null;
  }, [activeTab, selectedId, docs]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-brand-navy text-white flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-white/10 rounded lg:hidden">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-brand-navy">
              <Globe size={20} />
            </div>
            <span>1NCE<span className="font-normal opacity-70 ml-2">Developer Hub</span></span>
          </div>
          
          <nav className="hidden md:flex items-center ml-8 h-14">
            <button 
              onClick={() => { window.location.hash = '#/docs/introduction'; }}
              className={`h-full px-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'docs' ? 'border-white text-white' : 'border-transparent text-white/60 hover:text-white'}`}
            >
              Documentation
            </button>
            <button 
              onClick={() => { window.location.hash = `#/api/${apis[0].endpoints[0].id}`; }}
              className={`h-full px-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'api' ? 'border-white text-white' : 'border-transparent text-white/60 hover:text-white'}`}
            >
              API Explorer
            </button>
            <button 
              onClick={() => window.location.hash = '#/terms'}
              className={`h-full px-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'terms' ? 'border-white text-white' : 'border-transparent text-white/60 hover:text-white'}`}
            >
              Terms & Abbreviations
            </button>
            {isAdmin && (
              <button 
                onClick={() => window.location.hash = '#/admin'}
                className={`h-full px-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'cms' ? 'border-white text-white' : 'border-transparent text-white/60 hover:text-white'}`}
              >
                CMS
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-white/10 px-2 py-1 rounded border border-white/20">
            <Settings size={14} className="opacity-60" />
            <select 
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option className="text-slate-900">Production</option>
              <option className="text-slate-900">Staging</option>
              <option className="text-slate-900">Dev</option>
              <option className="text-slate-900">Internal</option>
            </select>
          </div>
          
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <div className="h-8 w-8 rounded-full bg-brand-blue flex items-center justify-center font-bold text-xs cursor-pointer group relative">
            {isAdmin ? 'AD' : 'ZS'}
            {isAdmin && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Admin User</p>
                  <p className="text-[10px] text-slate-500">{user?.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="w-full text-left p-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-b-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <AnimatePresence mode="wait">
          {sidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-y-auto hidden lg:block"
            >
              <div className="p-4">
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                  />
                </div>

                {activeTab === 'docs' && (
                  <div className="space-y-1">
                    {docs.map(section => (
                      <div key={section.id}>
                        <button 
                          onClick={() => window.location.hash = `#/docs/${section.id}`}
                          className={`w-full sidebar-item ${selectedId === section.id ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                        >
                          <Book size={16} />
                          <span>{section.title}</span>
                          {section.subsections && <ChevronDown size={14} className="ml-auto opacity-50" />}
                        </button>
                        {section.subsections && (
                          <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 dark:border-slate-800">
                            {section.subsections.map(sub => (
                              <button 
                                key={sub.id}
                                onClick={() => window.location.hash = `#/docs/${sub.id}`}
                                className={`w-full pl-6 pr-3 py-1.5 text-sm transition-colors text-left ${selectedId === sub.id ? 'text-brand-blue font-medium' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                              >
                                {sub.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'api' && (
                  <div className="space-y-6">
                    {apis.map(module => (
                      <div key={module.id}>
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-3">{module.name}</h3>
                        <div className="space-y-1">
                          {module.endpoints.map(api => (
                            <button 
                              key={api.id}
                              onClick={() => window.location.hash = `#/api/${api.id}`}
                              className={`w-full sidebar-item group ${selectedApi?.id === api.id ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                            >
                              <MethodBadge method={api.method} />
                              <span className="truncate">{api.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'terms' && (
                  <div className="space-y-1">
                    {Array.from(new Set(terms.map(i => i.category))).map(cat => (
                      <div key={cat} className="mb-4">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-3">{cat}</h3>
                        {terms.filter(i => i.category === cat).map(item => (
                          <button 
                            key={item.term}
                            onClick={() => window.location.hash = `#/docs/${item.term}`}
                            className={`w-full sidebar-item ${selectedId === item.term ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                          >
                            <FileText size={16} />
                            <span>{item.term}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'cms' && (
                  <div className="space-y-1">
                    <button 
                      onClick={() => setCmsMode('docs')}
                      className={`w-full sidebar-item ${cmsMode === 'docs' ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                    >
                      <Book size={16} />
                      <span>Manage Docs</span>
                    </button>
                    <button 
                      onClick={() => setCmsMode('apis')}
                      className={`w-full sidebar-item ${cmsMode === 'apis' ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                    >
                      <Code2 size={16} />
                      <span>Manage APIs</span>
                    </button>
                    <button 
                      onClick={() => setCmsMode('terms')}
                      className={`w-full sidebar-item ${cmsMode === 'terms' ? 'sidebar-item-active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                    >
                      <FileText size={16} />
                      <span>Manage Terms</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-950">
          <div className="max-w-5xl mx-auto p-8">
            {currentPath === '#/login' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto mt-20">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <div className="flex justify-center mb-6">
                    <div className="w-12 h-12 bg-brand-navy rounded-xl flex items-center justify-center text-white">
                      <Lock size={24} />
                    </div>
                  </div>
                  
                  <div className="flex border-b border-slate-100 dark:border-slate-800 mb-8">
                    <button 
                      onClick={() => setAuthMode('login')}
                      className={`flex-1 pb-3 text-sm font-bold transition-all ${authMode === 'login' ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Sign In
                    </button>
                    <button 
                      onClick={() => setAuthMode('signup')}
                      className={`flex-1 pb-3 text-sm font-bold transition-all ${authMode === 'signup' ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Sign Up
                    </button>
                  </div>

                  <h2 className="text-2xl font-bold text-center mb-2">{authMode === 'login' ? 'Admin Login' : 'Create Account'}</h2>
                  <p className="text-sm text-slate-500 text-center mb-8">
                    {authMode === 'login' ? 'Access the Content Management System' : 'Register a new admin account'}
                  </p>
                  
                  <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email</label>
                      <input 
                        type="email" 
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-blue"
                        placeholder="zuber.s@crestinfosystems.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Password</label>
                      <input 
                        type="password" 
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-blue"
                        placeholder="••••••••"
                      />
                    </div>
                    {loginError && <p className="text-xs text-red-500 font-medium">{loginError}</p>}
                    <button 
                      type="submit"
                      className="w-full py-3 bg-brand-blue hover:bg-blue-600 text-white rounded-lg font-bold transition-all shadow-lg shadow-brand-blue/20"
                    >
                      {authMode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'docs' && currentContent && currentPath !== '#/login' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center justify-between mb-2">
                  <Breadcrumbs path={['Documentation', currentContent.title]} />
                  {isAdmin && (
                    <button 
                      onClick={() => {
                        setCmsMode('docs');
                        setEditingItem(currentContent);
                        window.location.hash = '#/admin';
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-blue bg-brand-blue/10 rounded-lg hover:bg-brand-blue/20 transition-colors"
                    >
                      <Edit size={14} /> Edit Page
                    </button>
                  )}
                </div>
                <h1 className="text-4xl font-bold mb-6 text-slate-900 dark:text-white">{currentContent.title}</h1>
                <div className="prose dark:prose-invert max-w-none">
                  <div 
                    className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8 quill-content"
                    dangerouslySetInnerHTML={{ __html: currentContent.content }}
                  />
                  
                  {currentContent.id === 'introduction' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                      {[
                        { title: 'Access Point Name (APN)', icon: <Globe />, desc: 'Connecting IoT devices requires setting the APN.' },
                        { title: 'API Explorer', icon: <Code2 />, desc: 'Check the API Explorer to know the Management API.' },
                        { title: '1NCE Portal Guide', icon: <Book />, desc: 'Easy-to-use web interface for managing SIMs.' }
                      ].map((card, i) => (
                        <div key={i} className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-blue transition-colors group cursor-pointer">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-brand-blue mb-4 group-hover:bg-brand-blue group-hover:text-white transition-colors">
                            {card.icon}
                          </div>
                          <h3 className="font-bold mb-2">{card.title}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{card.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'api' && selectedApi && currentPath !== '#/login' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left: Request Configuration */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="flex items-center justify-between mb-2">
                    <Breadcrumbs path={['API Explorer', selectedApi.name]} />
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          setCmsMode('apis');
                          setEditingItem(selectedApi);
                          window.location.hash = '#/admin';
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-blue bg-brand-blue/10 rounded-lg hover:bg-brand-blue/20 transition-colors"
                      >
                        <Edit size={14} /> Edit API
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <MethodBadge method={selectedApi.method} />
                    <h1 className="text-2xl font-bold">{selectedApi.name}</h1>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">{selectedApi.description}</p>

                  <div className="space-y-8">
                    {/* URL Bar */}
                    <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-sm">
                      <span className="text-slate-400 px-2">{baseUrl}</span>
                      <span className="text-brand-blue font-bold">{selectedApi.path}</span>
                    </div>

                    {/* Auth */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Lock size={14} className="text-brand-blue" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Authentication</h3>
                      </div>
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Type</span>
                          <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Bearer Token</span>
                        </div>
                        <input 
                          type="text" 
                          value={headers['Authorization']}
                          onChange={(e) => setHeaders({ ...headers, 'Authorization': e.target.value })}
                          className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-brand-blue"
                        />
                      </div>
                    </div>

                    {/* Parameters */}
                    {selectedApi.parameters && (
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Parameters</h3>
                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-left">
                              <tr>
                                <th className="px-4 py-2 font-medium">Name</th>
                                <th className="px-4 py-2 font-medium">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {selectedApi.parameters.map(param => (
                                <tr key={param.name}>
                                  <td className="px-4 py-3">
                                    <div className="font-mono text-xs font-bold">{param.name} {param.required && <span className="text-red-500">*</span>}</div>
                                    <div className="text-[10px] text-slate-400">{param.in} • {param.type}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="text" 
                                      placeholder={param.description}
                                      className="w-full p-1.5 bg-transparent border-b border-slate-200 dark:border-slate-700 outline-none focus:border-brand-blue text-xs"
                                      onChange={(e) => {
                                        if (param.in === 'query') setQueryParams({ ...queryParams, [param.name]: e.target.value });
                                        if (param.in === 'path') setPathParams({ ...pathParams, [param.name]: e.target.value });
                                        if (param.in === 'header') setHeaders({ ...headers, [param.name]: e.target.value });
                                      }}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Body */}
                    {selectedApi.method !== 'GET' && (
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Request Body</h3>
                        <div className="space-y-4">
                          <textarea 
                            value={requestBody}
                            onChange={(e) => setRequestBody(e.target.value)}
                            placeholder='{ "key": "value" }'
                            className="w-full h-40 p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-lg outline-none focus:ring-2 focus:ring-brand-blue"
                          />
                          {selectedApi.requestBody && (
                            <JsonViewer data={selectedApi.requestBody} title="Request Body Definition" />
                          )}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={executeRequest}
                      disabled={isLoading}
                      className="w-full py-3 bg-brand-blue hover:bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-blue/20 disabled:opacity-50"
                    >
                      {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={18} fill="currentColor" />}
                      Execute Request
                    </button>

                    {/* Responses Section */}
                    {selectedApi.responses && Array.isArray(selectedApi.responses) && (
                      <div className="mt-12">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Responses</h3>
                        <div className="space-y-8">
                          {selectedApi.responses.map(resp => (
                            <div key={resp.code} className="border-l-2 border-slate-200 dark:border-slate-800 pl-6 py-2">
                              <div className="flex items-center gap-4 mb-2">
                                <span className={`text-sm font-bold ${resp.code >= 200 && resp.code < 300 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {resp.code}
                                </span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{resp.description}</span>
                              </div>
                              <div className="text-xs text-slate-500 mb-4">Media type: <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">application/json</span></div>
                              <JsonViewer data={resp} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Right: Code & Response */}
                <div className="space-y-8">
                  {/* Code Snippets */}
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="sticky top-24">
                    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                        <div className="flex gap-1">
                          {['cURL', 'Python', 'JavaScript', 'PHP', 'Java', 'C#'].map(lang => (
                            <button 
                              key={lang}
                              onClick={() => setActiveLang(lang)}
                              className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${activeLang === lang ? 'bg-brand-blue text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                        <button 
                          onClick={() => handleCopy(generateCodeSnippet(activeLang, selectedApi, baseUrl, headers, queryParams, pathParams, requestBody))}
                          className="p-1.5 hover:bg-white/10 rounded text-slate-400 transition-colors"
                        >
                          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <div className="p-4 h-[300px] overflow-auto custom-scrollbar">
                        <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                          <code>{generateCodeSnippet(activeLang, selectedApi, baseUrl, headers, queryParams, pathParams, requestBody)}</code>
                        </pre>
                      </div>
                    </div>

                    {/* Response Panel */}
                    <AnimatePresence>
                      {response && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-8"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Response</h3>
                            <div className="flex gap-4 text-xs font-mono">
                              <span className="text-emerald-500 font-bold">STATUS {response.status} OK</span>
                              <span className="text-slate-400">TIME {response.time}</span>
                            </div>
                          </div>
                          <div className="json-viewer h-[400px] custom-scrollbar">
                            <pre className="text-slate-900 dark:text-slate-300">
                              {JSON.stringify(response.data, null, 2)}
                            </pre>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </div>
            )}

            {activeTab === 'terms' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Breadcrumbs path={['Terms & Abbreviations']} />
                <h1 className="text-4xl font-bold mb-12 text-slate-900 dark:text-white">Glossary</h1>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {terms.map((item, i) => (
                    <div key={i} className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-bold text-brand-blue bg-brand-blue/10 px-2 py-1 rounded uppercase tracking-wider">{item.category}</span>
                        <h3 className="text-xl font-bold">{item.term}</h3>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed italic">
                        "{item.definition}"
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'cms' && isAdmin && currentPath !== '#/login' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Content Management System</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage your documentation, APIs, and glossary terms.</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (confirm('Are you sure you want to reset all content to default? This cannot be undone.')) {
                          if (cmsMode === 'docs') setDocs(initialDocs);
                          if (cmsMode === 'apis') setApis(initialApis);
                          if (cmsMode === 'terms') setTerms(initialGlossary);
                          localStorage.clear();
                          window.location.reload();
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      <Trash2 size={16} />
                      Reset All to Default
                    </button>
                  </div>
                </div>

                {/* CMS Tabs */}
                <div className="flex gap-1 mb-8 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-fit">
                  {[
                    { id: 'docs', label: 'Documentation', icon: <Book size={16} /> },
                    { id: 'apis', label: 'API Explorer', icon: <Code2 size={16} /> },
                    { id: 'terms', label: 'Glossary', icon: <FileText size={16} /> }
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => { setCmsMode(tab.id as any); setEditingItem(null); setCmsSearchQuery(''); }}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${cmsMode === tab.id ? 'bg-white dark:bg-slate-800 text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {!editingItem ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          placeholder={`Search ${cmsMode === 'docs' ? 'pages' : cmsMode === 'apis' ? 'endpoints' : 'terms'}...`}
                          value={cmsSearchQuery}
                          onChange={(e) => setCmsSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue transition-all"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          if (cmsMode === 'docs') {
                            setEditingItem({ id: `new-page-${Date.now()}`, title: 'New Documentation Page', content: '', isNew: true, parentId: 'none' });
                          } else if (cmsMode === 'apis') {
                            setEditingItem({ 
                              id: `new-api-${Date.now()}`, 
                              method: 'GET', 
                              path: '/new-endpoint', 
                              name: 'New API Endpoint', 
                              description: '', 
                              isNew: true, 
                              parentId: apis[0]?.id,
                              responses: []
                            });
                          } else if (cmsMode === 'terms') {
                            setEditingItem({ term: 'New Term', definition: '', category: 'General', isNew: true });
                          }
                        }}
                        className="flex items-center gap-2 px-6 py-2.5 bg-brand-blue text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-all shadow-lg shadow-brand-blue/20"
                      >
                        <Plus size={18} /> Add New {cmsMode === 'docs' ? 'Page' : cmsMode === 'apis' ? 'API' : 'Term'}
                      </button>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <th className="px-6 py-4 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                              {cmsMode === 'terms' ? 'Term' : 'Title / Name'}
                            </th>
                            <th className="px-6 py-4 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                              {cmsMode === 'terms' ? 'Category' : 'Slug / Path'}
                            </th>
                            <th className="px-6 py-4 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {cmsMode === 'docs' && docs.flatMap(d => [d, ...(d.subsections || [])])
                            .filter(d => d.title.toLowerCase().includes(cmsSearchQuery.toLowerCase()) || d.id.toLowerCase().includes(cmsSearchQuery.toLowerCase()))
                            .map(doc => (
                              <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="font-bold text-slate-900 dark:text-white group-hover:text-brand-blue transition-colors">{doc.title}</div>
                                  {docs.find(d => d.subsections?.some(s => s.id === doc.id)) && (
                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                      <ChevronDown size={10} className="-rotate-90" />
                                      Subsection of {docs.find(d => d.subsections?.some(s => s.id === doc.id))?.title}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500">{doc.id}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => {
                                        const parent = docs.find(d => d.subsections?.some(s => s.id === doc.id));
                                        setEditingItem({ ...doc, oldId: doc.id, parentId: parent?.id || 'none' });
                                      }}
                                      className="p-2 text-slate-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-all"
                                    >
                                      <Edit size={18} />
                                    </button>
                                    <button 
                                      onClick={async () => {
                                        if (confirm('Are you sure you want to delete this page?')) {
                                          try {
                                            const parent = docs.find(d => d.subsections?.some(s => s.id === doc.id));
                                            if (parent) {
                                              const updatedParent = {
                                                ...parent,
                                                subsections: parent.subsections?.filter(s => s.id !== doc.id)
                                              };
                                              await setDoc(doc(db, 'docs', parent.id), updatedParent);
                                            } else {
                                              await deleteDoc(doc(db, 'docs', doc.id));
                                            }
                                          } catch (error) {
                                            handleFirestoreError(error, OperationType.DELETE, 'docs');
                                          }
                                        }
                                      }}
                                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          {cmsMode === 'apis' && apis.flatMap(m => m.endpoints)
                            .filter(api => api.name.toLowerCase().includes(cmsSearchQuery.toLowerCase()) || api.path.toLowerCase().includes(cmsSearchQuery.toLowerCase()))
                            .map(api => (
                              <tr key={api.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <MethodBadge method={api.method} />
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white group-hover:text-brand-blue transition-colors">{api.name}</div>
                                      <div className="text-[10px] text-slate-400 mt-0.5">{apis.find(m => m.endpoints.some(e => e.id === api.id))?.name}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="font-mono text-[11px] text-slate-500">{api.path}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => {
                                        const module = apis.find(m => m.endpoints.some(e => e.id === api.id));
                                        setEditingItem({ 
                                          ...api, 
                                          responses: Array.isArray(api.responses) ? api.responses : [],
                                          oldId: api.id, 
                                          parentId: module?.id 
                                        });
                                      }}
                                      className="p-2 text-slate-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-all"
                                    >
                                      <Edit size={18} />
                                    </button>
                                    <button 
                                      onClick={async () => {
                                        if (confirm('Are you sure you want to delete this endpoint?')) {
                                          try {
                                            const module = apis.find(m => m.endpoints.some(e => e.id === api.id));
                                            if (module) {
                                              const updatedModule = {
                                                ...module,
                                                endpoints: module.endpoints.filter(e => e.id !== api.id)
                                              };
                                              await setDoc(doc(db, 'apis', module.id), updatedModule);
                                            }
                                          } catch (error) {
                                            handleFirestoreError(error, OperationType.DELETE, 'apis');
                                          }
                                        }
                                      }}
                                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          {cmsMode === 'terms' && terms
                            .filter(t => t.term.toLowerCase().includes(cmsSearchQuery.toLowerCase()) || t.category.toLowerCase().includes(cmsSearchQuery.toLowerCase()))
                            .map((term, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="font-bold text-slate-900 dark:text-white group-hover:text-brand-blue transition-colors">{term.term}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-brand-blue bg-brand-blue/10 px-2 py-1 rounded uppercase tracking-wider">{term.category}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => setEditingItem({ ...term, oldTerm: term.term })}
                                      className="p-2 text-slate-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-all"
                                    >
                                      <Edit size={18} />
                                    </button>
                                    <button 
                                      onClick={async () => {
                                        if (confirm('Are you sure you want to delete this term?')) {
                                          try {
                                            await deleteDoc(doc(db, 'terms', term.term.replace(/\s+/g, '_')));
                                          } catch (error) {
                                            handleFirestoreError(error, OperationType.DELETE, 'terms');
                                          }
                                        }
                                      }}
                                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {(cmsMode === 'docs' ? docs.flatMap(d => [d, ...(d.subsections || [])]) : cmsMode === 'apis' ? apis.flatMap(m => m.endpoints) : terms)
                        .filter(i => (i.title || i.name || i.term).toLowerCase().includes(cmsSearchQuery.toLowerCase())).length === 0 && (
                        <div className="p-12 text-center">
                          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <Search size={32} />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No results found</h3>
                          <p className="text-slate-500">Try adjusting your search query.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          {editingItem.isNew ? 'Create New' : 'Edit'} {cmsMode === 'docs' ? 'Documentation Page' : cmsMode === 'apis' ? 'API Endpoint' : 'Glossary Term'}
                        </h2>
                        <p className="text-sm text-slate-500">All changes are saved locally to your browser.</p>
                      </div>
                      <button 
                        onClick={() => { setEditingItem(null); setSlugError(''); }}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-all"
                      >
                        <X size={24} />
                      </button>
                    </div>

                    <div className="p-8 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {cmsMode === 'terms' ? 'Term Name' : 'Display Title'}
                          </label>
                          <input 
                            type="text" 
                            placeholder={cmsMode === 'terms' ? 'e.g. APN' : 'e.g. Introduction'}
                            value={cmsMode === 'terms' ? editingItem.term : (editingItem.title || editingItem.name)}
                            onChange={(e) => setEditingItem({ ...editingItem, [cmsMode === 'terms' ? 'term' : (editingItem.title !== undefined ? 'title' : 'name')]: e.target.value })}
                            className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all font-medium"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {cmsMode === 'terms' ? 'Category' : cmsMode === 'apis' ? 'Endpoint Path' : 'URL Slug (Unique ID)'}
                          </label>
                          <div className="relative">
                            <input 
                              type="text" 
                              placeholder={cmsMode === 'terms' ? 'e.g. Network' : cmsMode === 'apis' ? 'e.g. /login' : 'e.g. introduction'}
                              value={cmsMode === 'terms' ? editingItem.category : (editingItem.id || editingItem.path)}
                              onChange={(e) => {
                                const val = e.target.value;
                                const key = cmsMode === 'terms' ? 'category' : (editingItem.id !== undefined ? 'id' : 'path');
                                setEditingItem({ ...editingItem, [key]: val });
                                
                                // Uniqueness check for slugs/IDs
                                if (cmsMode === 'docs' && editingItem.id !== undefined) {
                                  const allDocs = docs.flatMap(d => [d, ...(d.subsections || [])]);
                                  const isDuplicate = allDocs.some(d => d.id === val && d.id !== editingItem.oldId);
                                  setSlugError(isDuplicate ? 'This ID is already taken by another page.' : '');
                                } else if (cmsMode === 'apis' && editingItem.id !== undefined) {
                                  const allApis = apis.flatMap(m => m.endpoints);
                                  const isDuplicate = allApis.some(a => a.id === val && a.id !== editingItem.oldId);
                                  setSlugError(isDuplicate ? 'This ID is already taken by another API.' : '');
                                }
                              }}
                              className={`w-full p-3.5 bg-slate-50 dark:bg-slate-800 border ${slugError ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700 focus:ring-brand-blue'} rounded-xl outline-none transition-all font-mono text-sm`}
                            />
                            {slugError && <p className="absolute -bottom-5 left-0 text-[10px] text-red-500 font-bold flex items-center gap-1"><X size={10} /> {slugError}</p>}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {cmsMode === 'docs' ? 'Parent Section' : cmsMode === 'apis' ? 'API Module' : 'Glossary Category'}
                          </label>
                          {cmsMode === 'terms' ? (
                            <select 
                              value={editingItem.category}
                              onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all font-medium"
                            >
                              {Array.from(new Set(terms.map(t => t.category))).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                              <option value="General">General</option>
                              <option value="Network">Network</option>
                              <option value="SIM">SIM</option>
                              <option value="Device">Device</option>
                            </select>
                          ) : (
                            <select 
                              value={editingItem.parentId || (cmsMode === 'docs' ? 'none' : apis[0]?.id)}
                              onChange={(e) => setEditingItem({ ...editingItem, parentId: e.target.value })}
                              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all font-medium"
                            >
                              {cmsMode === 'docs' && (
                                <>
                                  <option value="none">None (Top Level)</option>
                                  {docs.filter(d => d.id !== editingItem.id).map(d => (
                                    <option key={d.id} value={d.id}>{d.title}</option>
                                  ))}
                                </>
                              )}
                              {cmsMode === 'apis' && (
                                apis.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))
                              )}
                            </select>
                          )}
                        </div>
                      </div>

                      {cmsMode === 'docs' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Content Body (WYSIWYG Editor)</label>
                          <div className="quill-editor-container border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <ReactQuill 
                              theme="snow" 
                              value={editingItem.content} 
                              onChange={(content) => setEditingItem({ ...editingItem, content })}
                              className="bg-white dark:bg-slate-900 min-h-[400px]"
                              modules={{
                                toolbar: [
                                  [{ 'header': [1, 2, 3, false] }],
                                  ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                  [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'list': '+1'}],
                                  ['link', 'image', 'code-block'],
                                  ['clean']
                                ],
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {cmsMode === 'apis' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">HTTP Method</label>
                            <select 
                              value={editingItem.method}
                              onChange={(e) => setEditingItem({ ...editingItem, method: e.target.value as any })}
                              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all font-bold"
                            >
                              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Description</label>
                            <textarea 
                              value={editingItem.description}
                              onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                              rows={3}
                              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all text-sm"
                              placeholder="Briefly describe what this endpoint does..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Request Body Example (JSON)</label>
                            <textarea 
                              placeholder='{ "key": "value" }'
                              value={editingItem.requestBody?.example ? JSON.stringify(editingItem.requestBody.example, null, 2) : (editingItem._tempRequestBodyExample || '')}
                              onChange={(e) => {
                                try {
                                  const example = e.target.value ? JSON.parse(e.target.value) : undefined;
                                  setEditingItem({ ...editingItem, requestBody: { ...editingItem.requestBody, example }, _tempRequestBodyExample: undefined });
                                } catch (err) {
                                  setEditingItem({ ...editingItem, _tempRequestBodyExample: e.target.value });
                                }
                              }}
                              className="w-full h-40 p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Request Body Schema (JSON)</label>
                            <textarea 
                              placeholder='{ "field": { "type": "string" } }'
                              value={editingItem.requestBody?.schema ? JSON.stringify(editingItem.requestBody.schema, null, 2) : (editingItem._tempRequestBodySchema || '')}
                              onChange={(e) => {
                                try {
                                  const schema = e.target.value ? JSON.parse(e.target.value) : undefined;
                                  setEditingItem({ ...editingItem, requestBody: { ...editingItem.requestBody, schema }, _tempRequestBodySchema: undefined });
                                } catch (err) {
                                  setEditingItem({ ...editingItem, _tempRequestBodySchema: e.target.value });
                                }
                              }}
                              className="w-full h-40 p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Responses (JSON Array)</label>
                            <textarea 
                              placeholder='[ { "code": 200, "description": "OK", "example": { ... } } ]'
                              value={editingItem.responses ? JSON.stringify(editingItem.responses, null, 2) : (editingItem._tempResponses || '')}
                              onChange={(e) => {
                                try {
                                  const responses = e.target.value ? JSON.parse(e.target.value) : [];
                                  setEditingItem({ ...editingItem, responses, _tempResponses: undefined });
                                } catch (err) {
                                  setEditingItem({ ...editingItem, _tempResponses: e.target.value });
                                }
                              }}
                              className="w-full h-60 p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                            <p className="text-[10px] text-slate-500 italic">Enter an array of response objects with code, description, example, and schema.</p>
                          </div>
                        </div>
                      )}

                      {cmsMode === 'terms' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Definition</label>
                          <textarea 
                            value={editingItem.definition}
                            onChange={(e) => setEditingItem({ ...editingItem, definition: e.target.value })}
                            rows={6}
                            className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-blue transition-all text-sm"
                            placeholder="Enter the full definition of the term..."
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-8 border-t border-slate-100 dark:border-slate-800">
                        <button 
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
                              if (cmsMode === 'docs') {
                                const deleteDoc = (list: DocSection[]): DocSection[] => {
                                  return list.filter(d => d.id !== editingItem.id).map(d => ({
                                    ...d,
                                    subsections: d.subsections ? deleteDoc(d.subsections) : undefined
                                  }));
                                };
                                setDocs(deleteDoc(docs));
                              } else if (cmsMode === 'apis') {
                                const newApis = apis.map(m => ({
                                  ...m,
                                  endpoints: m.endpoints.filter(api => api.id !== editingItem.id)
                                }));
                                setApis(newApis);
                              } else if (cmsMode === 'terms') {
                                setTerms(terms.filter(t => t.term !== (editingItem.oldTerm || editingItem.term)));
                              }
                              setEditingItem(null);
                            }
                          }}
                          className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                          Delete Item
                        </button>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => { setEditingItem(null); setSlugError(''); }}
                            className="px-8 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all"
                          >
                            Cancel
                          </button>
                          <button 
                            disabled={!!slugError}
                            onClick={async () => {
                              try {
                                // Clean up temp fields before saving
                                const { _tempRequestBodyExample, _tempRequestBodySchema, _tempResponses, oldId, isNew, parentId, ...cleanItem } = editingItem;
                                
                                // Final JSON validation check
                                if (_tempRequestBodyExample || _tempRequestBodySchema || _tempResponses) {
                                  try {
                                    if (_tempRequestBodyExample) cleanItem.requestBody = { ...cleanItem.requestBody, example: JSON.parse(_tempRequestBodyExample) };
                                    if (_tempRequestBodySchema) cleanItem.requestBody = { ...cleanItem.requestBody, schema: JSON.parse(_tempRequestBodySchema) };
                                    if (_tempResponses) {
                                      const parsed = JSON.parse(_tempResponses);
                                      if (!Array.isArray(parsed)) {
                                        alert('Responses must be a JSON array.');
                                        return;
                                      }
                                      cleanItem.responses = parsed;
                                    }
                                  } catch (e) {
                                    alert('One of your JSON fields is invalid. Please check your syntax.');
                                    return;
                                  }
                                }

                                if (cmsMode === 'docs') {
                                  // 1. Remove from current location in state (for immediate feedback)
                                  let newDocs = docs.filter(d => d.id !== editingItem.oldId).map(d => ({
                                    ...d,
                                    subsections: d.subsections?.filter(s => s.id !== editingItem.oldId)
                                  }));

                                  // 2. Add to new location
                                  if (!editingItem.parentId || editingItem.parentId === 'none') {
                                    newDocs.push(cleanItem);
                                  } else {
                                    newDocs = newDocs.map(d => {
                                      if (d.id === editingItem.parentId) {
                                        return { ...d, subsections: [...(d.subsections || []), cleanItem] };
                                      }
                                      return d;
                                    });
                                  }

                                  // 3. Persist to Firestore
                                  const batch = writeBatch(db);
                                  // Delete old if ID changed
                                  if (editingItem.oldId && editingItem.oldId !== editingItem.id) {
                                    batch.delete(doc(db, 'docs', editingItem.oldId));
                                  }
                                  // Update all top-level docs to ensure hierarchy is saved
                                  newDocs.forEach(d => {
                                    batch.set(doc(db, 'docs', d.id), d);
                                  });
                                  await batch.commit();
                                } else if (cmsMode === 'apis') {
                                  const targetModuleId = editingItem.parentId || apis[0].id;

                                  const newApis = apis.map(m => ({
                                    ...m,
                                    endpoints: m.endpoints.filter(api => api.id !== editingItem.oldId)
                                  })).map(m => {
                                    if (m.id === targetModuleId) {
                                      return { ...m, endpoints: [...m.endpoints, cleanItem] };
                                    }
                                    return m;
                                  });

                                  // Persist to Firestore
                                  const batch = writeBatch(db);
                                  newApis.forEach(m => {
                                    batch.set(doc(db, 'apis', m.id), m);
                                  });
                                  await batch.commit();
                                } else if (cmsMode === 'terms') {
                                  const cleanItem = { ...editingItem, oldTerm: undefined, isNew: undefined, parentId: undefined };
                                  const termId = editingItem.term.replace(/\s+/g, '_');
                                  
                                  if (editingItem.oldTerm && editingItem.oldTerm !== editingItem.term) {
                                    await deleteDoc(doc(db, 'terms', editingItem.oldTerm.replace(/\s+/g, '_')));
                                  }
                                  await setDoc(doc(db, 'terms', termId), cleanItem);
                                }
                                setEditingItem(null);
                                setSlugError('');
                              } catch (error) {
                                handleFirestoreError(error, OperationType.WRITE, cmsMode);
                              }
                            }}
                            className="px-10 py-3 bg-brand-blue text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-all shadow-lg shadow-brand-blue/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="h-10 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between px-6 text-[10px] text-slate-400 font-medium uppercase tracking-widest">
        <div className="flex gap-6">
          <a href="#" className="hover:text-brand-blue flex items-center gap-1">1NCE Home <ExternalLink size={10} /></a>
          <a href="#" className="hover:text-brand-blue flex items-center gap-1">1NCE Shop <ExternalLink size={10} /></a>
          <a href="#" className="hover:text-brand-blue">Support</a>
        </div>
        <div>© 2026 1NCE GmbH. All Rights Reserved.</div>
      </footer>
    </div>
  );
}
