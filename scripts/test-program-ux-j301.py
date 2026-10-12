"""Program UI checks with synthetic access; no network or personal records."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'app/js/app.js').read_text(encoding='utf-8')
program=s[s.index('function renderNextMeeting(){'):s.index('function showMeetingDetail(')]
with sync_playwright() as pw:
 for engine in [pw.chromium,pw.webkit]:
  browser=engine.launch();page=browser.new_page(viewport={'width':390,'height':844})
  page.set_content('<div id="tab-profile"><div id="next-meeting-card"></div><div id="zoom-btn-wrap"></div><button id="chat-btn"></button><div id="schedule-section"></div></div>')
  page.add_style_tag(content=(ROOT/'app/css/styles.css').read_text(encoding='utf-8')+(ROOT/'app/css/ux-program.css').read_text(encoding='utf-8'))
  page.evaluate("""window.Api={};window.programAccess={streams:[]};window.selectedProgramId='one';window.streamState=s=>s.phase;window.currentProgram=()=>programAccess.streams.find(s=>s.id===selectedProgramId);window.programNow=()=>Date.parse('2026-10-12');window.accessDate=d=>d;window.haptic=()=>{};window.hapticNotify=()=>{};window.activeTab='profile';window.Storage={isAttended:()=>false,toggleAttended:()=>true};window.refreshProgramAccess=async()=>{};window.renderProfileTab=()=>{};window.selectProgram=()=>{}""")
  page.add_script_tag(content=program)
  page.evaluate("""programAccess.streams=[{id:'one',name:'October',phase:'upcoming',canAttend:false,canReadRecordings:false,chatLink:'https://t.me/private_synthetic',zoomLink:'https://zoom.us/private',meetings:[{id:'m1',date:'2026-10-15',topic:'Телесная практика',description:'11:00–14:00 МСК'}]}];renderNextMeeting();renderZoomBtn();renderSchedule()""")
  assert page.locator('#zoom-btn-wrap a').count()==0
  assert page.locator('#owned-stream-select').count()==0
  assert 'Записи встреч' not in page.locator('#schedule-section').inner_text()
  assert page.locator('summary button').count()==0
  assert page.locator('.program-meeting-row > .meeting-attendance-control > button.meeting-attendance').count()==1
  assert page.locator('.meeting-attendance').bounding_box()['width']==44
  page.locator('summary').click()
  assert 'Подробная подготовка' in page.locator('.program-meeting-body').inner_text()
  assert 'Анастасия' in page.locator('.program-meeting-body').inner_text()
  page.evaluate("""programAccess.streams[0].canAttend=true;programAccess.streams[0].canReadRecordings=true;programAccess.streams[0].phase='current';programAccess.streams[0].meetings[0].description='Exact server description';programAccess.streams[0].meetings[0].prepare='Exact server preparation';renderZoomBtn();renderSchedule()""")
  assert page.locator('#zoom-btn-wrap a').count()==2
  assert page.locator('details').get_attribute('open') is not None
  assert 'Exact server preparation' in page.locator('.program-meeting-body').inner_text()
  assert 'Exact server description' in page.locator('.program-meeting-body').inner_text()
  page.evaluate("""programAccess.streams[0].chatLink=null;programAccess.streams[0].zoomLink=null;renderZoomBtn()""")
  assert page.locator('#zoom-btn-wrap a').count()==0
  assert 'ещё не добавлена' in page.locator('#zoom-btn-wrap').inner_text()
  browser.close()
print('Passed: Chromium/WebKit program gates, empty links, exact API content, accessible disclosure and side attendance')
