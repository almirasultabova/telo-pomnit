/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BodySchema } from './components/BodySchema';
import { SensationPicker } from './components/SensationPicker';
import { BodyZone, SensationType, DiaryEntry, BodyView, BodyDepth } from './constants';
import { GoogleGenAI } from "@google/genai";
import { 
  ChevronLeft, 
  ChevronRight, 
  History, 
  Plus, 
  CheckCircle2, 
  Flame, 
  Calendar as CalendarIcon,
  TrendingUp,
  Map as MapIcon,
  Settings,
  ShieldCheck,
  Bell,
  Sparkles,
  Share2,
  Download,
  Info
} from 'lucide-react';

type Screen = 'main' | 'sensation' | 'note' | 'confirm' | 'history' | 'analytics' | 'settings' | 'ai_insights' | 'share';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [screen, setScreen] = useState<Screen>('main');
  const [view, setView] = useState<BodyView>('front');
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [selectedSensation, setSelectedSensation] = useState<SensationType | null>(null);
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [streak, setStreak] = useState(0);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [depth, setDepth] = useState<BodyDepth>('surface');

  useEffect(() => {
    fetchEntries();
    fetchHeatmap();
    fetchSummary();
  }, []);

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/entries');
      const data = await res.json();
      setEntries(data);
      calculateStreak(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHeatmap = async () => {
    try {
      const res = await fetch('/api/stats/heatmap');
      const data = await res.json();
      const map: Record<string, number> = {};
      data.forEach((item: any) => {
        map[item.zone_id] = item.count;
      });
      setHeatmap(map);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/stats/summary');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error(err);
    }
  };

  const calculateStreak = (data: DiaryEntry[]) => {
    if (data.length === 0) return;
    let currentStreak = 0;
    const today = new Date().toISOString().split('T')[0];
    const dates = [...new Set(data.map(e => e.date.split(' ')[0]))].sort().reverse();
    
    let checkDate = today;
    for (const date of dates) {
      if (date === checkDate) {
        currentStreak++;
        const d = new Date(checkDate);
        d.setDate(d.getDate() - 1);
        checkDate = d.toISOString().split('T')[0];
      } else if (date < checkDate) {
        break;
      }
    }
    setStreak(currentStreak);
  };

  const generateAiInsight = async () => {
    if (entries.length < 3) {
      setAiInsight("Нужно хотя бы 3 записи для анализа вашей динамики.");
      return;
    }
    setIsAiLoading(true);
    try {
      const historyText = entries.slice(0, 10).map(e => `- ${e.date}: ${e.zone_id} (${e.sensation_id}, ${e.depth === 'deep' ? 'глубинное' : 'поверхностное'}). Заметка: ${e.note || 'нет'}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Проанализируй историю телесных ощущений пользователя за последнее время и дай краткий экспертный совет (2-3 предложения) в поддерживающем тоне. Обрати внимание на глубину ощущений (поверхностные vs глубинные). История:\n${historyText}`,
      });
      setAiInsight(response.text);
    } catch (err) {
      console.error(err);
      setAiInsight("Не удалось получить совет от ИИ. Попробуйте позже.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedZone || !selectedSensation) return;

    const entry = {
      zone_id: selectedZone.id,
      sensation_id: selectedSensation.id,
      note,
      view,
      depth
    };

    try {
      await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      setScreen('confirm');
      fetchEntries();
      fetchHeatmap();
      fetchSummary();
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setSelectedZone(null);
    setSelectedSensation(null);
    setNote('');
    setScreen('main');
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f5f5f0] flex flex-col relative overflow-hidden font-sans">
      {/* Header */}
      <header className="p-6 flex justify-between items-center z-10">
        <div onClick={() => setScreen('main')} className="cursor-pointer">
          <h1 className="serif text-3xl font-medium text-[#5A5A40]">Body Diary</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-stone-400 font-bold">Mindful Somatics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-white/50">
            <Flame size={14} className="text-orange-500 fill-orange-500" />
            <span className="text-xs font-bold text-stone-700">{streak}</span>
          </div>
          <button 
            onClick={() => setScreen('settings')}
            className="p-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm border border-white/50 text-stone-400 hover:text-[#5A5A40] transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pb-28 overflow-y-auto">
        <AnimatePresence mode="wait">
          {screen === 'main' && (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[40px] p-8 shadow-2xl shadow-stone-200/50 border border-white/50 relative overflow-hidden">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="serif text-2xl text-stone-800">Где фокус внимания?</h2>
                    <div className="flex items-center gap-4 mt-2">
                      <button 
                        onClick={() => setDepth('surface')}
                        className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full transition-all ${depth === 'surface' ? 'bg-[#5A5A40] text-white' : 'bg-stone-100 text-stone-400'}`}
                      >
                        Поверхность
                      </button>
                      <button 
                        onClick={() => setDepth('deep')}
                        className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full transition-all ${depth === 'deep' ? 'bg-[#5A5A40] text-white' : 'bg-stone-100 text-stone-400'}`}
                      >
                        Глубина
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => setView(view === 'front' ? 'back' : 'front')}
                    className="p-3 rounded-2xl bg-stone-50 text-stone-400 hover:bg-[#5A5A40] hover:text-white transition-all duration-300"
                  >
                    <MapIcon size={20} />
                  </button>
                </div>
                
                <BodySchema 
                  view={view} 
                  onZoneSelect={(zone) => {
                    setSelectedZone(zone);
                    setScreen('sensation');
                  }}
                  heatmapData={heatmap}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setScreen('history')}
                  className="bg-white p-6 rounded-[32px] shadow-sm border border-white/50 flex flex-col items-center gap-3 group hover:shadow-md transition-all"
                >
                  <div className="p-3 rounded-2xl bg-stone-50 text-stone-400 group-hover:bg-[#5A5A40] group-hover:text-white transition-all">
                    <History size={24} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 group-hover:text-stone-600">История</span>
                </button>
                <button 
                  onClick={() => setScreen('analytics')}
                  className="bg-white p-6 rounded-[32px] shadow-sm border border-white/50 flex flex-col items-center gap-3 group hover:shadow-md transition-all"
                >
                  <div className="p-3 rounded-2xl bg-stone-50 text-stone-400 group-hover:bg-[#5A5A40] group-hover:text-white transition-all">
                    <TrendingUp size={24} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 group-hover:text-stone-600">Динамика</span>
                </button>
              </div>

              {/* AI Insight Teaser */}
              <button 
                onClick={() => {
                  setScreen('ai_insights');
                  generateAiInsight();
                }}
                className="w-full bg-gradient-to-br from-[#5A5A40] to-[#454530] p-6 rounded-[32px] text-white flex items-center justify-between group overflow-hidden relative"
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-amber-300" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Expert Insight</span>
                  </div>
                  <p className="serif text-lg text-left">Что говорит ваше тело?</p>
                </div>
                <ChevronRight size={24} className="opacity-50 group-hover:translate-x-1 transition-transform relative z-10" />
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
              </button>
            </motion.div>
          )}

          {screen === 'sensation' && (
            <motion.div
              key="sensation"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('main')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">Характер ощущения</h2>
              </div>

              <div className="bg-white rounded-[40px] p-8 shadow-xl border border-white/50">
                <div className="mb-8 flex items-center gap-4 p-4 bg-stone-50 rounded-2xl">
                  <div className="w-1.5 h-10 bg-[#5A5A40] rounded-full" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Выбранная зона</p>
                    <p className="text-[#5A5A40] font-bold text-lg">{selectedZone?.name}</p>
                  </div>
                </div>
                <SensationPicker 
                  selectedId={selectedSensation?.id}
                  onSelect={(s) => {
                    setSelectedSensation(s);
                    setScreen('note');
                  }}
                />
              </div>
            </motion.div>
          )}

          {screen === 'note' && (
            <motion.div
              key="note"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('sensation')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">Контекст (опционально)</h2>
              </div>

              <div className="bg-white rounded-[40px] p-8 shadow-xl border border-white/50 space-y-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Ваша заметка</p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Что происходило в этот момент? Какие мысли или эмоции сопровождали это ощущение?"
                    className="w-full h-48 p-6 rounded-3xl bg-stone-50 border-none focus:ring-2 focus:ring-[#5A5A40]/10 resize-none text-stone-700 placeholder:text-stone-300 text-sm leading-relaxed"
                  />
                </div>
                
                <button
                  onClick={handleSave}
                  className="w-full bg-[#5A5A40] text-white py-5 rounded-full font-bold shadow-xl shadow-[#5A5A40]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                >
                  Завершить запись
                  <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center space-y-8"
            >
              <div className="relative">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-28 h-28 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center relative z-10"
                >
                  <CheckCircle2 size={56} />
                </motion.div>
                <div className="absolute inset-0 bg-emerald-200 blur-3xl opacity-20 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="serif text-3xl text-stone-800">Запись сохранена</h2>
                <p className="text-stone-400 max-w-[260px] mx-auto leading-relaxed">Вы сделали важный шаг к пониманию своего тела. Продолжайте в том же духе!</p>
              </div>
              <button
                onClick={resetForm}
                className="bg-[#5A5A40] text-white px-10 py-4 rounded-full font-bold shadow-lg shadow-[#5A5A40]/20 active:scale-95 transition-all"
              >
                Вернуться на главную
              </button>
            </motion.div>
          )}

          {screen === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('main')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">Архив записей</h2>
              </div>

              <div className="space-y-4">
                {entries.length === 0 ? (
                  <div className="text-center py-24 bg-white/50 rounded-[40px] border border-dashed border-stone-200">
                    <CalendarIcon size={48} className="mx-auto mb-4 text-stone-200" />
                    <p className="text-stone-400 font-medium">История пока пуста</p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <motion.div 
                      key={entry.id} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white p-6 rounded-[32px] shadow-sm border border-white/50 flex gap-5 hover:shadow-md transition-shadow"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center text-[#5A5A40] shrink-0">
                        <MapIcon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-stone-800 truncate">{entry.zone_id}</h3>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] text-stone-400 uppercase font-bold tracking-widest bg-stone-50 px-2 py-1 rounded-md">
                              {new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className={`text-[7px] uppercase font-black tracking-tighter px-1 rounded ${entry.depth === 'deep' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-500'}`}>
                              {entry.depth === 'deep' ? 'Deep' : 'Surface'}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-stone-500 mb-3 font-medium">{entry.sensation_id}</p>
                        {entry.note && (
                          <p className="text-xs italic text-stone-400 border-l-2 border-stone-100 pl-4 py-1 leading-relaxed">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {screen === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setScreen('main')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                    <ChevronLeft size={20} />
                  </button>
                  <h2 className="serif text-2xl">Ваша динамика</h2>
                </div>
                <button 
                  onClick={() => setScreen('share')}
                  className="p-2.5 rounded-full bg-white shadow-sm border border-white/50 text-[#5A5A40]"
                >
                  <Share2 size={20} />
                </button>
              </div>

              <div className="bg-white rounded-[40px] p-8 shadow-xl border border-white/50 space-y-10">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-8 text-center">Карта интенсивности</h3>
                  <BodySchema 
                    view="front" 
                    onZoneSelect={() => {}}
                    heatmapData={heatmap}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-stone-50 rounded-[28px] space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Топ зона</p>
                    <p className="text-sm text-[#5A5A40] font-bold truncate">{summary?.topZone || '...'}</p>
                  </div>
                  <div className="p-5 bg-stone-50 rounded-[28px] space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Топ ощущение</p>
                    <p className="text-sm text-[#5A5A40] font-bold truncate">{summary?.topSensation || '...'}</p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setScreen('ai_insights');
                    generateAiInsight();
                  }}
                  className="w-full py-4 rounded-full border-2 border-[#5A5A40] text-[#5A5A40] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#5A5A40] hover:text-white transition-all"
                >
                  <Sparkles size={18} />
                  Получить AI-анализ
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'ai_insights' && (
            <motion.div
              key="ai_insights"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('main')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">AI Insights</h2>
              </div>

              <div className="bg-gradient-to-br from-[#5A5A40] to-[#3a3a2a] rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden">
                <Sparkles size={40} className="absolute -top-4 -right-4 opacity-10 rotate-12" />
                
                <div className="relative z-10 space-y-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                      <Sparkles size={20} className="text-amber-300" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Expert Analysis</p>
                      <p className="font-bold">Gemini Intelligence</p>
                    </div>
                  </div>

                  <div className="min-h-[160px] flex flex-col justify-center">
                    {isAiLoading ? (
                      <div className="space-y-4 animate-pulse">
                        <div className="h-4 bg-white/10 rounded-full w-full" />
                        <div className="h-4 bg-white/10 rounded-full w-5/6" />
                        <div className="h-4 bg-white/10 rounded-full w-4/6" />
                      </div>
                    ) : (
                      <p className="serif text-xl leading-relaxed italic opacity-90">
                        {aiInsight || "Загрузка анализа..."}
                      </p>
                    )}
                  </div>

                  <div className="pt-6 border-t border-white/10 flex items-center gap-3">
                    <Info size={16} className="opacity-50" />
                    <p className="text-[10px] opacity-50 leading-tight">
                      Этот анализ носит ознакомительный характер и не является медицинской рекомендацией.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('main')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">Настройки</h2>
              </div>

              <div className="space-y-4">
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-white/50 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-stone-50 text-stone-400">
                        <Bell size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-stone-800">Напоминания</p>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Утренний и вечерний чек-ап</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-stone-100 rounded-full relative p-1 cursor-pointer">
                      <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-stone-50 text-stone-400">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-stone-800">Приватность</p>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Данные хранятся локально</p>
                      </div>
                    </div>
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-white/50">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-4">О приложении</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Body Diary — это ваш персональный инструмент для развития телесной осознанности. 
                    Регулярная фиксация ощущений помогает лучше понимать сигналы своего тела и вовремя реагировать на стресс или напряжение.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'share' && (
            <motion.div
              key="share"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('analytics')} className="p-2.5 rounded-full bg-white shadow-sm border border-white/50">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="serif text-2xl">Поделиться</h2>
              </div>

              <div className="bg-white rounded-[40px] p-10 shadow-2xl border border-white/50 flex flex-col items-center space-y-8 text-center">
                <div className="w-full aspect-square bg-[#f5f5f0] rounded-[32px] p-8 flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-6 left-6">
                    <h4 className="serif text-xl text-[#5A5A40]">Body Diary</h4>
                    <p className="text-[8px] uppercase tracking-widest text-stone-400 font-bold">Weekly Summary</p>
                  </div>
                  <BodySchema view="front" onZoneSelect={() => {}} heatmapData={heatmap} />
                  <div className="mt-4 flex gap-4">
                    <div className="text-center">
                      <p className="text-[8px] font-bold uppercase text-stone-400">Streak</p>
                      <p className="text-lg font-bold text-[#5A5A40]">{streak} days</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] font-bold uppercase text-stone-400">Entries</p>
                      <p className="text-lg font-bold text-[#5A5A40]">{entries.length}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 w-full">
                  <button className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-bold flex items-center justify-center gap-2">
                    <Download size={20} />
                    Сохранить как фото
                  </button>
                  <button className="w-full py-4 rounded-full border-2 border-stone-100 text-stone-400 font-bold text-sm">
                    Скопировать ссылку
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      {screen === 'main' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-8 bg-gradient-to-t from-[#f5f5f0] via-[#f5f5f0] to-transparent z-20">
          <button 
            onClick={() => setScreen('main')}
            className="w-full bg-[#5A5A40] text-white py-5 rounded-full font-bold shadow-2xl shadow-[#5A5A40]/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <Plus size={24} />
            Новая запись
          </button>
        </nav>
      )}
    </div>
  );
}
