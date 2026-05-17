export interface TrackingEvent {
  id?: string;
  sessionId: string;
  eventType: 'page_view' | 'click_school' | 'view_duration' | 'ai_consultation';
  timestamp: string;
  details?: Record<string, any>;
}

export interface UniversityData {
  name: string;
  country: string;
  majorCategory: string; // e.g., '工程技术', '自然科学', '商科'
  majorSpecific: string; // e.g., 'EECS / 物理'
  year: number;
  rankingSource: string; // e.g., 'QS', 'USNews', 'ARWU'
  currentRank?: number;
  previousRank?: number;
  
  // 7 核心维度
  research: number;       // 学术研究与产出影响力
  reputation: number;     // 主观声誉与同行评价
  teaching: number;       // 教学质量与师资密度
  international: number;  // 国际化程度与多元生态
  industry: number;       // 工业界转化与创收
  roi: number;            // 财务性价比
  career: number;         // 就业粘性

  createdAt?: string;
  updatedAt?: string;
}
