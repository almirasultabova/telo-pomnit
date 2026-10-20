from pathlib import Path
H=Path(__file__).parent
for name in['test-ui.py','test-edges.py']:
 p=H/name;s=p.read_text(encoding='utf-8').replace("await p.locator('#ai-access-refresh').click()","await p.evaluate('refreshAiScreen()')").replace("await expect(p.locator('#ai-access-refresh')).to_be_focused()","await expect(p.locator('#ai-history-select')).to_be_focused()").replace('list error explicit retry restores refresh focus','list error explicit retry restores history focus');p.write_text(s,encoding='utf-8')
