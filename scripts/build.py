"""Build only this repository's reviewed public content. No third-party dependencies."""
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
(OUT / 'data').mkdir(exist_ok=True)
for name in ('index.html', 'styles.css', 'app.js'):
    shutil.copyfile(ROOT / 'web' / name, OUT / name)
notes = []
for path in sorted((ROOT / 'knowledge/notes').glob('*.md')):
    raw = path.read_text(encoding='utf-8')
    _, header, body = raw.split('---', 2)
    metadata = dict(line.split(':', 1) for line in header.strip().splitlines() if ':' in line)
    metadata = {key.strip(): value.strip() for key, value in metadata.items()}
    tags = [tag.strip() for field in ('技能', '主题') for tag in metadata.get(field, '').split(',') if tag.strip()]
    notes.append(dict(path=path.relative_to(ROOT).as_posix(), title=metadata.get('标题', path.stem), category='技术笔记', tags=list(dict.fromkeys(tags)), body=body.strip(), updated=path.stat().st_mtime))
(OUT / 'data/notes.json').write_text(json.dumps(notes, ensure_ascii=False), encoding='utf-8')
(OUT / '.nojekyll').touch()
print(f'Built {len(notes)} public notes into dist/')
