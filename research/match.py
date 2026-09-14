import json, re
from rapidfuzz import fuzz

data = json.load(open('/tmp/crm_build/data.json', encoding='utf-8'))
legacy = json.load(open('/tmp/crm_build/legacy/merged_data.json', encoding='utf-8'))

SUFFIXES = [
    'e.k.', 'e.kfr.', 'ekfr', 'ek', 'gmbh & co. kg', 'gmbh', 'ohg', 'kg',
    'inh.', 'inhaber', 'apotheker', 'apothekerin', 'e. kfr.', 'e.v.'
]

def norm(s):
    if not s:
        return ''
    s = s.lower()
    s = s.replace('ß', 'ss').replace('ä','ae').replace('ö','oe').replace('ü','ue')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def split_name_city(full):
    # legacy "Organization - Name" often "Apotheke X, City" or "Apotheke X, Somebody OHG, City"
    parts = [p.strip() for p in full.split(',')]
    return parts

pharmacy_entities = [e for e in data['entities'] if e['type']=='pharmacy_location']
print('pharmacy_location entities:', len(pharmacy_entities))

# Build legacy search list with normalized name+city
legacy_norm = []
for i, row in enumerate(legacy):
    name = row.get('Organization - Name') or ''
    city = row.get('Organization -\nOrt') or ''
    legacy_norm.append({
        'idx': i,
        'raw_name': name,
        'city': city,
        'norm_name': norm(name),
        'norm_city': norm(city),
    })

results = []
for e in pharmacy_entities:
    ename = e['name']
    ecity = e.get('city') or ''
    en = norm(ename)
    ecn = norm(ecity)
    best = None
    best_score = 0
    for lr in legacy_norm:
        score = fuzz.token_set_ratio(en, lr['norm_name'])
        if ecn and lr['norm_city']:
            city_bonus = 15 if ecn in lr['norm_city'] or lr['norm_city'] in ecn else 0
        else:
            city_bonus = 0
        total = score + city_bonus
        if total > best_score:
            best_score = total
            best = lr
    results.append({
        'entity_id': e['id'],
        'entity_name': ename,
        'entity_city': ecity,
        'best_legacy_idx': best['idx'] if best else None,
        'best_legacy_name': best['raw_name'] if best else None,
        'best_legacy_city': best['city'] if best else None,
        'score': best_score,
    })

results.sort(key=lambda r: -r['score'])
for r in results:
    print(f"{r['score']:.0f}  [{r['entity_id']}] {r['entity_name']!r} ({r['entity_city']})  <->  {r['best_legacy_name']!r} ({r['best_legacy_city']})")

json.dump(results, open('/tmp/crm_build/legacy/match_results.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
