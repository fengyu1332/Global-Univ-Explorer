import React, { useRef, useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { UniversityData } from '../types';
import { Database, Upload, Trash2, Plus, RefreshCw, Download, Loader2, Table, Settings, Save, X, ArrowRight, BarChart2 } from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';

const DEFAULT_AI_PROMPT = `你是一名经验丰富的专业留学顾问。请为学生介绍 {schoolName} (位于 {country}，专业领域: {majorCategory} / {majorSpecific})。
请提供最实际、最有效、最有价值的以下信息：这所学校的基本情况介绍、优势专业介绍、所在城市介绍、所属国家介绍、申请难度介绍、毕业难度介绍、毕业就业机会介绍等等申请者关注的话题。
要求：
- 作为一名经验丰富的专业留学顾问的角度
- 语言风格：专业、精炼、直击痛点
- 整体字数控制在600字以内，保持简介明了`;

const SYSTEM_FIELDS: Array<{ key: keyof UniversityData | 'year' | 'currentRank' | 'previousRank' | 'research' | 'reputation' | 'teaching' | 'international' | 'industry' | 'roi' | 'career'; label: string }> = [
  { key: 'name', label: '院校名称 (必填)' },
  { key: 'country', label: '国家/地区' },
  { key: 'majorCategory', label: '专业大类' },
  { key: 'majorSpecific', label: '具体专业' },
  { key: 'year', label: '榜单年份' },
  { key: 'rankingSource', label: '榜单来源' },
  { key: 'currentRank', label: '当前排名' },
  { key: 'previousRank', label: '往期排名' },
  { key: 'research', label: '科研分数 (0-100)' },
  { key: 'reputation', label: '声誉分数 (0-100)' },
  { key: 'teaching', label: '教学分数 (0-100)' },
  { key: 'international', label: '国际化分数 (0-100)' },
  { key: 'industry', label: '行业转化 (0-100)' },
  { key: 'roi', label: 'ROI分数 (0-100)' },
  { key: 'career', label: '就业分数 (0-100)' },
];

export default function AdminDashboard({ data, setData }: { data: UniversityData[], setData: React.Dispatch<React.SetStateAction<UniversityData[]>> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [savePromptStatus, setSavePromptStatus] = useState<string | null>(null);
  
  const [mappingState, setMappingState] = useState<{ rawData: any[], headers: string[], filename: string } | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, { type: 'column'|'fixed', value: string }>>({});

  useEffect(() => {
    const savedPrompt = localStorage.getItem('admin_ai_prompt');
    if (savedPrompt) {
      setAiPrompt(savedPrompt);
    } else {
      setAiPrompt(DEFAULT_AI_PROMPT);
    }
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem('admin_ai_prompt', aiPrompt);
    setSavePromptStatus('保存成功！');
    setTimeout(() => setSavePromptStatus(null), 3000);
  };


  const datasets = useMemo(() => {
    const set = new Set(data.map(d => `${d.year}-${d.rankingSource}`));
    return Array.from(set).sort().reverse(); // sort descending (newer first)
  }, [data]);

  useEffect(() => {
    if (datasets.length > 0 && (!selectedDataset || !datasets.includes(selectedDataset))) {
      setSelectedDataset(datasets[0]);
    } else if (datasets.length === 0) {
      setSelectedDataset(null);
    }
  }, [datasets, selectedDataset]);

  const currentData = useMemo(() => {
    if (!selectedDataset) return [];
    return data.filter(d => `${d.year}-${d.rankingSource}` === selectedDataset);
  }, [data, selectedDataset]);

  const handleDeleteEntry = (id: string) => {
    setData(prev => prev.filter(d => d.id !== id));
  };

  const handleDeleteDataset = (dataset: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除数据表',
      message: `确定要删除「${dataset.replace('-', ' ')}」这整张数据表吗？此操作不可逆。`,
      onConfirm: () => {
        setData(prev => prev.filter(d => `${d.year}-${d.rankingSource}` !== dataset));
        setConfirmDialog(null);
      }
    });
  };

  const handleClearAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: '清空全部数据',
      message: '确定要清空所有院校数据吗？此操作不可逆。',
      onConfirm: () => {
        setData([]);
        setConfirmDialog(null);
      }
    });
  };

  const handleDownloadTemplate = () => {
    const template = "id,name,country,majorCategory,majorSpecific,year,rankingSource,currentRank,previousRank,research,reputation,teaching,international,industry,roi,career\ntest_1,斯坦福大学,美国,工程与技术,计算机科学,2024,QS World,2,3,98,100,95,85,100,90,95\n";
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'Data_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processWithAI = async (rawData: any[]) => {
    setAnalyzeProgress(`准备处理 ${rawData.length} 条数据...`);
    let allEntries: UniversityData[] = [];
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const CHUNK_SIZE = 30; // Reduced chunk size to prevent AI token limit truncation or dropping records
      
      for (let i = 0; i < rawData.length; i += CHUNK_SIZE) {
        const chunk = rawData.slice(i, i + CHUNK_SIZE);
        setAnalyzeProgress(`AI 处理中... (${i + 1} - ${Math.min(i + CHUNK_SIZE, rawData.length)} / ${rawData.length})`);
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `您现在是一个数据处理与高校咨询AI。请分析下方的原始榜单上传数据，并将其映射提炼为符合内部标准化字段的数组。
          
          如果原始数据缺乏某些维度（如 research, reputation, teaching, international, industry, roi, career），请基于该大学的常见客观表现、或你所拥有的知识来进行合理估算填充（0-100分）。
          如果是纯文本或缺失字段，你也需要尽可能补全。
          包含了当期排名 (currentRank) 和上一期排名 (previousRank) 可选字段，如果没有则尝试预估或置空。
          year 为整数（如缺省为当期年份），其余核心数值字段是 0-100 整数或浮点数。
          id 可以保留原有的，或生成简短的代号。
          
          【特别重要】
          输入数据包含了 ${chunk.length} 条记录。你必须返回一个严格包含 ${chunk.length} 条记录的 JSON 数组，绝不可以遗漏任何一条数据，也不要汇总。
          
          Raw Data: 
          ${JSON.stringify(chunk)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  country: { type: Type.STRING },
                  majorCategory: { type: Type.STRING },
                  majorSpecific: { type: Type.STRING },
                  year: { type: Type.INTEGER },
                  rankingSource: { type: Type.STRING },
                  currentRank: { type: Type.INTEGER },
                  previousRank: { type: Type.INTEGER },
                  research: { type: Type.NUMBER },
                  reputation: { type: Type.NUMBER },
                  teaching: { type: Type.NUMBER },
                  international: { type: Type.NUMBER },
                  industry: { type: Type.NUMBER },
                  roi: { type: Type.NUMBER },
                  career: { type: Type.NUMBER }
                },
                required: ["id", "name", "country", "majorCategory", "majorSpecific", "year", "rankingSource", "research", "reputation", "teaching", "international", "industry", "roi", "career"]
              }
            }
          }
        });

        const resultText = response.text || "[]";
        let newEntries = JSON.parse(resultText) as UniversityData[];
        
        // Ensure absolutely unique IDs and sanitize characters
        newEntries = newEntries.map(e => {
          let rawId = e.id ? e.id.toString().replace(/[^a-zA-Z0-9_\-]/g, '_') : crypto.randomUUID();
          return { 
            ...e, 
            id: (!allEntries.some(a => a.id === rawId)) ? rawId : crypto.randomUUID() 
          };
        });
        
        allEntries = [...allEntries, ...newEntries];
      }
      
      if (allEntries.length > 0) {
        setData(prev => [...prev, ...allEntries]);
        alert(`AI 解析完毕，成功映射并导入 ${allEntries.length} 条数据`);
      } else {
        alert('未解析到任何有效数据。');
      }
    } catch (err: any) {
      console.error(err);
      if (allEntries.length > 0) {
        setData(prev => [...prev, ...allEntries]);
        alert(`AI 处理中断，部分成功: 已导入 ${allEntries.length} 条数据。错误：${err.message}`);
      } else {
        alert('AI 分析失败，未导入数据。请检查格式或网络：' + err.message);
      }
    } finally {
      setAnalyzeProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const parseFileAndExecute = (file: File, callback: (data: any[]) => void) => {
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(buffer);
        
        let text = '';
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          text = utf8Decoder.decode(uint8Array);
        } catch (err) {
          const gbkDecoder = new TextDecoder('gbk');
          text = gbkDecoder.decode(uint8Array);
        }
        
        Papa.parse(text, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const rawRows = results.data as any[][];
            if (rawRows && rawRows.length > 0) {
              let headerRowIndex = 0;
              for (let i = 0; i < Math.min(20, rawRows.length); i++) {
                const row = rawRows[i] || [];
                const validCols = row.filter(cell => cell && typeof cell === 'string' && cell.trim() !== '');
                if (validCols.length >= 2) {
                  headerRowIndex = i;
                  break;
                }
              }
              const headers = (rawRows[headerRowIndex] || []).map((h, i) => (h && String(h).trim() !== '' ? String(h).trim() : `Column_${i+1}`));
              const parsedData = [];
              for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                const row = rawRows[i];
                if (!row || row.length === 0 || row.every((cell: any) => cell === undefined || cell === null || cell === '')) continue;
                const obj: any = {};
                headers.forEach((header, colIndex) => {
                  obj[header] = row[colIndex];
                });
                parsedData.push(obj);
              }
              callback(parsedData);
            } else {
              callback([]);
            }
          },
          error: (error: Error) => {
            alert(`CSV 解析边缘错误: ${error.message}`);
          }
        });
      };
      reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const jsonArr = JSON.parse(content);
          if (Array.isArray(jsonArr)) {
             callback(jsonArr);
          } else {
             alert('JSON 格式不正确：应为对象数组');
          }
        } catch (err) {
          alert('JSON 解析失败，请检查文件格式。');
        }
      };
      reader.readAsText(file);
    } else if (file.name.match(/\.(xlsx|xls)$/)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (rawRows && rawRows.length > 0) {
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(20, rawRows.length); i++) {
              const row = rawRows[i] || [];
              const validCols = row.filter(cell => cell && typeof cell === 'string' && cell.trim() !== '');
              if (validCols.length >= 2) {
                headerRowIndex = i;
                break;
              }
            }
            const headers = (rawRows[headerRowIndex] || []).map((h, i) => (h && String(h).trim() !== '' ? String(h).trim() : `Column_${i+1}`));
            const parsedData = [];
            for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
              const row = rawRows[i];
              if (!row || row.length === 0 || row.every((cell: any) => cell === undefined || cell === null || cell === '')) continue;
              const obj: any = {};
              headers.forEach((header, colIndex) => {
                obj[header] = row[colIndex];
              });
              parsedData.push(obj);
            }
            callback(parsedData);
          } else {
            callback([]);
          }
        } catch (error) {
          alert('Excel 解析失败，请检查文件格式。');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("请上传 .csv, .json 或 Excel 格式文件");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFileAndExecute(file, processWithAI);
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFileAndExecute(file, (rawData) => {
      if (!rawData || rawData.length === 0) {
        alert('文件内容为空！');
        if (directFileInputRef.current) directFileInputRef.current.value = '';
        return;
      }
      const headers = Object.keys(rawData[0]);
      
      // Auto mapping logic
      const initialMappings: Record<string, { type: 'column'|'fixed', value: string }> = {};
      SYSTEM_FIELDS.forEach(f => {
        const match = headers.find(h => {
          const hLow = h.toLowerCase();
          const kLow = f.key.toLowerCase();
          return hLow.includes(kLow) || kLow.includes(hLow) || 
                 (f.key === 'name' && (hLow.includes('institution') || hLow.includes('名称') || hLow.includes('school') || hLow.includes('院校'))) ||
                 (f.key === 'country' && (hLow.includes('location') || hLow.includes('国家') || hLow.includes('地区'))) ||
                 (f.key === 'majorCategory' && (hLow.includes('subject') || hLow.includes('大类'))) ||
                 (f.key === 'majorSpecific' && (hLow.includes('specific') || hLow.includes('专业'))) ||
                 (f.key === 'currentRank' && (hLow.includes('rank') || hLow.includes('排名'))) ||
                 (f.key === 'research' && (hLow.includes('research') || hLow.includes('citation') || hLow.includes('科研'))) ||
                 (f.key === 'reputation' && (hLow.includes('reputation') || hLow.includes('声誉'))) ||
                 (f.key === 'teaching' && (hLow.includes('teaching') || hLow.includes('师资') || hLow.includes('教学'))) ||
                 (f.key === 'international' && (hLow.includes('international') || hLow.includes('国际'))) ||
                 (f.key === 'career' && (hLow.includes('employer') || hLow.includes('就业') || hLow.includes('career'))) ||
                 (f.key === 'industry' && (hLow.includes('industry') || hLow.includes('行业'))) ||
                 (f.key === 'year' && (hLow.includes('year') || hLow.includes('年份')));
        });
        
        if (match) {
          initialMappings[f.key] = { type: 'column', value: match };
        } else {
          initialMappings[f.key] = { type: 'column', value: '' };
        }
      });
      
      // Provide reasonable defaults for fixed values
      initialMappings['rankingSource'] = { type: 'fixed', value: 'QS World' };
      if (initialMappings['year'].value === '') {
         initialMappings['year'] = { type: 'fixed', value: new Date().getFullYear().toString() };
      }
      
      setFieldMappings(initialMappings);
      setMappingState({ rawData, headers, filename: file.name });
    });
  };

  const executeMappedImport = () => {
    if (!mappingState) return;
    const { rawData } = mappingState;
    let newEntries: UniversityData[] = [];
    const currentIds = new Set(data.map(d => d.id));
    
    for (const row of rawData) {
      const getVal = (key: string) => {
        const mapping = fieldMappings[key];
        if (!mapping) return '';
        if (mapping.type === 'fixed') return mapping.value;
        return row[mapping.value] || '';
      };
      
      const rowName = getVal('name');
      if (!rowName) continue; // skip invalid rows without name
      
      const entry: UniversityData = {
        id: crypto.randomUUID(),
        name: String(rowName),
        country: String(getVal('country') || '未知'),
        majorCategory: String(getVal('majorCategory') || '通用'),
        majorSpecific: String(getVal('majorSpecific') || '-'),
        year: parseInt(String(getVal('year'))) || new Date().getFullYear(),
        rankingSource: String(getVal('rankingSource') || '自定义榜单'),
        currentRank: parseInt(String(getVal('currentRank'))) || 0,
        previousRank: parseInt(String(getVal('previousRank'))) || 0,
        research: parseFloat(String(getVal('research'))) || 0,
        reputation: parseFloat(String(getVal('reputation'))) || 0,
        teaching: parseFloat(String(getVal('teaching'))) || 0,
        international: parseFloat(String(getVal('international'))) || 0,
        industry: parseFloat(String(getVal('industry'))) || 0,
        roi: parseFloat(String(getVal('roi'))) || 0,
        career: parseFloat(String(getVal('career'))) || 0,
      };
      
      if (currentIds.has(entry.id)) {
         entry.id = crypto.randomUUID();
      }
      currentIds.add(entry.id);
      newEntries.push(entry);
    }
    
    if (newEntries.length > 0) {
      setData(prev => [...prev, ...newEntries]);
      alert(`成功导入 ${newEntries.length} 条数据`);
    } else {
      alert('未解析到有效数据，请检查字段映射。');
    }
    
    setMappingState(null);
    if (directFileInputRef.current) directFileInputRef.current.value = '';
  };

  const handleDownloadTracking = async () => {
    try {
      const q = query(collection(db, 'tracking_events'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        let timestampStr = '';
        if (data.timestamp) {
          timestampStr = new Date(data.timestamp.toDate()).toLocaleString();
        }
        return {
          id: doc.id,
          sessionId: data.sessionId || '',
          eventType: data.eventType || '',
          timestamp: timestampStr,
          details: JSON.stringify(data.details || {})
        };
      });

      if (docs.length === 0) {
        alert('暂无行为跟踪数据');
        return;
      }

      const csv = Papa.unparse(docs);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `用户行为追踪_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      console.error(e);
      alert('下载数据统计失败，可能还需要添加 Firebase 索引: ' + e.message);
    }
  };

  return (
    <div className="h-full p-6 sm:p-8 overflow-y-auto bg-background relative">
      {mappingState && (
        <div className="absolute inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4 lg:p-10 backdrop-blur-sm">
          <div className="bg-surface-container-lowest w-full max-w-5xl h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-surface-dim">
             <div className="p-6 lg:p-8 border-b border-surface-dim flex justify-between items-center bg-background">
               <div>
                 <h2 className="font-serif text-2xl font-bold text-chocolate mb-1">配置数据字段映射</h2>
                 <p className="text-sm font-medium text-chocolate-light">源文件: {mappingState.filename} (共 {mappingState.rawData.length} 条记录)</p>
               </div>
               <button onClick={() => { setMappingState(null); if (directFileInputRef.current) directFileInputRef.current.value = ''; }} className="p-2 hover:bg-surface-dim rounded-full transition-colors">
                 <X className="text-chocolate-light" size={24} />
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-surface-container-lowest">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {SYSTEM_FIELDS.map(f => {
                   const mapping = fieldMappings[f.key] || { type: 'column', value: '' };
                   return (
                     <div key={f.key} className="bg-background rounded-2xl p-5 border border-surface-dim shadow-sm flex flex-col gap-3">
                       <label className="text-sm font-bold text-chocolate">{f.label}</label>
                       
                       <div className="flex rounded-lg overflow-hidden border border-surface-dim text-xs font-medium bg-surface-container-lowest">
                         <button 
                           onClick={() => setFieldMappings(p => ({...p, [f.key]: { type: 'column', value: p[f.key]?.type === 'column' ? p[f.key].value : '' }}))}
                           className={`flex-1 py-1.5 transition-colors ${mapping.type === 'column' ? 'bg-primary text-white' : 'text-chocolate-light hover:bg-surface-dim'}`}
                         >
                           表头列映射
                         </button>
                         <button 
                           onClick={() => setFieldMappings(p => ({...p, [f.key]: { type: 'fixed', value: '' }}))}
                           className={`flex-1 py-1.5 border-l border-surface-dim transition-colors ${mapping.type === 'fixed' ? 'bg-primary text-white' : 'text-chocolate-light hover:bg-surface-dim'}`}
                         >
                           设定固定值
                         </button>
                       </div>
                       
                       {mapping.type === 'column' ? (
                         <select 
                           value={mapping.value} 
                           onChange={e => setFieldMappings(p => ({...p, [f.key]: { type: 'column', value: e.target.value }}))}
                           className="w-full bg-vellum border border-surface-dim rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate"
                         >
                           <option value="">-- 忽略此字段 (留空) --</option>
                           {mappingState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                         </select>
                       ) : (
                         <input 
                           type="text"
                           value={mapping.value}
                           onChange={e => setFieldMappings(p => ({...p, [f.key]: { type: 'fixed', value: e.target.value }}))}
                           placeholder="输入统一的固定值"
                           className="w-full bg-vellum border border-surface-dim rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate"
                         />
                       )}
                     </div>
                   )
                 })}
               </div>
             </div>
             
             <div className="p-6 border-t border-surface-dim bg-background flex justify-between items-center">
               <p className="text-sm font-medium text-chocolate-light flex items-center gap-2">
                 <ArrowRight size={16} className="text-primary" /> 
                 配置完成后，数据将被转换为标准化格式存入数据库。
               </p>
               <div className="flex gap-4">
                 <button onClick={() => { setMappingState(null); if(directFileInputRef.current) directFileInputRef.current.value = ''; }} className="px-6 py-2.5 rounded-xl text-sm font-bold text-chocolate-light hover:bg-surface-dim transition-all">
                   取消
                 </button>
                 <button onClick={executeMappedImport} className="bg-primary text-white hover:bg-primary/90 px-8 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all focus:ring-2 focus:ring-primary/50 outline-none">
                   确认导入数据
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
          <div>
            <h2 className="font-serif text-3xl font-bold text-chocolate mb-2 flex items-center gap-3">
              <Database className="w-8 h-8 text-purple" />
              榜单数据中心
            </h2>
            <p className="text-chocolate-light font-medium">集中管理各年度、各渠道的院校排名源数据，为系统提供运算核心</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleDownloadTracking} className="flex items-center gap-2 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-xl text-sm font-bold transition-all">
              <BarChart2 size={16} /> 下载用户踪迹洞察
            </button>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-surface-container-lowest border border-surface-dim hover:bg-vellum px-4 py-2 rounded-xl text-sm font-bold text-chocolate-light transition-all">
              <Download size={16} /> 格式模板
            </button>
            <button disabled={!!analyzeProgress} onClick={() => directFileInputRef.current?.click()} className="flex items-center gap-2 bg-purple text-white hover:bg-purple/90 border border-purple/10 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50">
              <Upload size={16} /> 导入异构排榜记录 (字段映射)
            </button>
            <input 
              type="file" 
              accept=".csv,.json,.xlsx,.xls" 
              className="hidden" 
              ref={directFileInputRef} 
              onChange={handleDirectFileUpload} 
            />
            <button disabled={!!analyzeProgress} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-surface-container-lowest border border-surface-dim hover:bg-vellum px-4 py-2 rounded-xl text-sm font-bold text-chocolate shadow-sm transition-all disabled:opacity-50">
              {analyzeProgress ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} 
              {analyzeProgress ? analyzeProgress : 'AI 智能解析导入'}
            </button>
            <input 
              type="file" 
              accept=".csv,.json,.xlsx,.xls" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button onClick={handleClearAll} className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all">
              <Trash2 size={16} /> 清空全部
            </button>
          </div>
        </div>

        {/* 顾问观点 Prompt 设置 */}
        <div className="mb-8 bg-surface-container-lowest border border-surface-dim rounded-[var(--radius-card)] shadow-ambient overflow-hidden">
          <div className="p-6 border-b border-surface-dim flex justify-between items-center">
            <h3 className="font-serif text-xl font-bold text-chocolate flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              顾问观点生成 Prompt 配置
            </h3>
            <button 
              onClick={handleSavePrompt}
              className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all"
            >
              <Save size={16} /> 保存配置
            </button>
          </div>
          <div className="p-6">
            <p className="text-sm font-medium text-chocolate-light mb-4">
              在此编辑生成顾问观点时传给 AI 的系统提示词 (Prompt)。您可以使用以下占位符：<br/>
              <code className="text-primary bg-surface-dim px-1.5 py-0.5 rounded mr-2">&#123;schoolName&#125;</code> (院校名称)、
              <code className="text-primary bg-surface-dim px-1.5 py-0.5 rounded mr-2">&#123;country&#125;</code> (国家/地区)、
              <code className="text-primary bg-surface-dim px-1.5 py-0.5 rounded mr-2">&#123;majorCategory&#125;</code> (专业大类)、
              <code className="text-primary bg-surface-dim px-1.5 py-0.5 rounded mr-2">&#123;majorSpecific&#125;</code> (具体专业)
            </p>
            <textarea 
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="w-full h-32 bg-background border border-surface-dim rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary/50 outline-none text-chocolate leading-relaxed resize-y"
              placeholder="请输入Prompt..."
            />
            {savePromptStatus && (
              <div className="mt-3 text-sm font-bold text-green-600 flex items-center gap-2">
                {savePromptStatus}
              </div>
            )}
            <div className="mt-4 flex justify-end">
               <button 
                 onClick={() => setAiPrompt(DEFAULT_AI_PROMPT)}
                 className="text-sm text-chocolate-light font-bold hover:text-chocolate transition-colors"
               >
                 恢复默认 Prompt
               </button>
            </div>
          </div>
        </div>

        {/* 数据表选项卡 */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
          {datasets.map(ds => (
            <div 
              key={ds} 
              onClick={() => setSelectedDataset(ds)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all border flex-shrink-0 ${
                selectedDataset === ds 
                  ? 'bg-purple text-white border-purple shadow-md' 
                  : 'bg-surface-container-lowest text-chocolate border-surface-dim hover:bg-vellum hover:border-surface-dim shadow-sm'
              }`}
            >
              <Table size={16} className={selectedDataset === ds ? 'text-white/80' : 'text-primary'} />
              {ds.replace('-', ' ')}
              {selectedDataset === ds && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteDataset(ds); }} 
                  className="ml-1 p-1 hover:bg-white/20 rounded-md transition-colors" 
                  title={`删除 ${ds.replace('-', ' ')}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {datasets.length === 0 && (
            <div className="text-sm font-bold text-chocolate-light py-2 px-4 bg-surface-container-lowest border border-surface-dim rounded-xl border-dashed">暂无任何基准数据集</div>
          )}
        </div>

        <div className="bg-surface-container-lowest border border-surface-dim rounded-[var(--radius-card)] shadow-ambient overflow-hidden">
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-vellum border-b border-surface-dim text-chocolate-light uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="px-6 py-4">基准标识</th>
                  <th className="px-6 py-4">排名 (本/上)</th>
                  <th className="px-6 py-4">院校名称</th>
                  <th className="px-6 py-4">国家</th>
                  <th className="px-6 py-4">优势领域</th>
                  <th className="px-5 py-4 text-center">学术 (0-100)</th>
                  <th className="px-5 py-4 text-center">声誉 (0-100)</th>
                  <th className="px-5 py-4 text-center">教学 (0-100)</th>
                  <th className="px-5 py-4 text-center">国际化 (0-100)</th>
                  <th className="px-5 py-4 text-center">工业 (0-100)</th>
                  <th className="px-5 py-4 text-center">ROI (0-100)</th>
                  <th className="px-5 py-4 text-center">就业 (0-100)</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim font-medium text-chocolate">
                {currentData.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-container/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-surface-dim text-chocolate-light rounded-md text-[10px] font-extrabold uppercase tracking-widest">
                        {u.year} {u.rankingSource}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-serif text-center">
                      <span className="font-bold text-base text-primary mr-2">#{u.currentRank || '-'}</span>
                      <span className="text-xs text-chocolate-light font-bold">#{u.previousRank || '-'}</span>
                    </td>
                    <td className="px-6 py-4 font-serif font-bold text-base text-chocolate truncate max-w-[200px]">{u.name}</td>
                    <td className="px-6 py-4"><span className="px-2 py-0.5 bg-background border border-surface-dim rounded-md text-xs">{u.country}</span></td>
                    <td className="px-6 py-4 text-chocolate-light truncate max-w-[150px]">{u.majorCategory} <span className="opacity-50">/</span> {u.majorSpecific}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.research}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.reputation}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.teaching}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.international}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.industry}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.roi}</td>
                    <td className="px-5 py-4 text-center font-serif text-primary truncate max-w-[60px]">{u.career}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteEntry(u.id)}
                        className="text-chocolate-light hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                        title="删除记录"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {currentData.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-chocolate-light bg-surface-container-lowest">
                      {datasets.length === 0 ? "数据库为空。请通过工具导入。" : "此榜单下暂无数据。"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-surface-dim bg-vellum flex justify-between items-center text-[10px] font-bold text-chocolate-light uppercase tracking-widest">
            <span>当前视图含 {currentData.length} 条记录 (总库: {data.length} 条)</span>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog?.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-ambient w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="font-serif text-xl font-bold text-chocolate mb-2">{confirmDialog.title}</h3>
              <p className="text-chocolate-light text-sm leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="bg-vellum px-6 py-4 flex justify-end gap-3 border-t border-surface-dim">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-chocolate-light hover:bg-surface-dim transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
