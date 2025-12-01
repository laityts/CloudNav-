import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, Upload, Moon, Sun, Menu, 
  Trash2, Edit2, Loader2, Cloud, CheckCircle2, AlertCircle,
  Pin, Settings, Lock, CloudCog, Github, GitFork, Home, LogIn, LogOut, User,
  GripVertical, Save
} from 'lucide-react';
import { LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS, WebDavConfig, AIConfig } from './types';
import { parseBookmarks } from './services/bookmarkParser';
import Icon from './components/Icon';
import LinkModal from './components/LinkModal';
import AuthModal from './components/AuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import BackupModal from './components/BackupModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';

// --- 配置项 ---
// 项目核心仓库地址
const GITHUB_REPO_URL = 'https://github.com/sese972010/CloudNav-';

const LOCAL_STORAGE_KEY = 'cloudnav_data_cache';
const AUTH_KEY = 'cloudnav_auth_token';
const WEBDAV_CONFIG_KEY = 'cloudnav_webdav_config';
const AI_CONFIG_KEY = 'cloudnav_ai_config';
const SITE_NAME_KEY = 'cloudnav_site_name'; // 新增：网站名称存储键

function App() {
  // --- State ---
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // 新增：网站名称状态
  const [siteName, setSiteName] = useState<string>(() => {
    return localStorage.getItem(SITE_NAME_KEY) || '云航 CloudNav';
  });
  
  // Category Security State
  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());

  // WebDAV Config State
  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
      url: '',
      username: '',
      password: '',
      enabled: false
  });

  // AI Config State
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      return {
          provider: 'gemini',
          apiKey: process.env.API_KEY || '', 
          baseUrl: '',
          model: 'gemini-2.5-flash'
      };
  });
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [catAuthModalData, setCatAuthModalData] = useState<Category | null>(null);
  
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  // State for data pre-filled from Bookmarklet
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);
  
  // Sync State
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authToken, setAuthToken] = useState<string>('');
  
  // Sorting State
  const [sortingCategoryId, setSortingCategoryId] = useState<string | null>(null);
  const [draggedLink, setDraggedLink] = useState<string | null>(null);
  
  // --- Effects ---

  useEffect(() => {
    // Theme init
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Load Token
    const savedToken = localStorage.getItem(AUTH_KEY);
    if (savedToken) setAuthToken(savedToken);

    // Load WebDAV Config
    const savedWebDav = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (savedWebDav) {
        try {
            setWebDavConfig(JSON.parse(savedWebDav));
        } catch (e) {}
    }

    // 设置网站标题
    const savedSiteName = localStorage.getItem(SITE_NAME_KEY);
    if (savedSiteName) {
      document.title = savedSiteName;
    }

    // Handle URL Params for Bookmarklet (Add Link)
    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
        const addTitle = urlParams.get('add_title') || '';
        // Clean URL params to avoid re-triggering on refresh
        window.history.replaceState({}, '', window.location.pathname);
        
        setPrefillLink({
            title: addTitle,
            url: addUrl,
            categoryId: 'common' // Default, Modal will handle selection
        });
        setEditingLink(undefined);
        setIsModalOpen(true);
    }

    // Initial Data Fetch
    const initData = async () => {
        try {
            const res = await fetch('/api/storage');
            if (res.ok) {
                const data = await res.json();
                if (data.links && data.links.length > 0) {
                    setLinks(data.links);
                    setCategories(data.categories || DEFAULT_CATEGORIES);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    return;
                }
            } 
        } catch (e) {
            console.warn("Failed to fetch from cloud, falling back to local.", e);
        }
        loadFromLocal();
    };

    initData();
  }, []);

  // 新增：更新网站标题的effect
  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  // --- Helpers & Sync Logic ---

  const loadFromLocal = () => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLinks(parsed.links || INITIAL_LINKS);
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
      } catch (e) {
        setLinks(INITIAL_LINKS);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const syncToCloud = async (newLinks: LinkItem[], newCategories: Category[], token: string) => {
    setSyncStatus('saving');
    try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': token
            },
            body: JSON.stringify({ links: newLinks, categories: newCategories })
        });

        if (response.status === 401) {
            setAuthToken('');
            localStorage.removeItem(AUTH_KEY);
            setIsAuthOpen(true);
            setSyncStatus('error');
            return false;
        }

        if (!response.ok) throw new Error('Network response was not ok');
        
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
        return true;
    } catch (error) {
        console.error("Sync failed", error);
        setSyncStatus('error');
        return false;
    }
  };

  const updateData = (newLinks: LinkItem[], newCategories: Category[]) => {
      // 1. Optimistic UI Update
      setLinks(newLinks);
      setCategories(newCategories);
      
      // 2. Save to Local Cache
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: newLinks, categories: newCategories }));

      // 3. Sync to Cloud (if authenticated)
      if (authToken) {
          syncToCloud(newLinks, newCategories, authToken);
      }
  };

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // --- Actions ---

  // 新增：修改网站名称的处理函数
  const handleSiteNameChange = (newName: string) => {
    setSiteName(newName);
    localStorage.setItem(SITE_NAME_KEY, newName);
  };

  const handleLogin = async (password: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': password
            },
            body: JSON.stringify({ links, categories })
        });
        
        if (response.ok) {
            setAuthToken(password);
            localStorage.setItem(AUTH_KEY, password);
            setIsAuthOpen(false);
            setSyncStatus('saved');
            return true;
        }
        return false;
      } catch (e) {
          return false;
      }
  };

  const handleLogout = () => {
    setAuthToken('');
    localStorage.removeItem(AUTH_KEY);
    setSyncStatus('idle');
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      
      // Merge categories: Avoid duplicate names/IDs
      const mergedCategories = [...categories];
      newCategories.forEach(nc => {
          if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
              mergedCategories.push(nc);
          }
      });

      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
      setIsImportModalOpen(false);
      alert(`成功导入 ${newLinks.length} 个新书签!`);
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    
    const newLink: LinkItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now()
    };
    updateData([newLink, ...links], categories);
    // Clear prefill if any
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (!editingLink) return;
    const updated = links.map(l => l.id === editingLink.id ? { ...l, ...data } : l);
    updateData(updated, categories);
    setEditingLink(undefined);
  };

  const handleDeleteLink = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!authToken) { setIsAuthOpen(true); return; }
    if (confirm('确定删除此链接吗?')) {
      updateData(links.filter(l => l.id !== id), categories);
    }
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!authToken) { setIsAuthOpen(true); return; }
      const updated = links.map(l => l.id === id ? { ...l, pinned: !l.pinned } : l);
      updateData(updated, categories);
  };

  const handleSaveAIConfig = (config: AIConfig) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  };

  // --- Category Management & Security ---

  const handleCategoryClick = (cat: Category) => {
      // 查看分类全部链接不需要登录
      setSelectedCategory(cat.id);
      setSidebarOpen(false);
  };

  const handleUnlockCategory = (catId: string) => {
      setUnlockedCategoryIds(prev => new Set(prev).add(catId));
      setSelectedCategory(catId);
  };

  const handleUpdateCategories = (newCats: Category[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const newCats = categories.filter(c => c.id !== catId);
      // Move links to common or first available
      const targetId = 'common'; 
      const newLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: targetId } : l);
      
      // Ensure common exists if we deleted everything
      if (newCats.length === 0) {
          newCats.push(DEFAULT_CATEGORIES[0]);
      }
      
      updateData(newLinks, newCats);
  };

  // --- WebDAV Config ---
  const handleSaveWebDavConfig = (config: WebDavConfig) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      setWebDavConfig(config);
      localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config));
  };

  const handleRestoreBackup = (restoredLinks: LinkItem[], restoredCategories: Category[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(restoredLinks, restoredCategories);
      setIsBackupModalOpen(false);
  };

  // --- Drag and Drop Sorting ---
  const handleDragStart = (e: React.DragEvent, linkId: string) => {
    e.dataTransfer.setData('text/plain', linkId);
    setDraggedLink(linkId);
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-blue-50', 'dark:bg-blue-900/20');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');
  };

  const handleDrop = (e: React.DragEvent, targetLinkId: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');
    
    const draggedLinkId = e.dataTransfer.getData('text/plain');
    if (draggedLinkId === targetLinkId || !sortingCategoryId) return;
    
    // 重新排序链接
    const categoryLinks = links.filter(link => link.categoryId === sortingCategoryId);
    const otherLinks = links.filter(link => link.categoryId !== sortingCategoryId);
    
    const draggedIndex = categoryLinks.findIndex(link => link.id === draggedLinkId);
    const targetIndex = categoryLinks.findIndex(link => link.id === targetLinkId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const updatedCategoryLinks = [...categoryLinks];
    const [draggedItem] = updatedCategoryLinks.splice(draggedIndex, 1);
    updatedCategoryLinks.splice(targetIndex, 0, draggedItem);
    
    // 更新createdAt时间以保持新顺序
    const now = Date.now();
    const updatedWithNewTime = updatedCategoryLinks.map((link, index) => ({
      ...link,
      createdAt: now - index // 确保新顺序
    }));
    
    const allLinks = [...otherLinks, ...updatedWithNewTime];
    updateData(allLinks, categories);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
    setDraggedLink(null);
  };

  const toggleSorting = (categoryId: string) => {
    if (!authToken) { 
      setIsAuthOpen(true); 
      return; 
    }
    
    if (sortingCategoryId === categoryId) {
      // 完成排序
      setSortingCategoryId(null);
      setDraggedLink(null);
    } else {
      // 开始排序
      setSortingCategoryId(categoryId);
    }
  };

  // --- Filtering & Memo ---

  // Helper to check if a category is "Locked" (Has password AND not unlocked)
  const isCategoryLocked = (catId: string) => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.password) return false;
      return !unlockedCategoryIds.has(catId);
  };

  const pinnedLinks = useMemo(() => {
      // Don't show pinned links if they belong to a locked category
      return links.filter(l => l.pinned && !isCategoryLocked(l.categoryId));
  }, [links, categories, unlockedCategoryIds]);

  // Home view: links grouped by category
  const homeViewCategories = useMemo(() => {
    return categories
      .filter(cat => !isCategoryLocked(cat.id))
      .map(cat => {
        const catLinks = links
          .filter(l => l.categoryId === cat.id && !l.pinned)
          .sort((a, b) => b.createdAt - a.createdAt);
        
        // 如果当前正在对这个分类进行排序，显示全部链接
        // 否则只显示前6个链接
        const isSorting = sortingCategoryId === cat.id;
        const displayLinks = isSorting ? catLinks : catLinks.slice(0, 6);
        
        return {
          ...cat,
          links: displayLinks,
          totalLinks: catLinks.length,
          hasMore: catLinks.length > 6 && !isSorting, // 排序模式下不显示"查看全部"
          isSorting: isSorting
        };
      })
      .filter(cat => cat.totalLinks > 0); // 只显示有链接的分类
  }, [links, categories, unlockedCategoryIds, sortingCategoryId]);

  const displayedLinks = useMemo(() => {
    let result = links;
    
    // Security Filter: Always hide links from locked categories
    result = result.filter(l => !isCategoryLocked(l.categoryId));

    // Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return result.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
    }

    // Category Filter
    if (selectedCategory !== 'home') {
      result = result.filter(l => l.categoryId === selectedCategory);
    }
    
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [links, selectedCategory, searchQuery, categories, unlockedCategoryIds]);


  // --- Render Components ---

  const renderLinkCard = (link: LinkItem, isSortingMode: boolean = false) => (
    <div
        key={link.id}
        className={`group relative flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-lg transition-all duration-200 min-w-0 ${isSortingMode ? 'cursor-move' : 'cursor-pointer hover:-translate-y-0.5'}`}
        draggable={isSortingMode}
        onDragStart={(e) => isSortingMode && handleDragStart(e, link.id)}
        onDragOver={(e) => isSortingMode && handleDragOver(e)}
        onDragLeave={(e) => isSortingMode && handleDragLeave(e)}
        onDrop={(e) => isSortingMode && handleDrop(e, link.id)}
        onDragEnd={(e) => isSortingMode && handleDragEnd(e)}
    >
        {/* 排序手柄 - 只在排序模式下显示 */}
        {isSortingMode && (
          <div className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-blue-500 cursor-grab active:cursor-grabbing mr-1">
            <GripVertical size={16} />
          </div>
        )}
        
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center gap-3 min-w-0"
          onClick={(e) => {
            if (isSortingMode) {
              e.preventDefault();
            }
          }}
        >
          {/* Compact Icon */}
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold uppercase shrink-0 flex-shrink-0">
              {link.icon ? <img src={link.icon} alt="" className="w-5 h-5"/> : link.title.charAt(0)}
          </div>
          
          {/* Text Content - 加宽文本区域 */}
          <div className="flex-1 min-w-0 overflow-hidden">
              <h3 className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {link.title}
              </h3>
              {link.description && (
                <div className="tooltip-custom absolute left-0 -top-8 w-max max-w-[200px] bg-black text-white text-xs p-2 rounded opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all z-20 pointer-events-none truncate">
                    {link.description}
                </div>
              )}
          </div>
        </a>

        {/* Hover Actions - 只在登录状态且非排序模式下显示 */}
        {authToken && !isSortingMode && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 bg-white/90 dark:bg-slate-800/90 pl-2">
              <button 
                  onClick={(e) => togglePin(link.id, e)}
                  className={`p-1 rounded-md transition-colors ${link.pinned ? 'text-blue-500 bg-blue-50' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  title="置顶"
              >
                  <Pin size={13} className={link.pinned ? "fill-current" : ""} />
              </button>
              <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingLink(link); setIsModalOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                  title="编辑"
              >
                  <Edit2 size={13} />
              </button>
              <button 
                  onClick={(e) => handleDeleteLink(link.id, e)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                  title="删除"
              >
                  <Trash2 size={13} />
              </button>
          </div>
        )}
    </div>
  );

  const renderCategoryBlock = (category: any) => {
    const isSortingMode = sortingCategoryId === category.id;
    
    return (
      <section key={category.id} className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Icon name={category.icon} size={16} />
            </div>
            <h3 className="text-lg font-semibold dark:text-slate-200">
              {category.name}
            </h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              ({category.totalLinks})
            </span>
            
            {/* 排序按钮 - 只在登录状态显示 */}
            {authToken && category.totalLinks > 0 && (
              <button
                onClick={() => toggleSorting(category.id)}
                className={`ml-2 p-1.5 rounded-lg transition-colors ${
                  isSortingMode 
                    ? 'bg-blue-500 text-white hover:bg-blue-600' 
                    : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title={isSortingMode ? "完成排序" : "排序"}
              >
                {isSortingMode ? <Save size={16} /> : <GripVertical size={16} />}
              </button>
            )}
          </div>
          
          {category.hasMore && !isSortingMode && (
            <button
              onClick={() => handleCategoryClick(category)}
              className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
            >
              查看全部 →
            </button>
          )}
        </div>
        
        {isSortingMode && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm rounded-lg flex items-center gap-2">
            <GripVertical size={16} />
            <span>拖拽链接卡片进行排序，完成后点击上方的保存按钮</span>
          </div>
        )}
        
        {category.links.length > 0 ? (
          // 响应式网格布局：手机端一行显示2个，平板3个，电脑4-5个
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {category.links.map(link => renderLinkCard(link, isSortingMode))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            暂无链接
          </div>
        )}
      </section>
    );
  };


  return (
    <div className="flex h-screen overflow-hidden text-slate-900 dark:text-slate-50">
      
      <AuthModal isOpen={isAuthOpen} onLogin={handleLogin} />
      
      <CategoryAuthModal 
        isOpen={!!catAuthModalData}
        category={catAuthModalData}
        onClose={() => setCatAuthModalData(null)}
        onUnlock={handleUnlockCategory}
      />

      <CategoryManagerModal 
        isOpen={isCatManagerOpen} 
        onClose={() => setIsCatManagerOpen(false)}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategory={handleDeleteCategory}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        links={links}
        categories={categories}
        onRestore={handleRestoreBackup}
        webDavConfig={webDavConfig}
        onSaveWebDavConfig={handleSaveWebDavConfig}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLinks={links}
        categories={categories}
        onImport={handleImportConfirm}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={aiConfig}
        onSave={handleSaveAIConfig}
        links={links}
        onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
        siteName={siteName} // 传递网站名称
        onSiteNameChange={handleSiteNameChange} // 传递修改网站名称的回调
      />

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
          bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              {siteName}
            </span>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            <button
              onClick={() => { setSelectedCategory('home'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                selectedCategory === 'home' 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="p-1"><Home size={18} /></div>
              <span>主页</span>
            </button>
            
            <div className="flex items-center justify-between pt-4 pb-2 px-4">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">分类目录</span>
               <button 
                  onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsCatManagerOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  title="管理分类"
               >
                  <Settings size={14} />
               </button>
            </div>

            {categories.map(cat => {
                const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                      selectedCategory === cat.id 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${selectedCategory === cat.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {isLocked ? <Lock size={16} className="text-amber-500" /> : <Icon name={cat.icon} size={16} />}
                    </div>
                    <span className="truncate flex-1 text-left">{cat.name}</span>
                    {selectedCategory === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                  </button>
                );
            })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsImportModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="导入书签"
                >
                    <Upload size={14} />
                    <span>导入</span>
                </button>
                
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsBackupModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="备份与恢复"
                >
                    <CloudCog size={14} />
                    <span>备份</span>
                </button>

                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsSettingsModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="设置"
                >
                    <Settings size={14} />
                    <span>设置</span>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-xs px-2 mt-2">
               <div className="flex items-center gap-1 text-slate-400">
                 {syncStatus === 'saving' && <Loader2 className="animate-spin w-3 h-3 text-blue-500" />}
                 {syncStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                 {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                 {authToken ? <span className="text-green-600">已同步</span> : <span className="text-amber-500">离线</span>}
               </div>

               <a 
                 href={GITHUB_REPO_URL} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                 title="Fork this project on GitHub"
               >
                 <GitFork size={14} />
                 <span>Fork 项目</span>
               </a>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden relative">
        
        {/* Header */}
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300">
              <Menu size={24} />
            </button>

            {/* 手机版搜索框 - 始终显示 */}
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-full bg-slate-100 dark:bg-slate-700/50 border-none text-sm focus:ring-2 focus:ring-blue-500 dark:text-white placeholder-slate-400 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* 登录/登出按钮 - 使用不同图标和颜色区分 */}
            {!authToken ? (
              <button 
                onClick={() => setIsAuthOpen(true)} 
                className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
                title="登录"
              >
                <LogIn size={18} className="text-blue-500" />
                <span className="hidden sm:inline text-sm font-medium text-blue-500">登录</span>
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
                title="退出登录"
              >
                <User size={18} className="text-green-500" />
                <span className="hidden sm:inline text-sm font-medium text-green-500">已登录</span>
              </button>
            )}

            <button
              onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(undefined); setIsModalOpen(true); }}}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-full text-sm font-medium shadow-lg shadow-blue-500/30"
            >
              <Plus size={16} /> <span className="hidden sm:inline">添加</span>
            </button>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8">
            
            {/* 1. Pinned Area (Custom Top Area) */}
            {pinnedLinks.length > 0 && !searchQuery && selectedCategory === 'home' && (
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <Pin size={16} className="text-blue-500 fill-blue-500" />
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            置顶 / 常用
                        </h2>
                    </div>
                    {/* 响应式网格布局：手机端一行显示2个，平板3个，电脑4-6个 */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {pinnedLinks.map(link => renderLinkCard(link))}
                    </div>
                </section>
            )}

            {/* 2. Main Content */}
            {selectedCategory === 'home' && !searchQuery ? (
                // Home Page View - Show by Category
                <section>
                    {homeViewCategories.length > 0 ? (
                        <>
                            {homeViewCategories.map(cat => renderCategoryBlock(cat))}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            <Home size={40} className="opacity-30 mb-4" />
                            <p className="mb-2">暂无内容</p>
                            <button 
                                onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsModalOpen(true); }} 
                                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                添加第一个链接
                            </button>
                        </div>
                    )}
                </section>
            ) : (
                // Category or Search View
                <section>
                     {(!pinnedLinks.length && !searchQuery && selectedCategory === 'home') && (
                        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg flex items-center justify-between">
                             <div>
                                <h1 className="text-xl font-bold">早安 👋</h1>
                                <p className="text-sm opacity-90 mt-1">
                                    {links.length} 个链接 · {categories.length} 个分类
                                </p>
                             </div>
                             <Icon name="Compass" size={48} className="opacity-20" />
                        </div>
                     )}

                     <div className="flex items-center justify-between mb-4">
                         <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                             {selectedCategory === 'home' 
                                ? (searchQuery ? '搜索结果' : '所有链接') 
                                : (
                                    <>
                                        {categories.find(c => c.id === selectedCategory)?.name}
                                        {isCategoryLocked(selectedCategory) && <Lock size={14} className="text-amber-500" />}
                                    </>
                                )
                             }
                         </h2>
                     </div>

                     {displayedLinks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            {isCategoryLocked(selectedCategory) ? (
                                <>
                                    <Lock size={40} className="text-amber-400 mb-4" />
                                    <p>该目录已锁定</p>
                                    <button onClick={() => setCatAuthModalData(categories.find(c => c.id === selectedCategory) || null)} className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg">输入密码解锁</button>
                                </>
                            ) : (
                                <>
                                    <Search size={40} className="opacity-30 mb-4" />
                                    <p>没有找到相关内容</p>
                                    {selectedCategory !== 'home' && (
                                        <button onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsModalOpen(true); }} className="mt-4 text-blue-500 hover:underline">添加一个?</button>
                                    )}
                                </>
                            )}
                        </div>
                     ) : (
                        // 响应式网格布局：手机端一行显示2个，平板3个，电脑4-6个
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {displayedLinks.map(link => renderLinkCard(link))}
                        </div>
                     )}
                </section>
            )}
        </div>
      </main>

      <LinkModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }}
        onSave={editingLink ? handleEditLink : handleAddLink}
        categories={categories}
        initialData={editingLink || (prefillLink as LinkItem)}
        aiConfig={aiConfig}
      />
    </div>
  );
}

export default App;