import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  Droplet,
  Thermometer,
  Plus,
  History,
  Beaker,
  LayoutDashboard,
  AlertCircle,
  CheckCircle2,
  Download,
  Save,
  Waves,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Fish,
  Settings,
  FileText,
  Image as ImageIcon,
  Edit,
  Trash2
} from 'lucide-react';

// === 配置区 ===
const RANGES = {
  temp: { min: 25, max: 27, unit: '°C', name: '温度', theme: 'orange' },
  salinity: { min: 1.024, max: 1.026, unit: 'SG', name: '盐度', theme: 'sky' },
  ph: { min: 8.0, max: 8.4, unit: '', name: 'pH', theme: 'fuchsia' },
  kh: { min: 8, max: 12, unit: 'dKH', name: '碱度 (KH)', theme: 'emerald' },
  ca: { min: 400, max: 450, unit: 'ppm', name: '钙 (Ca)', theme: 'indigo' },
  mg: { min: 1250, max: 1350, unit: 'ppm', name: '镁 (Mg)', theme: 'violet' },
  no3: { min: 0, max: 10, unit: 'ppm', name: '硝酸盐 (NO3)', theme: 'rose' },
  po4: { min: 0, max: 0.1, unit: 'ppm', name: '磷酸盐 (PO4)', theme: 'teal' }
};

const THEME_MAP = {
  orange: { themeClass: 'stat-theme-orange', stroke: '#ea580c' },
  sky: { themeClass: 'stat-theme-sky', stroke: '#0284c7' },
  fuchsia: { themeClass: 'stat-theme-fuchsia', stroke: '#c026d3' },
  emerald: { themeClass: 'stat-theme-emerald', stroke: '#059669' },
  indigo: { themeClass: 'stat-theme-indigo', stroke: '#4f46e5' },
  violet: { themeClass: 'stat-theme-violet', stroke: '#7c3aed' },
  rose: { themeClass: 'stat-theme-rose', stroke: '#e11d48' },
  teal: { themeClass: 'stat-theme-teal', stroke: '#0d9488' },
};

const STATUS_MAP = {
  high: { themeClass: 'stat-status-high', stroke: '#dc2626' },
  low: { themeClass: 'stat-status-low', stroke: '#d97706' },
  unknown: { themeClass: 'stat-status-unknown', stroke: '#94a3b8' }
};

const DASHBOARD_ITEM_KEYS = [...Object.keys(RANGES), 'note'];

const DASHBOARD_ITEM_META = {
  temp: { name: '温度', icon: Thermometer },
  salinity: { name: '盐度', icon: Droplet },
  ph: { name: 'pH', icon: Activity },
  kh: { name: '碱度 (KH)', icon: Beaker },
  ca: { name: '钙 (Ca)', icon: Beaker },
  mg: { name: '镁 (Mg)', icon: Beaker },
  no3: { name: '硝酸盐 (NO3)', icon: AlertCircle },
  po4: { name: '磷酸盐 (PO4)', icon: AlertCircle },
  note: { name: '备注', icon: FileText }
};

const DEFAULT_DASHBOARD_LAYOUT = DASHBOARD_ITEM_KEYS.map((key) => ({
  key,
  visible: true
}));

const getLocalISOString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const MAX_COVER_IMAGE_DIMENSION = 1600;
const COVER_IMAGE_QUALITY = 0.82;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解析失败'));
    image.src = src;
  });

const compressImageToDataUrl = async (file) => {
  if (!file) return '';

  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);

  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > MAX_COVER_IMAGE_DIMENSION ? MAX_COVER_IMAGE_DIMENSION / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器不支持图片压缩');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const compressedDataUrl = canvas.toDataURL(preferredType, COVER_IMAGE_QUALITY);

  return compressedDataUrl.length < originalDataUrl.length ? compressedDataUrl : originalDataUrl;
};

const renderInlineMarkdown = (text) => {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let matchIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <strong key={`strong-${matchIndex}`}>
        {match[0].slice(2, -2)}
      </strong>
    );

    lastIndex = match.index + match[0].length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderMarkdownContent = (markdownText) => {
  const lines = markdownText.split(/\r?\n/);
  const elements = [];
  let listBuffer = [];
  let paragraphBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    elements.push(
      <ul key={`list-${elements.length}`} className="advice-markdown-list">
        {listBuffer.map((item, index) => (
          <li key={`list-item-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    elements.push(
      <p key={`paragraph-${elements.length}`} className="advice-markdown-paragraph">
        {renderInlineMarkdown(paragraphBuffer.join(' '))}
      </p>
    );
    paragraphBuffer = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushParagraph();
      return;
    }

    if (line.startsWith('### ')) {
      flushList();
      flushParagraph();
      elements.push(<h3 key={`h3-${elements.length}`} className="advice-markdown-h3">{renderInlineMarkdown(line.slice(4))}</h3>);
      return;
    }

    if (line.startsWith('## ')) {
      flushList();
      flushParagraph();
      elements.push(<h2 key={`h2-${elements.length}`} className="advice-markdown-h2">{renderInlineMarkdown(line.slice(3))}</h2>);
      return;
    }

    if (line.startsWith('# ')) {
      flushList();
      flushParagraph();
      elements.push(<h1 key={`h1-${elements.length}`} className="advice-markdown-h1">{renderInlineMarkdown(line.slice(2))}</h1>);
      return;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      return;
    }

    flushList();
    paragraphBuffer.push(line);
  });

  flushList();
  flushParagraph();

  return elements;
};

// === 主组件 ===
export default function App() {
  const createDashboardLayouts = (tankList) =>
    Object.fromEntries(tankList.map((tank) => [tank.id, DEFAULT_DASHBOARD_LAYOUT.map((item) => ({ ...item }))]));

  // 核心状态
  const [tanks, setTanks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState(null);
  const [view, setView] = useState('dashboard');
  const [dashboardLayouts, setDashboardLayouts] = useState({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [loadError, setLoadError] = useState('');
  const hasHydratedRef = React.useRef(false);
  const [advicePrompt, setAdvicePrompt] = useState('');
  const [adviceResult, setAdviceResult] = useState('');
  const [adviceError, setAdviceError] = useState('');
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const adviceAbortRef = React.useRef(null);

  // 表单状态
  const [showAddTank, setShowAddTank] = useState(false);
  const [newTankName, setNewTankName] = useState('');
  const [newTankVolume, setNewTankVolume] = useState('');
  const [newTankCoverUrl, setNewTankCoverUrl] = useState('');

  const [editTankName, setEditTankName] = useState('');
  const [editTankVolume, setEditTankVolume] = useState('');
  const [editTankCoverUrl, setEditTankCoverUrl] = useState('');
  const [coverUploadError, setCoverUploadError] = useState('');

  const [editingLogId, setEditingLogId] = useState(null);
  const [deletingLogId, setDeletingLogId] = useState(null);
  const [formData, setFormData] = useState({
    date: getLocalISOString(),
    temp: '', salinity: '', ph: '', kh: '', ca: '', mg: '', no3: '', po4: '', note: ''
  });

  // 同步编辑海缸表单
  useEffect(() => {
    const tank = tanks.find(t => t.id === selectedTankId);
    if (tank) {
      setEditTankName(tank.name);
      setEditTankVolume(tank.volume);
      setEditTankCoverUrl(tank.coverUrl || '');
      setCoverUploadError('');
    }
  }, [selectedTankId, tanks]);

  useEffect(() => {
    if (selectedTankId && !tanks.some((tank) => tank.id === selectedTankId)) {
      setSelectedTankId(null);
      setView('dashboard');
    }
  }, [selectedTankId, tanks]);

  useEffect(() => {
    setAdviceResult('');
    setAdviceError('');
    if (adviceAbortRef.current) {
      adviceAbortRef.current.abort();
      adviceAbortRef.current = null;
    }
    setIsAdviceLoading(false);
  }, [selectedTankId, logs]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (cancelled) return;

        const nextTanks = Array.isArray(data.tanks) ? data.tanks : [];
        const nextLogs = Array.isArray(data.logs) ? data.logs : [];

        setTanks(nextTanks);
        setLogs(nextLogs);
        setDashboardLayouts(createDashboardLayouts(nextTanks));
        setLoadError('');
      } catch (error) {
        if (cancelled) return;
        setLoadError('数据加载失败，当前仅显示空状态。');
        setTanks([]);
        setLogs([]);
        setDashboardLayouts({});
      } finally {
        if (!cancelled) {
          hasHydratedRef.current = true;
          setIsBootstrapping(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDashboardLayouts((prev) => {
      const next = { ...prev };
      let changed = false;

      tanks.forEach((tank) => {
        if (!next[tank.id]) {
          next[tank.id] = DEFAULT_DASHBOARD_LAYOUT.map((item) => ({ ...item }));
          changed = true;
        }
      });

      Object.keys(next).forEach((tankId) => {
        if (!tanks.some((tank) => tank.id === tankId)) {
          delete next[tankId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [tanks]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;

    const saveData = async () => {
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tanks, logs })
        });
      } catch (error) {
        console.error('保存数据失败:', error);
      }
    };

    saveData();
  }, [tanks, logs]);

  // 计算属性
  const currentTankLogs = useMemo(() => {
    return logs
      .filter(log => log.tankId === selectedTankId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [logs, selectedTankId]);

  const latestParams = useMemo(() => {
    const params = { temp: null, salinity: null, ph: null, kh: null, ca: null, mg: null, no3: null, po4: null };
    for (let i = currentTankLogs.length - 1; i >= 0; i--) {
      const log = currentTankLogs[i];
      Object.keys(params).forEach(key => {
        if (params[key] === null && log[key] !== null && log[key] !== undefined && log[key] !== '') {
          params[key] = { value: log[key], date: log.date };
        }
      });
    }
    return params;
  }, [currentTankLogs]);

  const latestNote = useMemo(() => {
    for (let i = currentTankLogs.length - 1; i >= 0; i--) {
      const log = currentTankLogs[i];
      if (log.note && `${log.note}`.trim()) {
        return { value: log.note.trim(), date: log.date };
      }
    }
    return null;
  }, [currentTankLogs]);

  const latestSnapshot = useMemo(() => ({
    temp: latestParams.temp,
    salinity: latestParams.salinity,
    ph: latestParams.ph,
    kh: latestParams.kh,
    ca: latestParams.ca,
    mg: latestParams.mg,
    no3: latestParams.no3,
    po4: latestParams.po4
  }), [latestParams]);

  const latestLog = currentTankLogs.length > 0 ? currentTankLogs[currentTankLogs.length - 1] : null;

  const currentDashboardLayout = useMemo(() => {
    if (!selectedTankId) return DEFAULT_DASHBOARD_LAYOUT;
    return dashboardLayouts[selectedTankId] || DEFAULT_DASHBOARD_LAYOUT;
  }, [dashboardLayouts, selectedTankId]);

  const visibleDashboardItems = useMemo(() => {
    return currentDashboardLayout.filter((item) => item.visible);
  }, [currentDashboardLayout]);

  // 辅助函数
  const getStatus = (key, value) => {
    if (!value && value !== 0) return 'unknown';
    const numValue = parseFloat(value);
    if (numValue < RANGES[key].min) return 'low';
    if (numValue > RANGES[key].max) return 'high';
    return 'normal';
  };

  const updateCurrentDashboardLayout = (updater) => {
    if (!selectedTankId) return;

    setDashboardLayouts((prev) => {
      const currentLayout = (prev[selectedTankId] || DEFAULT_DASHBOARD_LAYOUT).map((item) => ({ ...item }));
      return {
        ...prev,
        [selectedTankId]: updater(currentLayout)
      };
    });
  };

  // 操作处理函数
  const handleAddTank = (e) => {
    e.preventDefault();
    if (!newTankName.trim()) return;
    const tankId = `t${Date.now()}`;
    setTanks([...tanks, { id: tankId, name: newTankName, volume: newTankVolume || '未知', coverUrl: newTankCoverUrl }]);
    setDashboardLayouts((prev) => ({
      ...prev,
      [tankId]: DEFAULT_DASHBOARD_LAYOUT.map((item) => ({ ...item }))
    }));
    setNewTankName(''); setNewTankVolume(''); setNewTankCoverUrl(''); setCoverUploadError(''); setShowAddTank(false);
  };

  const handleUpdateTank = (e) => {
    e.preventDefault();
    setTanks(tanks.map(t => t.id === selectedTankId ? { ...t, name: editTankName, volume: editTankVolume, coverUrl: editTankCoverUrl } : t));
    setCoverUploadError('');
    setView('dashboard');
  };

  const handleAddNewRecord = () => {
    setEditingLogId(null);
    setFormData({ date: getLocalISOString(), temp: '', salinity: '', ph: '', kh: '', ca: '', mg: '', no3: '', po4: '', note: '' });
    setView('add');
  };

  const handleEditClick = (log) => {
    setFormData({
      date: log.date, temp: log.temp ?? '', salinity: log.salinity ?? '', ph: log.ph ?? '',
      kh: log.kh ?? '', ca: log.ca ?? '', mg: log.mg ?? '', no3: log.no3 ?? '', po4: log.po4 ?? '', note: log.note ?? ''
    });
    setEditingLogId(log.id);
    setView('add');
  };

  const handleDeleteConfirm = (id) => {
    setLogs(logs.filter(log => log.id !== id));
    setDeletingLogId(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const logData = {
      id: editingLogId || Date.now(),
      tankId: selectedTankId,
      date: formData.date,
      temp: formData.temp !== '' ? parseFloat(formData.temp) : null,
      salinity: formData.salinity !== '' ? parseFloat(formData.salinity) : null,
      ph: formData.ph !== '' ? parseFloat(formData.ph) : null,
      kh: formData.kh !== '' ? parseFloat(formData.kh) : null,
      ca: formData.ca !== '' ? parseFloat(formData.ca) : null,
      mg: formData.mg !== '' ? parseFloat(formData.mg) : null,
      no3: formData.no3 !== '' ? parseFloat(formData.no3) : null,
      po4: formData.po4 !== '' ? parseFloat(formData.po4) : null,
      note: formData.note.trim(),
    };

    if (editingLogId) {
      setLogs(logs.map(log => log.id === editingLogId ? logData : log));
      setView('history');
    } else {
      setLogs([...logs, logData]);
      setView('dashboard');
    }
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ tanks, logs }, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "reef_tank_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const hasValue = (value) => value !== null && value !== undefined && value !== '';

  const getHistoryValueClass = (key, value) => {
    const isAlert = getStatus(key, value) !== 'normal' && hasValue(value);
    return `history-table-cell history-table-cell--value${isAlert ? ' history-table-cell--alert' : ''}`;
  };

  const getNavButtonClass = (targetView) => `nav-button${view === targetView ? ' nav-button--active' : ''}`;

  const handleCoverUpload = async (event, setter) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageToDataUrl(file);
      setter(dataUrl);
      setCoverUploadError('');
    } catch (error) {
      setCoverUploadError(error.message || '图片上传失败');
    } finally {
      event.target.value = '';
    }
  };

  const toggleDashboardItemVisibility = (paramKey) => {
    updateCurrentDashboardLayout((layout) =>
      layout.map((item) => (item.key === paramKey ? { ...item, visible: !item.visible } : item))
    );
  };

  const moveDashboardItem = (paramKey, direction) => {
    updateCurrentDashboardLayout((layout) => {
      const index = layout.findIndex((item) => item.key === paramKey);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (index < 0 || targetIndex < 0 || targetIndex >= layout.length) {
        return layout;
      }

      const next = [...layout];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleGenerateAdvice = async () => {
    if (isAdviceLoading) {
      adviceAbortRef.current?.abort();
      adviceAbortRef.current = null;
      setIsAdviceLoading(false);
      return;
    }

    setIsAdviceLoading(true);
    setAdviceError('');
    setAdviceResult('');

    const controller = new AbortController();
    adviceAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 70000);

    try {
      const response = await fetch('/api/advice/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          tankName: currentTank?.name,
          latestParams: latestSnapshot,
          latestNote: latestNote?.value || '',
          userPrompt: advicePrompt.trim()
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '生成建议失败');
      }

      if (!response.body) throw new Error('当前浏览器不支持流式读取');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        finalText += chunk;
        setAdviceResult(finalText);
      }

      if (!finalText.trim()) {
        throw new Error('模型没有返回建议内容。');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setAdviceError('已取消或生成超时，请稍后再试。');
      } else {
        setAdviceError(error.message || '生成建议失败');
      }
    } finally {
      clearTimeout(timeoutId);
      adviceAbortRef.current = null;
      setIsAdviceLoading(false);
    }
  };

  // === 子组件 ===
  const Sparkline = ({ data, dataKey, colorHex }) => {
    const validData = data.filter(d => d[dataKey] !== null && d[dataKey] !== undefined);
    if (validData.length < 2) return <div className="sparkline-empty">趋势数据不足</div>;

    const values = validData.map(d => parseFloat(d[dataKey]));
    const min = Math.min(...values); const max = Math.max(...values);
    const range = max - min === 0 ? 1 : max - min;
    const padding = range * 0.2;
    const graphMin = min - padding; const graphMax = max + padding;

    const width = 200; const height = 40;
    const points = validData.map((d, i) => {
      const val = parseFloat(d[dataKey]);
      const x = (i / (validData.length - 1)) * width;
      const y = height - ((val - graphMin) / (graphMax - graphMin)) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" preserveAspectRatio="none">
        <polyline fill="none" stroke={colorHex} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} className="sparkline-path" />
        <circle cx={width} cy={height - ((values[values.length - 1] - graphMin) / (graphMax - graphMin)) * height} r="4" fill={colorHex} className="sparkline-point" />
      </svg>
    );
  };

  const StatCard = ({ paramKey, paramData, icon: Icon }) => {
    const value = paramData?.value ?? null;
    const date = paramData?.date ?? null;
    const range = RANGES[paramKey];
    const status = getStatus(paramKey, value);

    let daysLeft = null; let isExpired = false;
    if (date) {
      const daysOld = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
      daysLeft = 7 - daysOld;
      isExpired = daysLeft < 0;
    }

    const colors = status === 'normal' ? THEME_MAP[range.theme] : STATUS_MAP[status];

    return (
      <div className={`stat-card ${colors.themeClass}`}>
        <div>
          <div className="stat-card-header">
            <div className="stat-card-title">
              <Icon size={18} />
              <span className="stat-card-name">{range.name}</span>
            </div>
            <div className="stat-card-status">
              <span className={`stat-card-pill ${!date ? 'stat-card-pill--empty' : isExpired ? 'stat-card-pill--expired' : 'stat-card-pill--fresh'}`}>
                {!date ? '未测试' : isExpired ? '需重测' : `剩 ${daysLeft} 天`}
              </span>
              {status === 'normal' && date ? <CheckCircle2 size={16} /> : (date && <AlertCircle size={16} />)}
            </div>
          </div>
          <div>
            <div className="stat-card-value">
              {hasValue(value) ? value : '--'}
              <span className="stat-card-unit">{range.unit}</span>
            </div>
            <div className="stat-card-meta">
              <span>理想范围: {range.min} - {range.max}</span>
              {date && <span className="stat-card-date">{new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>}
            </div>
          </div>
        </div>
        <Sparkline data={currentTankLogs} dataKey={paramKey} colorHex={colors.stroke} />
      </div>
    );
  };

  const NoteCard = ({ noteData }) => {
    const noteText = noteData?.value ?? '';
    const noteDate = noteData?.date ?? null;

    return (
      <div className="note-card">
        <div className="note-card-header">
          <div className="stat-card-title">
            <FileText size={18} />
            <span className="stat-card-name">备注</span>
          </div>
          {noteDate && <span className="note-card-date">{new Date(noteDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>}
        </div>
        <div className="note-card-body">
          {noteText ? noteText : '最近还没有填写备注信息。'}
        </div>
      </div>
    );
  };

  // === 视图渲染 ===
  if (isBootstrapping) {
    return (
      <div className="app-shell app-shell--center">
        <div className="empty-state empty-state--compact">
          <p className="empty-state-text">正在加载海缸数据...</p>
        </div>
      </div>
    );
  }

  if (!selectedTankId) {
    return (
      <div className="app-shell app-shell--center">
        <div className="container container--welcome">
          <div className="welcome-header">
            <div className="welcome-logo">
              <Waves size={48} />
            </div>
            <h1 className="brand-title">ReefTracker</h1>
            <p className="welcome-subtitle">选择你的海缸，开始记录水质</p>
            {loadError && <p className="welcome-error">{loadError}</p>}
          </div>

          <div className="tank-grid">
            {tanks.map(tank => (
              <div
                key={tank.id}
                onClick={() => setSelectedTankId(tank.id)}
                className="tank-card"
              >
                {tank.coverUrl ? (
                  <img src={tank.coverUrl} alt={`${tank.name} 封面`} className="tank-card-cover" />
                ) : (
                  <div className="tank-card-cover tank-card-cover--placeholder">
                    <Fish size={40} className="tank-card-placeholder-icon" />
                  </div>
                )}
                <div className="tank-card-body">
                  <h3 className="tank-card-title">{tank.name}</h3>
                  <p className="tank-card-volume">容量: {tank.volume}</p>
                </div>
              </div>
            ))}

            {!showAddTank ? (
              <div
                onClick={() => setShowAddTank(true)}
                className="tank-card-add"
              >
                <Plus size={36} className="tank-card-add-icon" />
                <span className="tank-card-add-label">添加新缸</span>
              </div>
            ) : (
              <form onSubmit={handleAddTank} className="tank-card-form">
                <h3 className="tank-card-form-title">创建新海缸</h3>
                <input type="text" placeholder="海缸名称" required value={newTankName} onChange={e => setNewTankName(e.target.value)} className="input input--compact" />
                <input type="text" placeholder="总水量" value={newTankVolume} onChange={e => setNewTankVolume(e.target.value)} className="input input--compact" />
                <input type="url" placeholder="封面图片 URL" value={newTankCoverUrl} onChange={e => setNewTankCoverUrl(e.target.value)} className="input input--compact" />
                <label className="upload-field upload-field--compact">
                  <span className="upload-field-label">上传封面图片</span>
                  <span className="upload-field-hint">会自动压缩到适合保存和手机访问的尺寸</span>
                  <input type="file" accept="image/*" className="upload-input" onChange={(e) => handleCoverUpload(e, setNewTankCoverUrl)} />
                </label>
                {coverUploadError && <p className="upload-error">{coverUploadError}</p>}
                {newTankCoverUrl && (
                  <div className="cover-preview cover-preview--compact">
                    <img src={newTankCoverUrl} alt="New Tank Cover Preview" className="cover-preview-image" onError={(e) => e.target.style.display = 'none'} />
                    <div className="cover-preview-fallback"><ImageIcon size={24} className="cover-preview-fallback-icon" />图片无法加载或链接无效</div>
                  </div>
                )}
                <div className="button-row button-row--auto">
                  <button type="button" onClick={() => { setShowAddTank(false); setCoverUploadError(''); }} className="btn btn-secondary btn-block">取消</button>
                  <button type="submit" className="btn btn-primary btn-block">保存</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentTank = tanks.find(t => t.id === selectedTankId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container container--main header-inner">
          <div className="header-title-row">
            <button
              onClick={() => { setSelectedTankId(null); setView('dashboard'); }}
              className="icon-button icon-button--back"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="header-brand">
              <h1 className="header-title">{currentTank?.name}</h1>
              <span className="header-kicker">ReefTracker</span>
            </div>
          </div>

          <nav className="nav-tabs">
            <button onClick={() => setView('dashboard')} className={getNavButtonClass('dashboard')}>
              <LayoutDashboard size={18} /> <span className="hide-mobile">概览</span>
            </button>
            <button onClick={() => setView('history')} className={getNavButtonClass('history')}>
              <History size={18} /> <span className="hide-mobile">历史</span>
            </button>
            <button onClick={() => setView('settings')} className={getNavButtonClass('settings')}>
              <Settings size={18} /> <span className="hide-mobile">设置</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="container container--main app-main">
        {/* 仪表盘 */}
        {view === 'dashboard' && (
          <div className="view-panel dashboard-panel">
            {currentTank?.coverUrl && (
              <>
                <div
                  className="dashboard-panel-bg"
                  style={{ backgroundImage: `url(${currentTank.coverUrl})` }}
                  aria-hidden="true"
                />
                <div className="dashboard-panel-overlay" aria-hidden="true" />
              </>
            )}

            <div className="dashboard-panel-content">
              <div className="section-header section-header--align-end">
                <h2 className="section-title">最新水质参数</h2>
                <div className="button-row">
                  <button onClick={handleAddNewRecord} className="btn btn-primary btn-sm btn-with-icon">
                    <Plus size={16} /> <span className="hide-mobile">新增记录</span>
                  </button>
                  <button onClick={exportJSON} className="btn btn-outline btn-sm btn-with-icon">
                    <Download size={16} /> <span className="hide-mobile">导出</span>
                  </button>
                </div>
              </div>

              {latestLog ? (
                visibleDashboardItems.length > 0 ? (
                  <div className="stats-grid">
                    {visibleDashboardItems.map(({ key }) => (
                      key === 'note' ? (
                        <NoteCard key={key} noteData={latestNote} />
                      ) : (
                        <StatCard
                          key={key}
                          paramKey={key}
                          paramData={latestParams[key]}
                          icon={DASHBOARD_ITEM_META[key].icon}
                        />
                      )
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact">
                    <p className="empty-state-text">当前已隐藏所有概览模块，请到设置页重新开启。</p>
                  </div>
                )
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><Activity size={32} /></div>
                  <p className="empty-state-text">这个海缸还没有任何水质记录</p>
                  <button onClick={handleAddNewRecord} className="btn btn-primary">添加第一条记录</button>
                </div>
              )}

              <section className="advice-panel">
                <div className="advice-panel-head">
                  <div>
                    <h3 className="advice-panel-title">AI 优化建议</h3>
                    <p className="advice-panel-subtitle">结合当前水质参数和最近备注，生成针对这个海缸的维护建议。</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAdvice}
                    className="btn btn-primary btn-with-icon"
                  >
                    <FileText size={18} />
                    {isAdviceLoading ? '取消生成' : '生成建议'}
                  </button>
                </div>

                <div className="advice-panel-body">
                  <label className="field-label" htmlFor="advicePrompt">补充说明</label>
                  <textarea
                    id="advicePrompt"
                    className="input textarea advice-textarea"
                    rows="3"
                    placeholder="例如：最近长藻比较快，想优先控制营养盐；或者帮我制定接下来 3 天的调整计划。"
                    value={advicePrompt}
                    onChange={(e) => setAdvicePrompt(e.target.value)}
                  />

                  {adviceError && <p className="upload-error">{adviceError}</p>}

                  <div className="advice-result">
                    {adviceResult ? (
                      <div className="advice-result-content">{renderMarkdownContent(adviceResult)}</div>
                    ) : (
                      <div className="advice-result-placeholder">
                        点击“生成建议”后，这里会显示基于当前参数的优化建议。
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* 添加/编辑表单 */}
        {view === 'add' && (
          <div className="panel-wrap panel-wrap--narrow view-panel">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">
                  {editingLogId ? <Edit size={20} className="icon-accent" /> : <Plus size={20} className="icon-accent" />}
                  {editingLogId ? '编辑数据' : '记录新数据'} ({currentTank?.name})
                </h2>
                <p className="panel-subtitle">{editingLogId ? '修改之前录入的海缸水质参数。' : '输入你今天测量的海缸水质参数。未测量的项目可以留空。'}</p>
              </div>

              <form onSubmit={handleSubmit} className="panel-form">
                <div className="form-block">
                  <label className="field-label">测试时间</label>
                  <input type="datetime-local" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input input--datetime input--half" />
                </div>

                <div className="form-grid">
                  {Object.entries(RANGES).map(([key, range]) => (
                    <div key={key} className="field-group">
                      <label className="field-label field-label--split">
                        <span>{range.name}</span>
                        <span className="field-unit">({range.unit})</span>
                      </label>
                      <input type="number" step="0.001" placeholder={`${range.min} - ${range.max}`} value={formData[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} className="input" />
                    </div>
                  ))}
                </div>

                <div className="form-block form-block--tight">
                  <label className="field-label">备注</label>
                  <textarea
                    placeholder="记录喂食、换水、添加剂、观察到的状态等"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="input textarea"
                    rows="4"
                  />
                </div>

                <div className="form-actions">
                  <button type="button" onClick={() => { setEditingLogId(null); setView(editingLogId ? 'history' : 'dashboard'); }} className="btn btn-outline">取消</button>
                  <button type="submit" className="btn btn-primary btn-with-icon"><Save size={18} /> {editingLogId ? '更新记录' : '保存记录'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 历史记录 */}
        {view === 'history' && (
          <div className="view-panel">
            <div className="section-header">
              <h2 className="section-title">历史数据</h2>
              <button onClick={handleAddNewRecord} className="btn btn-primary btn-sm btn-with-icon">
                <Plus size={16} /> <span className="hide-mobile">新增记录</span>
              </button>
            </div>
            <div className="table-panel">
              <table className="history-table">
                <thead className="history-table-head">
                  <tr>
                    <th className="history-table-cell history-table-cell--date">日期时间</th>
                    <th className="history-table-cell">温度 (°C)</th><th className="history-table-cell">盐度 (SG)</th><th className="history-table-cell">pH</th>
                    <th className="history-table-cell">KH</th><th className="history-table-cell">Ca</th><th className="history-table-cell">Mg</th>
                    <th className="history-table-cell">NO3</th><th className="history-table-cell">PO4</th><th className="history-table-cell history-table-cell--note">备注</th><th className="history-table-cell history-table-cell--center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTankLogs.slice().reverse().map((log) => (
                    <tr key={log.id} className="history-table-row">
                      <td className="history-table-cell history-table-cell--date">{new Date(log.date).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={getHistoryValueClass('temp', log.temp)}>{log.temp ?? '-'}</td>
                      <td className={getHistoryValueClass('salinity', log.salinity)}>{log.salinity ?? '-'}</td>
                      <td className={getHistoryValueClass('ph', log.ph)}>{log.ph ?? '-'}</td>
                      <td className={getHistoryValueClass('kh', log.kh)}>{log.kh ?? '-'}</td>
                      <td className={getHistoryValueClass('ca', log.ca)}>{log.ca ?? '-'}</td>
                      <td className={getHistoryValueClass('mg', log.mg)}>{log.mg ?? '-'}</td>
                      <td className={getHistoryValueClass('no3', log.no3)}>{log.no3 ?? '-'}</td>
                      <td className={getHistoryValueClass('po4', log.po4)}>{log.po4 ?? '-'}</td>
                      <td className="history-table-cell history-table-cell--note">{log.note?.trim() || '-'}</td>
                      <td className="history-table-cell history-table-cell--actions">
                        {deletingLogId === log.id ? (
                          <div className="danger-actions">
                            <button onClick={() => handleDeleteConfirm(log.id)} className="mini-btn mini-btn--danger">确认</button>
                            <button onClick={() => setDeletingLogId(null)} className="mini-btn mini-btn--neutral">取消</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => handleEditClick(log)} className="icon-action icon-action--edit" title="编辑"><Edit size={16} /></button>
                            <button onClick={() => setDeletingLogId(log.id)} className="icon-action icon-action--delete" title="删除"><Trash2 size={16} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {currentTankLogs.length === 0 && (<tr><td colSpan="11" className="history-table-empty">暂无历史记录</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 海缸设置 */}
        {view === 'settings' && (
          <div className="panel-wrap panel-wrap--narrow view-panel">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title"><Settings size={20} className="icon-accent" /> 海缸设置</h2>
                <p className="panel-subtitle">修改当前海缸的基本信息和封面图片。</p>
              </div>

              <form onSubmit={handleUpdateTank} className="panel-form">
                <div className="stack-lg">
                  <div className="field-group">
                    <label className="field-label">海缸名称</label>
                    <input type="text" required value={editTankName} onChange={(e) => setEditTankName(e.target.value)} className="input" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">总水量</label>
                    <input type="text" value={editTankVolume} onChange={(e) => setEditTankVolume(e.target.value)} className="input" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">封面图片网络链接 (URL)</label>
                    <input type="url" placeholder="https://..." value={editTankCoverUrl} onChange={(e) => setEditTankCoverUrl(e.target.value)} className="input" />
                    <label className="upload-field">
                      <span className="upload-field-label">或上传本地图片作为封面</span>
                      <span className="upload-field-hint">会自动压缩，避免封面图片过大</span>
                      <input type="file" accept="image/*" className="upload-input" onChange={(e) => handleCoverUpload(e, setEditTankCoverUrl)} />
                    </label>
                    {coverUploadError && <p className="upload-error">{coverUploadError}</p>}
                    {editTankCoverUrl && (
                      <div className="cover-preview">
                        <img src={editTankCoverUrl} alt="Cover Preview" className="cover-preview-image" onError={(e) => e.target.style.display = 'none'} />
                        <div className="cover-preview-fallback"><ImageIcon size={24} className="cover-preview-fallback-icon" />图片无法加载或链接无效</div>
                      </div>
                    )}
                  </div>
                  <div className="field-group">
                    <div className="field-label">概览模块</div>
                    <div className="dashboard-config-list">
                      {currentDashboardLayout.map((item, index) => (
                        <div key={item.key} className="dashboard-config-item">
                          <label className="dashboard-config-main">
                            <input
                              type="checkbox"
                              checked={item.visible}
                              onChange={() => toggleDashboardItemVisibility(item.key)}
                              className="dashboard-config-checkbox"
                            />
                            <span className="dashboard-config-name">{DASHBOARD_ITEM_META[item.key].name}</span>
                          </label>
                          <div className="dashboard-config-actions">
                            <button
                              type="button"
                              onClick={() => moveDashboardItem(item.key, 'up')}
                              className="icon-action icon-action--sort"
                              title="上移"
                              disabled={index === 0}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveDashboardItem(item.key, 'down')}
                              className="icon-action icon-action--sort"
                              title="下移"
                              disabled={index === currentDashboardLayout.length - 1}
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" onClick={() => { setView('dashboard'); setCoverUploadError(''); }} className="btn btn-outline">取消</button>
                  <button type="submit" className="btn btn-primary btn-with-icon"><Save size={18} /> 保存更改</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
