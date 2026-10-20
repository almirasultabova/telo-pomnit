from pathlib import Path
H=Path(__file__).parent;p=H/'preview.py';s=p.read_text(encoding='utf-8');a="input.value='Учебный черновик первого разговора';";b=r"input.value=new URLSearchParams(location.search).get('mode')==='reading' ? 'Учебный длинный черновик. '+('Подробное описание ситуации.\\n'.repeat(80))+'Конец.' : 'Учебный черновик первого разговора';";assert a in s;p.write_text(s.replace(a,b),encoding='utf-8')
p=H/'compare.html';s=p.read_text(encoding='utf-8').replace('<nav>','<nav><a href="/review?mode=reading">Широкий ответ и длинный черновик</a> · ',1);p.write_text(s,encoding='utf-8')
