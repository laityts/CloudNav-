import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Pin, Image, Globe } from 'lucide-react';
import { LinkItem, Category, AIConfig } from '../types';
import { generateLinkDescription, suggestCategory } from '../services/geminiService';

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  categories: Category[];
  initialData?: LinkItem;
  aiConfig: AIConfig;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSave, categories, initialData, aiConfig }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'common');
  const [pinned, setPinned] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingIcon, setIsFetchingIcon] = useState(false);
  const [iconUrl, setIconUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setUrl(initialData.url);
        setDescription(initialData.description || '');
        setCategoryId(initialData.categoryId);
        setPinned(initialData.pinned || false);
        setIconUrl(initialData.icon || '');
      } else {
        setTitle('');
        setUrl('');
        setDescription('');
        setCategoryId(categories[0]?.id || 'common');
        setPinned(false);
        setIconUrl('');
      }
    }
  }, [isOpen, initialData, categories]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, url, description, categoryId, pinned, icon: iconUrl || undefined });
    onClose();
  };

  const handleAIAssist = async () => {
    if (!url || !title) return;
    if (!aiConfig.apiKey) {
        alert("请先点击侧边栏左下角设置图标配置 AI API Key");
        return;
    }

    setIsGenerating(true);
    
    // Parallel execution for speed
    try {
        const descPromise = generateLinkDescription(title, url, aiConfig);
        const catPromise = suggestCategory(title, url, categories, aiConfig);
        
        const [desc, cat] = await Promise.all([descPromise, catPromise]);
        
        if (desc) setDescription(desc);
        if (cat) setCategoryId(cat);
        
    } catch (e) {
        console.error("AI Assist failed", e);
    } finally {
        setIsGenerating(false);
    }
  };

  // 自动获取图标函数
  const fetchFavicon = async () => {
    if (!url) {
      alert("请先填写网址");
      return;
    }

    setIsFetchingIcon(true);
    
    try {
      // 尝试多种方式获取网站图标
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // 尝试多个图标源
      const iconSources = [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://favicon.yandex.net/favicon/${domain}`,
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `${urlObj.origin}/favicon.ico`,
        `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`
      ];
      
      let foundIcon = '';
      
      for (const source of iconSources) {
        try {
          const response = await fetch(source, { mode: 'no-cors' });
          // no-cors 模式下我们无法读取响应内容，但可以检查是否成功
          // 实际上我们无法通过 fetch 的 no-cors 模式获取图片，所以需要另一种方式
          // 我们可以通过创建一个 Image 对象来检查图片是否存在
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = () => resolve(source);
            img.onerror = () => reject();
            img.src = source;
          });
          foundIcon = source;
          break;
        } catch (e) {
          // 继续尝试下一个源
          continue;
        }
      }
      
      if (foundIcon) {
        setIconUrl(foundIcon);
        alert("图标获取成功！");
      } else {
        // 如果所有方法都失败，使用 fallback 方法
        // 使用 DuckDuckGo 的 favicon 服务
        const duckDuckGoIcon = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
        setIconUrl(duckDuckGoIcon);
        alert("使用默认图标源，可能不是最佳效果");
      }
    } catch (error) {
      console.error("获取图标失败:", error);
      alert("获取图标失败，请手动设置");
    } finally {
      setIsFetchingIcon(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">
            {initialData ? '编辑链接' : '添加新链接'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">标题</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="网站名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">URL 链接</label>
            <div className="flex gap-2">
                <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="https://..."
                />
                <button
                  type="button"
                  onClick={fetchFavicon}
                  disabled={isFetchingIcon || !url}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1 text-sm whitespace-nowrap"
                  title="自动获取网站图标"
                >
                  {isFetchingIcon ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Image size={16} />
                      <span className="hidden sm:inline">获取图标</span>
                    </>
                  )}
                </button>
            </div>
          </div>

          {/* 图标预览区域 */}
          {iconUrl && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div className="text-sm font-medium dark:text-slate-300">图标预览:</div>
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600 flex items-center justify-center overflow-hidden">
                <img 
                  src={iconUrl} 
                  alt="网站图标" 
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = '<span class="text-blue-500 text-sm font-bold">?</span>';
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setIconUrl('')}
                className="ml-auto text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              >
                清除图标
              </button>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium dark:text-slate-300">描述 (选填)</label>
                {(title && url) && (
                    <button
                        type="button"
                        onClick={handleAIAssist}
                        disabled={isGenerating}
                        className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                    >
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        AI 自动填写
                    </button>
                )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-20 resize-none"
              placeholder="简短描述..."
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">分类</label>
                <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                </select>
            </div>
            <div className="flex items-end pb-2">
                <button
                    type="button"
                    onClick={() => setPinned(!pinned)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                        pinned 
                        ? 'bg-blue-100 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' 
                        : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400'
                    }`}
                >
                    <Pin size={16} className={pinned ? "fill-current" : ""} />
                    <span className="text-sm font-medium">置顶</span>
                </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkModal;