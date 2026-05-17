import { UniversityData } from './types';

export const MOCK_API_DATA: UniversityData[] = [
  // 2026 QS Data
  { id: 'ucb_26qs', name: 'UC Berkeley', country: '美国', majorCategory: '工程技术', majorSpecific: 'EECS / 物理', year: 2026, rankingSource: 'QS', research: 99, reputation: 98, teaching: 85, international: 88, industry: 96, roi: 45, career: 95 },
  { id: 'uiuc_26qs', name: 'UIUC', country: '美国', majorCategory: '工程技术', majorSpecific: '计算机 / EE', year: 2026, rankingSource: 'QS', research: 92, reputation: 88, teaching: 82, international: 75, industry: 85, roi: 70, career: 92 },
  { id: 'gt_26qs', name: 'Georgia Tech', country: '美国', majorCategory: '工程技术', majorSpecific: '航天 / EE', year: 2026, rankingSource: 'QS', research: 93, reputation: 90, teaching: 80, international: 70, industry: 90, roi: 80, career: 98 },
  { id: 'ox_26qs', name: 'Cambridge', country: '英国', majorCategory: '自然科学', majorSpecific: '自然科学 / 跨学科', year: 2026, rankingSource: 'QS', research: 99, reputation: 100, teaching: 99, international: 98, industry: 88, roi: 75, career: 88 },
  { id: 'ic_26qs', name: 'Imperial College', country: '英国', majorCategory: '工程技术', majorSpecific: '航天 / 物理 / 计算机', year: 2026, rankingSource: 'QS', research: 97, reputation: 96, teaching: 92, international: 99, industry: 90, roi: 65, career: 95 },
  { id: 'poly_26qs', name: 'l\'X (巴黎综合理工)', country: '法国', majorCategory: '自然科学', majorSpecific: '纯数 / 理论物理', year: 2026, rankingSource: 'QS', research: 96, reputation: 90, teaching: 99, international: 85, industry: 90, roi: 90, career: 80 },
  { id: 'tud_26qs', name: 'TU Delft', country: '荷兰', majorCategory: '工程技术', majorSpecific: '航空航天 / 土木', year: 2026, rankingSource: 'QS', research: 92, reputation: 88, teaching: 85, international: 94, industry: 92, roi: 85, career: 90 },
  { id: 'nus_26qs', name: 'NUS', country: '新加坡', majorCategory: '综合类', majorSpecific: 'EE / 物理 / 计算机', year: 2026, rankingSource: 'QS', research: 94, reputation: 96, teaching: 88, international: 99, industry: 85, roi: 60, career: 88 },
  { id: 'utoronto_26qs', name: 'U of Toronto', country: '加拿大', majorCategory: '工程技术', majorSpecific: '工程科学', year: 2026, rankingSource: 'QS', research: 95, reputation: 92, teaching: 85, international: 96, industry: 84, roi: 65, career: 88 },
  { id: 'tsinghua_26qs', name: '清华大学', country: '中国', majorCategory: '工程技术', majorSpecific: '计算机 / 电子体系', year: 2026, rankingSource: 'QS', research: 96, reputation: 92, teaching: 90, international: 65, industry: 98, roi: 95, career: 98 },
  { id: 'eth_26qs', name: 'ETH Zurich', country: '瑞士', majorCategory: '自然科学', majorSpecific: '工程 / 物理 / 建筑', year: 2026, rankingSource: 'QS', research: 100, reputation: 98, teaching: 95, international: 96, industry: 90, roi: 92, career: 92 },

  // 2025 USNews Data to demonstrate filtering
  { id: 'ucb_25usn', name: 'UC Berkeley', country: '美国', majorCategory: '工程技术', majorSpecific: 'EECS / 物理', year: 2025, rankingSource: 'USNews', research: 100, reputation: 99, teaching: 82, international: 70, industry: 90, roi: 45, career: 92 },
  { id: 'mit_25usn', name: 'MIT', country: '美国', majorCategory: '工程技术', majorSpecific: '全工程学科', year: 2025, rankingSource: 'USNews', research: 100, reputation: 100, teaching: 95, international: 85, industry: 100, roi: 85, career: 100 },
];
