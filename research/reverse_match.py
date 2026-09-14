import json, re

data = json.load(open('/tmp/crm_build/data.json', encoding='utf-8'))
legacy = json.load(open('/tmp/crm_build/legacy/merged_data.json', encoding='utf-8'))

SUFFIX_RE = re.compile(r'\s*,?\s*(e\.\s*Kfr\.?|e\.\s*Kfm\.?|e\.\s*K\.?|GmbH|OHG|KG)\s*$', re.IGNORECASE)
TITLE_RE = re.compile(r'^(Dr\.|Prof\.|Dipl\.-?[A-Za-z]*\.?)\s*', re.IGNORECASE)

def norm(name):
    if not name:
        return ''
    n = SUFFIX_RE.sub('', name).strip()
    n = TITLE_RE.sub('', n).strip()
    n = n.lower()
    n = n.replace('ß','ss').replace('ä','ae').replace('ö','oe').replace('ü','ue')
    n = re.sub(r'[^a-z\s\-]', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n

# exclude the 27 we just imported (ids 240-266) since they came from this same source
imported_ids = set(range(240, 267))

legacy_by_norm = {}
for r in legacy:
    pn = r.get('Person - Name')
    if not pn:
        continue
    key = norm(pn)
    if not key or len(key.split()) < 2:
        continue  # skip too-generic single-word names
    legacy_by_norm.setdefault(key, []).append(r)

hits = []
for p in data['people']:
    if p['id'] in imported_ids:
        continue
    key = norm(p['name'])
    if not key or len(key.split()) < 2:
        continue
    if key in legacy_by_norm:
        hits.append((p, legacy_by_norm[key]))

print(f"People checked: {len(data['people']) - len(imported_ids)}")
print(f"Exact-name reverse matches found: {len(hits)}")
for p, rows in hits:
    print(f"\nPERSON [{p['id']}] {p['name']!r}  roles: {[r.get('org_name_text') for r in p.get('roles',[])]}")
    for r in rows:
        city = r.get('Organization -\nOrt')
        print(f"   LEGACY: {r['Organization - Name']!r} | phone={r.get('Organization - Phone')} | email={r.get('Organization - Email')} | city={city}")
