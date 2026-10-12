"""Reuse functional routes; confirm J302 action surfaces on three mobile widths."""
from pathlib import Path
p=Path(__file__).with_name('test-ux-hierarchy-j301.py')
s=p.read_text(encoding='utf-8')
s=s.replace("longnote='https://example.test/'+('longsegment'*30)+'\\n'+('Наблюдение за собой. '*8)","longnote='Сегодня заметила напряжение в груди. После небольшой паузы стало легче.'")
s=s.replace("f'j301-{engine}-{width}","f'j302-{engine}-{width}")
s=s.replace("'j301-hierarchy-results.json'","'j302-hierarchy-results.json'")
s=s.replace("shot(page,engine.name,width,'diary','diary')", "assert page.locator('#ai-chat-btn').evaluate(\"e=>getComputedStyle(e).backgroundColor\")=='rgb(42, 74, 56)';assert page.locator('#tab-diary .editorial-note').count()==1;assert page.locator('.diary-assistant').evaluate("e=>e.previousElementSibling.classList.contains('diary-observation-section') && e.nextElementSibling.classList.contains('diary-archive')");assert page.locator('#stop-reaction-btn').evaluate(\"e=>getComputedStyle(e,'::before').maskImage\")=='none';assert page.locator('#stop-reaction-btn').bounding_box()['height']>=100;shot(page,engine.name,width,'diary','diary')")
exec(compile(s,str(p),'exec'),{'__file__':str(p.resolve())})
