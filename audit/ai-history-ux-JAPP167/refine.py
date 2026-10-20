from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source'
for p in[S/'app/js/app.js',H/'prepare.py']:
 s=p.read_text(encoding='utf-8').replace('Открытый разговор и черновик сохранены.','Открытый разговор и текст в поле остались на месте.').replace("setAiHistoryStatus('Новый диалог. Можно написать сообщение.');","setAiHistoryStatus(aiAccessGranted === true ? 'Новый диалог. Можно написать сообщение.' : 'Новый диалог. Для отправки нужен доступ к AI.');")
 s=s.replace("  aiHistoryLoading = true; setAiHistoryStatus('Загружаем историю…');", "  const restoreFocus = ['ai-access-refresh','ai-history-retry'].includes(document.activeElement.id);\n  aiHistoryLoading = true; setAiHistoryStatus('Загружаем историю…');")
 s=s.replace("finally { if (current()) { aiHistoryLoading = false; renderAiChat(); } }", "finally { if (current()) { aiHistoryLoading = false; renderAiChat(); if (restoreFocus && currentScreen === 'ai-chat') document.getElementById('ai-access-refresh').focus({preventScroll:true}); } }")
 p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
