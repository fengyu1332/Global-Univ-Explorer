import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { UniversityData } from '../types';
import { Filter, Sparkles, Info, Search, ChevronDown, Check, Target, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const DIMENSIONS = [
  { key: 'research', label: '学术研究与产出影响力' },
  { key: 'reputation', label: '主观声誉与同行评价' },
  { key: 'teaching', label: '教学质量与师资密度' },
  { key: 'international', label: '国际化程度与多元生态' },
  { key: 'industry', label: '工业界转化与创收' },
  { key: 'roi', label: '财务性价比' },
  { key: 'career', label: '就业粘性' }
] as const;

export default function StudentPortal({ data }: { data: UniversityData[] }) {
  const sources = useMemo(() => Array.from(new Set(data.map(d => `${d.year}-${d.rankingSource}`))), [data]);
  const countries = useMemo(() => Array.from(new Set(data.map(d => d.country))), [data]);
  const majors = useMemo(() => Array.from(new Set(data.map(d => d.majorCategory))), [data]);

  const [selectedSource, setSelectedSource] = useState(sources[0] || '');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedMajor, setSelectedMajor] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [consultantReview, setConsultantReview] = useState<string>('');
  const [isReviewLoading, setIsReviewLoading] = useState<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const prevSelectedUnivRef = useRef<UniversityData | null>(null);

  useEffect(() => {
    import('../lib/analytics').then(({ trackEvent }) => {
      trackEvent('page_view', { path: '/student-portal' });
    });
  }, []);

  const processedData = useMemo(() => {
    let filtered = data.filter(d => `${d.year}-${d.rankingSource}` === selectedSource);
    if (selectedCountries.length > 0) filtered = filtered.filter(d => selectedCountries.includes(d.country));
    if (selectedMajor !== 'all') filtered = filtered.filter(d => d.majorCategory === selectedMajor);
    
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(query) ||
        d.country.toLowerCase().includes(query) ||
        d.majorCategory.toLowerCase().includes(query) ||
        d.majorSpecific.toLowerCase().includes(query)
      );
    }

    return filtered.map(u => {
      const score = DIMENSIONS.reduce((sum: number, dim) => sum + (Number(u[dim.key as keyof typeof u]) || 0), 0) / DIMENSIONS.length;
      return { ...u, finalScore: score.toFixed(1) };
    }).sort((a, b) => {
      const rankA = a.currentRank || Infinity;
      const rankB = b.currentRank || Infinity;
      if (rankA !== Infinity || rankB !== Infinity) {
        return rankA - rankB;
      }
      return parseFloat(b.finalScore) - parseFloat(a.finalScore);
    });
  }, [data, selectedSource, selectedCountries, selectedMajor, searchQuery]);

  useEffect(() => {
    if (processedData.length > 0 && !processedData.find(d => d.id === selectedId)) {
      setSelectedId(processedData[0].id);
    }
  }, [processedData, selectedId]);

  const selectedUniv = processedData.find(u => u.id === selectedId);

  useEffect(() => {
    if (!selectedUniv) {
      setConsultantReview('');
    } else {
      setConsultantReview('');
    }

    import('../lib/analytics').then(({ trackEvent }) => {
      const now = Date.now();
      if (prevSelectedUnivRef.current && prevSelectedUnivRef.current.id !== selectedUniv?.id) {
        const durationSeconds = (now - startTimeRef.current) / 1000;
        trackEvent('view_duration', { 
          schoolId: prevSelectedUnivRef.current.id, 
          schoolName: prevSelectedUnivRef.current.name, 
          durationSeconds 
        });
      }

      if (selectedUniv && prevSelectedUnivRef.current?.id !== selectedUniv.id) {
        trackEvent('click_school', { schoolId: selectedUniv.id, schoolName: selectedUniv.name });
      }

      startTimeRef.current = now;
      prevSelectedUnivRef.current = selectedUniv || null;
    });
  }, [selectedUniv?.id]);

  const handleGenerateReview = async () => {
    if (!selectedUniv) return;
    
    setIsReviewLoading(true);
    setConsultantReview('');

    try {
      let promptTemplate = localStorage.getItem('admin_ai_prompt');
      if (!promptTemplate) {
        promptTemplate = `你是一名经验丰富的专业留学顾问。请为学生介绍 {schoolName} (位于 {country}，专业领域: {majorCategory} / {majorSpecific})。
请提供最实际、最有效、最有价值的以下信息：这所学校的基本情况介绍、优势专业介绍、所在城市介绍、所属国家介绍、申请难度介绍、毕业难度介绍、毕业就业机会介绍等等申请者关注的话题。
要求：
- 作为一名经验丰富的专业留学顾问的角度
- 语言风格：专业、精炼、直击痛点
- 整体字数控制在600字以内，保持简介明了`;
      }
      
      const prompt = promptTemplate
        .replace(/{schoolName}/g, selectedUniv.name || '')
        .replace(/{country}/g, selectedUniv.country || '')
        .replace(/{majorCategory}/g, selectedUniv.majorCategory || '')
        .replace(/{majorSpecific}/g, selectedUniv.majorSpecific || '');

      const response = await fetch('/api/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          contents: prompt
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate review');
      
      setConsultantReview(data.text || '暂无内容');
      import('../lib/analytics').then(({ trackEvent }) => {
        trackEvent('ai_consultation', { schoolId: selectedUniv.id, schoolName: selectedUniv.name, promptLength: prompt.length });
      });
    } catch (e: any) {
      console.error("Failed to generate review:", e);
      setConsultantReview('获取顾问观点失败，请检查网络或刷新重试。' + (e.message ? ` (${e.message})` : ''));
    } finally {
      setIsReviewLoading(false);
    }
  };

  const radarData = selectedUniv ? DIMENSIONS.map(d => {
    const rawVal = Number(selectedUniv[d.key as keyof typeof selectedUniv]) || 0;
    return {
      subject: d.label.split('与')[0],
      A: rawVal,
      raw: rawVal
    };
  }) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      {/* 1. 上方：定制评估模型 */}
      <div className="w-full flex-shrink-0 bg-surface-container-lowest border-b border-surface-dim z-10 flex flex-col">
        <div className="p-4 lg:p-6 border-b border-surface-dim bg-surface-container-lowest flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold flex items-center gap-2 text-chocolate">
            <Filter size={20} className="text-primary" /> 定制评估模型
          </h2>
        </div>
        <div className="p-4 lg:p-6 flex flex-col lg:flex-row gap-6 lg:items-end flex-wrap overflow-visible">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-chocolate-light mb-2">搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3 text-chocolate-light" />
              <input 
                type="text" 
                placeholder="搜索院校、专业、国家..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-vellum border border-surface-dim rounded-xl pl-10 pr-4 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate transition-all hover:bg-surface-container-lowest"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
             <label className="block text-[10px] font-bold uppercase tracking-widest text-chocolate-light mb-2">排名基准</label>
             <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)} className="w-full bg-vellum border border-surface-dim rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate h-[42px]">
               {sources.map(s => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
             </select>
          </div>
          <div className="flex-1 min-w-[200px] relative">
             <label className="block text-[10px] font-bold uppercase tracking-widest text-chocolate-light mb-2">国家/地区</label>
             <div className="relative">
                <button
                  type="button"
                  onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                  className="w-full bg-vellum border border-surface-dim rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate text-left flex justify-between items-center h-[42px]"
                >
                  <span className="truncate">
                    {selectedCountries.length > 0 ? selectedCountries.join(', ') : '所有国家/地区'}
                  </span>
                  <ChevronDown size={16} className={`transition-transform flex-shrink-0 ${countryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {countryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCountryDropdownOpen(false)}></div>
                    <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-surface-container-lowest border border-surface-dim rounded-xl shadow-lg max-h-60 overflow-y-auto p-2">
                      <div 
                        onClick={() => {
                          setSelectedCountries([]);
                          setCountryDropdownOpen(false);
                        }}
                        className={`px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${selectedCountries.length === 0 ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-vellum text-chocolate'}`}
                      >
                        所有国家/地区
                      </div>
                      {countries.map(c => (
                        <div
                          key={c}
                          onClick={() => setSelectedCountries(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                          className={`px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors flex items-center justify-between ${selectedCountries.includes(c) ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-vellum text-chocolate'}`}
                        >
                          {c}
                          {selectedCountries.includes(c) && <Check size={16} />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
             </div>
          </div>
          <div className="flex-1 min-w-[200px]">
             <label className="block text-[10px] font-bold uppercase tracking-widest text-chocolate-light mb-2">顶尖专业</label>
             <select value={selectedMajor} onChange={e => setSelectedMajor(e.target.value)} className="w-full bg-vellum border border-surface-dim rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate h-[42px]">
               <option value="all">不限</option>
               {majors.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
          </div>
        </div>
      </div>

      {/* 底部两列 */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden w-full">
        {/* 2. 左侧：推荐名单列表 */}
        <div className="w-full lg:w-1/2 flex-shrink-0 bg-background border-b lg:border-b-0 lg:border-r border-surface-dim h-[45vh] lg:h-full flex flex-col">
          <div className="p-6 border-b border-surface-dim bg-surface-container-lowest sticky top-0 z-10 flex justify-between items-center flex-shrink-0">
            <h3 className="font-serif font-bold text-xl text-chocolate">智能推荐名单</h3>
            <span className="px-3 py-1 bg-surface-container text-primary rounded-full text-xs font-bold font-sans shadow-sm">共 {processedData.length} 所</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
            {processedData.map((u, i) => (
               <div 
                 key={u.id}
                 onClick={() => setSelectedId(u.id)}
                 className={`p-5 rounded-[20px] transition-all cursor-pointer flex justify-between items-center group relative overflow-hidden ${
                   selectedId === u.id 
                   ? 'bg-surface-container border-2 border-primary/40 shadow-sm' 
                   : 'bg-surface-container-lowest border border-surface-dim hover:bg-vellum hover:border-primary/30 shadow-sm'
                 }`}
               >
                 {selectedId === u.id && (
                   <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
                 )}
                 <div className="flex-1 min-w-0 pr-4">
                   <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                     <div className="font-serif font-bold text-lg text-chocolate truncate">{u.name}</div>
                     <span className="text-[10px] font-bold px-2 py-0.5 bg-background border border-surface-dim rounded-full text-chocolate-light uppercase flex-shrink-0">{u.country}</span>
                   </div>
                   <div className="text-xs text-chocolate-light flex items-center gap-2 font-medium bg-vellum border border-surface-dim px-2 py-1 rounded-md inline-flex max-w-full">
                     {(u.currentRank || u.previousRank) && (
                       <div className="flex items-center gap-1 border-r border-surface-dim pr-2 mr-1">
                         <span className="text-primary font-bold">#{u.currentRank || '-'}</span>
                         {u.previousRank && <span className="opacity-50 line-through text-[10px] scale-90">#{u.previousRank}</span>}
                       </div>
                     )}
                     <Target size={12} className="text-primary flex-shrink-0" />
                     <span className="truncate">{u.majorSpecific}</span>
                   </div>
                 </div>
                 <div className="text-right flex-shrink-0 flex flex-col items-end">
                   <div className="text-2xl font-black text-primary font-serif leading-none mb-1">{u.finalScore}</div>
                   <div className="text-[10px] font-bold text-primary-dark opacity-70 uppercase tracking-widest mt-0.5">综合评分</div>
                 </div>
               </div>
            ))}
            {processedData.length === 0 && (
              <div className="absolute inset-4 border-2 border-dashed border-surface-dim rounded-[var(--radius-card)] flex items-center justify-center text-center p-6 text-chocolate-light bg-surface-container-lowest">
                未找到符合当前约束条件的院校，请放宽筛选标准。
              </div>
            )}
          </div>
        </div>

        {/* 3. 右侧：单校详情视窗 */}
        <div className="w-full lg:w-1/2 bg-surface-container-lowest h-auto lg:h-full overflow-y-auto">
          {selectedUniv ? (
            <div className="p-6 lg:p-10 mx-auto flex flex-col h-full max-w-3xl">
              <div className="flex flex-col gap-8 items-stretch">
                {/* 雷达图区块 */}
                <div className="flex-1 bg-background rounded-[32px] shadow-ambient border border-surface-dim p-8 flex flex-col items-center justify-center relative min-h-[400px]">
                  <div className="absolute top-6 left-6 inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest rounded-md font-bold text-[10px] uppercase tracking-widest text-chocolate shadow-sm border border-surface-dim">
                    基准: {selectedUniv.rankingSource} {selectedUniv.year}
                  </div>
                  <div className="text-center mb-6 mt-8">
                    <div className="font-serif text-3xl xl:text-4xl font-bold text-chocolate mb-3">
                      {selectedUniv.currentRank && <span className="text-primary mr-3 text-2xl">#{selectedUniv.currentRank}</span>}
                      {selectedUniv.name}
                    </div>
                    <div className="text-chocolate-light font-medium tracking-wide flex items-center justify-center gap-2">
                      <span className="px-3 py-1 bg-surface-dim rounded-full text-xs font-bold text-chocolate shadow-sm">{selectedUniv.country}</span>
                      <span className="opacity-50">/</span>
                      <span>{selectedUniv.majorCategory}</span>
                    </div>
                  </div>
                  <div className="w-full flex-1 min-h-[250px] max-h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                        <PolarGrid stroke="#e9d6cc" strokeDasharray="3 3" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#705a49', fontSize: 12, fontWeight: 700, fontFamily: 'inter, sans-serif' }} />
                        <Radar name="Score" dataKey="A" stroke="#e67e22" strokeWidth={3} fill="#e67e22" fillOpacity={0.25} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 数据条形图区块 */}
                <div className="w-full flex flex-col gap-6">
                  <div className="bg-background rounded-[32px] shadow-ambient border border-surface-dim p-8 flex-1">
                    <h4 className="font-serif font-bold text-xl text-chocolate mb-8 flex items-center gap-2 border-b border-surface-dim pb-4">
                      <Sparkles size={20} className="text-primary" /> 七维精细评分
                    </h4>
                    <div className="space-y-4">
                      {DIMENSIONS.map((dim) => {
                        const rawVal = Number(selectedUniv[dim.key as keyof typeof selectedUniv]) || 0;
                        return (
                        <div key={dim.key} className="flex items-center group">
                          <span className="text-sm font-bold text-chocolate-light w-36 flex-shrink-0 group-hover:text-chocolate transition-colors">{dim.label}</span>
                          <div className="flex items-center gap-4 flex-1">
                            <div className="flex-1 h-2.5 bg-vellum rounded-full overflow-hidden shadow-inner border border-surface-dim border-opacity-50">
                              <div className="h-full bg-gradient-to-r from-[#ffb783] to-[#e67e22] rounded-full transition-all duration-500 ease-out" style={{ width: `${rawVal}%` }} />
                            </div>
                            <span className="font-serif font-bold text-base text-chocolate w-12 text-right bg-surface-container px-1 py-0.5 rounded shadow-sm">{rawVal}</span>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>

                  {/* 专家观点区块 */}
                  <div className="bg-surface-container-high rounded-[24px] border border-surface-dim p-6 relative overflow-hidden shadow-sm">
                     <div className="absolute top-0 left-0 w-1.5 h-full bg-purple"></div>
                     <div className="font-bold flex items-center justify-between gap-2 mb-4 text-chocolate tracking-wide text-sm">
                       <span className="flex items-center gap-2">
                         <Info size={16} className="text-purple" /> 顾问观点
                       </span>
                       <button 
                         onClick={handleGenerateReview}
                         disabled={isReviewLoading}
                         className="flex items-center gap-1.5 px-3 py-1.5 bg-purple text-white hover:bg-purple/90 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                       >
                         {isReviewLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                         {isReviewLoading ? '生成中...' : 'AI名校顾问讲解'}
                       </button>
                     </div>
                     <div className="text-chocolate-light text-sm leading-relaxed font-medium">
                       {isReviewLoading ? (
                         <div className="animate-pulse flex flex-col gap-2">
                           <div className="h-4 bg-surface-dim rounded w-3/4"></div>
                           <div className="h-4 bg-surface-dim rounded w-full"></div>
                           <div className="h-4 bg-surface-dim rounded w-5/6"></div>
                           <div className="h-4 bg-surface-dim rounded w-1/2"></div>
                         </div>
                       ) : consultantReview ? (
                         <div className="markdown-body w-full">
                           <ReactMarkdown>{consultantReview}</ReactMarkdown>
                         </div>
                       ) : (
                         <div className="text-center py-6 text-chocolate-light/70">
                           点击「AI名校顾问讲解」按钮，获取专属选校建议
                         </div>
                       )}
                     </div>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-chocolate-light font-medium flex-col p-10 text-center">
              <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-6">
                <Target size={32} className="text-primary-dim opacity-50" />
              </div>
              <p className="font-serif text-2xl text-chocolate mb-2">欢迎使用全球院校探索系统</p>
              <p>请上方选择基准、国家与专业，并在左侧列表点击查看院校详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
