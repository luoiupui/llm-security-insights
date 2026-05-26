/**
 * Runtime translation dictionary keyed by exact English source string.
 * Languages: ja (Japanese), ko (Korean), zh (Chinese, Simplified),
 *            haw (Hawaiian — Pacific island), alien (cipher, see translator).
 *
 * Unknown strings fall back to English (or are ciphered for `alien`).
 * Match is case-sensitive, trim-tolerant. Keys should be the exact UI string.
 */

export type LangCode = "en" | "ja" | "ko" | "zh" | "haw" | "alien";

export const LANGUAGES: { code: LangCode; label: string; native: string; flag: string }[] = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "ja", label: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "zh", label: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "haw", label: "Pacific Island", native: "ʻŌlelo Hawaiʻi", flag: "🌺" },
  { code: "alien", label: "Unknown Alien", native: "ⱯᒪIƎN", flag: "👽" },
];

type Row = Partial<Record<Exclude<LangCode, "en" | "alien">, string>>;

export const DICTIONARY: Record<string, Row> = {
  // ── Sidebar / nav ──
  "Overview": { ja: "概要", ko: "개요", zh: "概览", haw: "ʻIke Nui" },
  "Data Ingestion": { ja: "データ取込", ko: "데이터 수집", zh: "数据采集", haw: "Hoʻokomo ʻIkepili" },
  "KG Construction": { ja: "KG構築", ko: "KG 구축", zh: "知识图谱构建", haw: "Kūkulu KG" },
  "Attribution": { ja: "帰属分析", ko: "귀속 분석", zh: "归因分析", haw: "Hoʻopili Kumu" },
  "Experiments": { ja: "実験", ko: "실험", zh: "实验", haw: "Hoʻāʻo" },
  "Threat Feed": { ja: "脅威フィード", ko: "위협 피드", zh: "威胁信息流", haw: "Hānai Pōʻino" },
  "Implementation Log": { ja: "実装ログ", ko: "구현 로그", zh: "实施日志", haw: "Moʻolelo Hana" },
  "GitHub Sync": { ja: "GitHub同期", ko: "GitHub 동기화", zh: "GitHub 同步", haw: "Hoʻonohonoho GitHub" },
  "Settings": { ja: "設定", ko: "설정", zh: "设置", haw: "Hoʻonohonoho" },

  // ── Header / chrome ──
  "SYSTEM ACTIVE": { ja: "システム稼働中", ko: "시스템 활성", zh: "系统运行中", haw: "PŪNAEWELE OLA" },
  "SIMULATION — synthetic data only": { ja: "シミュレーション — 合成データのみ", ko: "시뮬레이션 — 합성 데이터 전용", zh: "模拟 — 仅合成数据", haw: "HOʻOHĀLIKE — ʻikepili kūhohonu wale nō" },
  "CTI": { ja: "サイバー脅威", ko: "사이버 위협", zh: "网络威胁", haw: "CTI" },
  "Clinical": { ja: "臨床", ko: "임상", zh: "临床", haw: "Lāʻau Lapaʻau" },
  "Language": { ja: "言語", ko: "언어", zh: "语言", haw: "ʻŌlelo" },
  "Domain": { ja: "ドメイン", ko: "도메인", zh: "领域", haw: "Kāhua" },

  // ── Common UI verbs / nouns ──
  "Run": { ja: "実行", ko: "실행", zh: "运行", haw: "Hoʻokō" },
  "Run agent": { ja: "エージェント実行", ko: "에이전트 실행", zh: "运行代理", haw: "Hoʻokō ʻElele" },
  "Running...": { ja: "実行中...", ko: "실행 중...", zh: "运行中...", haw: "Ke holo nei..." },
  "Reset": { ja: "リセット", ko: "초기화", zh: "重置", haw: "Hoʻōla hou" },
  "Save": { ja: "保存", ko: "저장", zh: "保存", haw: "Mālama" },
  "Cancel": { ja: "キャンセル", ko: "취소", zh: "取消", haw: "Hoʻopau" },
  "Submit": { ja: "送信", ko: "제출", zh: "提交", haw: "Hāʻawi" },
  "Download": { ja: "ダウンロード", ko: "다운로드", zh: "下载", haw: "Hoʻoiho" },
  "Upload": { ja: "アップロード", ko: "업로드", zh: "上传", haw: "Hoʻouka" },
  "Export": { ja: "エクスポート", ko: "내보내기", zh: "导出", haw: "Hoʻopuka" },
  "Import": { ja: "インポート", ko: "가져오기", zh: "导入", haw: "Hoʻokomo" },
  "Search": { ja: "検索", ko: "검색", zh: "搜索", haw: "Huli" },
  "Loading...": { ja: "読み込み中...", ko: "로딩 중...", zh: "加载中...", haw: "Ke hoʻouka nei..." },
  "Error": { ja: "エラー", ko: "오류", zh: "错误", haw: "Hewa" },
  "Success": { ja: "成功", ko: "성공", zh: "成功", haw: "Holomua" },
  "Status": { ja: "ステータス", ko: "상태", zh: "状态", haw: "Kūlana" },
  "Details": { ja: "詳細", ko: "세부 정보", zh: "详情", haw: "Kikoʻī" },
  "Description": { ja: "説明", ko: "설명", zh: "描述", haw: "Wehewehe" },
  "Name": { ja: "名前", ko: "이름", zh: "名称", haw: "Inoa" },
  "Type": { ja: "タイプ", ko: "유형", zh: "类型", haw: "ʻAno" },
  "Source": { ja: "ソース", ko: "출처", zh: "来源", haw: "Kumu" },
  "Target": { ja: "ターゲット", ko: "대상", zh: "目标", haw: "Pahuhopu" },
  "Confidence": { ja: "信頼度", ko: "신뢰도", zh: "置信度", haw: "Hilinaʻi" },
  "Score": { ja: "スコア", ko: "점수", zh: "评分", haw: "Helu" },
  "Result": { ja: "結果", ko: "결과", zh: "结果", haw: "Hopena" },
  "Results": { ja: "結果", ko: "결과", zh: "结果", haw: "Nā Hopena" },
  "Summary": { ja: "概要", ko: "요약", zh: "摘要", haw: "Pōkole" },
  "Report": { ja: "レポート", ko: "보고서", zh: "报告", haw: "Hōʻike" },
  "Reports": { ja: "レポート", ko: "보고서", zh: "报告", haw: "Nā Hōʻike" },
  "Generate": { ja: "生成", ko: "생성", zh: "生成", haw: "Hoʻoulu" },
  "Generating...": { ja: "生成中...", ko: "생성 중...", zh: "生成中...", haw: "Ke hoʻoulu nei..." },
  "Refresh": { ja: "更新", ko: "새로 고침", zh: "刷新", haw: "Hoʻomaʻemaʻe" },
  "Open": { ja: "開く", ko: "열기", zh: "打开", haw: "Wehe" },
  "Close": { ja: "閉じる", ko: "닫기", zh: "关闭", haw: "Pani" },
  "Copy": { ja: "コピー", ko: "복사", zh: "复制", haw: "Kope" },
  "Copied": { ja: "コピーしました", ko: "복사됨", zh: "已复制", haw: "Ua kope ʻia" },
  "View": { ja: "表示", ko: "보기", zh: "查看", haw: "Nānā" },
  "Edit": { ja: "編集", ko: "편집", zh: "编辑", haw: "Hoʻololi" },
  "Delete": { ja: "削除", ko: "삭제", zh: "删除", haw: "Holoi" },
  "Add": { ja: "追加", ko: "추가", zh: "添加", haw: "Hoʻohui" },
  "Remove": { ja: "削除", ko: "제거", zh: "移除", haw: "Wehe" },
  "Yes": { ja: "はい", ko: "예", zh: "是", haw: "ʻAe" },
  "No": { ja: "いいえ", ko: "아니오", zh: "否", haw: "ʻAʻole" },
  "All": { ja: "すべて", ko: "전체", zh: "全部", haw: "Pau" },
  "None": { ja: "なし", ko: "없음", zh: "无", haw: "ʻAʻohe" },

  // ── Domain-specific common labels ──
  "Threat Intelligence": { ja: "脅威インテリジェンス", ko: "위협 인텔리전스", zh: "威胁情报", haw: "ʻIke Pōʻino" },
  "Knowledge Graph": { ja: "知識グラフ", ko: "지식 그래프", zh: "知识图谱", haw: "Kiʻi ʻIke" },
  "Entity": { ja: "エンティティ", ko: "엔티티", zh: "实体", haw: "Mea" },
  "Entities": { ja: "エンティティ", ko: "엔티티", zh: "实体", haw: "Nā Mea" },
  "Relation": { ja: "関係", ko: "관계", zh: "关系", haw: "Pilina" },
  "Relations": { ja: "関係", ko: "관계", zh: "关系", haw: "Nā Pilina" },
  "Triple": { ja: "トリプル", ko: "트리플", zh: "三元组", haw: "Pākolu" },
  "Triples": { ja: "トリプル", ko: "트리플", zh: "三元组", haw: "Nā Pākolu" },
  "Pipeline": { ja: "パイプライン", ko: "파이프라인", zh: "流水线", haw: "ʻAuwai" },
  "Extraction": { ja: "抽出", ko: "추출", zh: "提取", haw: "Unuhi" },
  "Conflict": { ja: "矛盾", ko: "충돌", zh: "冲突", haw: "Hakakā" },
  "Conflicts": { ja: "矛盾", ko: "충돌", zh: "冲突", haw: "Nā Hakakā" },
  "Attack": { ja: "攻撃", ko: "공격", zh: "攻击", haw: "Hoʻouka Kaua" },
  "Malware": { ja: "マルウェア", ko: "악성 코드", zh: "恶意软件", haw: "Polokalamu ʻino" },
  "Vulnerability": { ja: "脆弱性", ko: "취약점", zh: "漏洞", haw: "Nāwaliwali" },
  "Threat Actor": { ja: "攻撃者", ko: "위협 행위자", zh: "威胁行为者", haw: "Mea Hana Pōʻino" },
  "Patient": { ja: "患者", ko: "환자", zh: "患者", haw: "Maʻi" },
  "Diagnosis": { ja: "診断", ko: "진단", zh: "诊断", haw: "Hoʻoholo Maʻi" },
  "Medication": { ja: "薬剤", ko: "약물", zh: "药物", haw: "Lāʻau" },

  // ── Panel / page headings ──
  "Threat Intelligence Knowledge Graph": { ja: "脅威インテリジェンス知識グラフ", ko: "위협 인텔리전스 지식 그래프", zh: "威胁情报知识图谱", haw: "Kiʻi ʻIke ʻIke Pōʻino" },
  "Multi-Source Data Ingestion": { ja: "マルチソースデータ取込", ko: "다중 소스 데이터 수집", zh: "多源数据采集", haw: "Hoʻokomo ʻIkepili Lehulehu" },
  "Knowledge Graph Construction": { ja: "知識グラフ構築", ko: "지식 그래프 구축", zh: "知识图谱构建", haw: "Kūkulu Kiʻi ʻIke" },
  "Pathway A — Agent Loop (Experimental)": { ja: "経路A — エージェントループ (実験的)", ko: "경로 A — 에이전트 루프 (실험적)", zh: "路径 A — 代理循环（实验性）", haw: "Ala A — Pōʻai ʻElele (Hoʻāʻo)" },
  "Pathway B — Deterministic Pipeline": { ja: "経路B — 決定論的パイプライン", ko: "경로 B — 결정론적 파이프라인", zh: "路径 B — 确定性流水线", haw: "Ala B — ʻAuwai Paʻa" },
  "Self-Monitoring": { ja: "セルフモニタリング", ko: "자체 모니터링", zh: "自我监控", haw: "Nānā Iā ʻOe Iho" },
  "Corpus Health": { ja: "コーパスの健全性", ko: "코퍼스 상태", zh: "语料库健康", haw: "Olakino Pukuʻi" },
  "Monitoring Events": { ja: "モニタリングイベント", ko: "모니터링 이벤트", zh: "监控事件", haw: "Hanana Nānā" },
  "KG-Bench Evaluation": { ja: "KG-Bench評価", ko: "KG-Bench 평가", zh: "KG-Bench 评估", haw: "Loiloi KG-Bench" },
  "Reproducibility Panel": { ja: "再現性パネル", ko: "재현성 패널", zh: "可重现性面板", haw: "Pāhana Hana Hou" },
  "Report Downloads": { ja: "レポートダウンロード", ko: "보고서 다운로드", zh: "报告下载", haw: "Hoʻoiho Hōʻike" },

  // ── Common short phrases ──
  "No data": { ja: "データなし", ko: "데이터 없음", zh: "无数据", haw: "ʻAʻohe ʻikepili" },
  "No results": { ja: "結果なし", ko: "결과 없음", zh: "无结果", haw: "ʻAʻohe hopena" },
  "Last updated": { ja: "最終更新", ko: "마지막 업데이트", zh: "最近更新", haw: "Hoʻolaha hope" },
  "Created at": { ja: "作成日時", ko: "생성 시각", zh: "创建时间", haw: "I hana ʻia" },
  "Active": { ja: "アクティブ", ko: "활성", zh: "活动", haw: "Ola" },
  "Inactive": { ja: "非アクティブ", ko: "비활성", zh: "非活动", haw: "ʻAʻole ola" },
  "High": { ja: "高", ko: "높음", zh: "高", haw: "Kiʻekiʻe" },
  "Medium": { ja: "中", ko: "중간", zh: "中", haw: "Waena" },
  "Low": { ja: "低", ko: "낮음", zh: "低", haw: "Haʻahaʻa" },
  "Critical": { ja: "重大", ko: "심각", zh: "严重", haw: "Koʻikoʻi" },
};

/* ── Alien cipher: ASCII letters → fictional glyph mapping ── */
const ALIEN_UPPER = "ⱯᗺↃᗡƎℲ⅁HIſꓘ⅂ƜNOԀΌᴚSꓕՈɅMXʎZ";
const ALIEN_LOWER = "ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz";
export function alienify(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += ALIEN_UPPER[code - 65];
    else if (code >= 97 && code <= 122) out += ALIEN_LOWER[code - 97];
    else out += ch;
  }
  return out;
}

export function translateString(src: string, lang: LangCode): string {
  if (lang === "en") return src;
  if (lang === "alien") return alienify(src);
  const trimmed = src.trim();
  if (!trimmed) return src;
  const row = DICTIONARY[trimmed];
  const hit = row?.[lang];
  if (hit) {
    // Preserve leading/trailing whitespace
    const lead = src.match(/^\s*/)?.[0] ?? "";
    const trail = src.match(/\s*$/)?.[0] ?? "";
    return lead + hit + trail;
  }
  return src;
}
