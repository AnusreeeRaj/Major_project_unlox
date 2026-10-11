from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
out=root/'unfazed-frontend/public/Unfazed_Project_Source.zip'
exclude={'node_modules','.git','.openai','.sites-runtime','dist','upload','__pycache__'}
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        rel=p.relative_to(root)
        if not p.is_file() or any(part in exclude for part in rel.parts): continue
        if p==out or p.name=='.env' or p.name.endswith('.log') or '.env.' in p.name and p.name!='.env.example': continue
        z.write(p,Path('unfazed')/rel)
print(out)
