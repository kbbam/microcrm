import json, re

data = json.load(open('/tmp/crm_build/data.json', encoding='utf-8'))

next_entity_id = max(e['id'] for e in data['entities']) + 1
next_person_id = max(p['id'] for p in data['people']) + 1

SUFFIX_RE = re.compile(r'\s*,?\s*(e\.\s*Kfr\.?|e\.\s*Kfm\.?|e\.\s*K\.?|GmbH|OHG|KG)\s*$', re.IGNORECASE)

def clean_person_name(raw):
    if not raw:
        return raw
    return SUFFIX_RE.sub('', raw).strip()

ROWS = [
    dict(
        name="Schloss-Apotheke, Kassel",
        street="Wilhelmshöher Allee 311", plz="34131", city="Kassel",
        legacy_person_raw="Stefan Nuerge e.K.",
        current_person_raw="Stefan Nürge",
        pharmacist_note="Heike Nürge",
        legacy_phone="+49 561 31 44 14",
        legacy_email="info@schloss-apotheke-kassel.de",
        current_phone="05 61/31 44 14",
        website="https://schloss-apotheke-kassel.de",
        cannabis_source_url="https://medcanonestop.com/cannabis-apotheke/schloss-apotheke-kassel/",
        cannabis_note=(
            "Independently listed on the third-party directory MedCanOneStop as a medical-cannabis "
            "dispensing pharmacy (pickup-only), with address and phone number matching the pharmacy's "
            "own current listing exactly. The pharmacy's own website does not itself advertise cannabis."
        ),
        ownership_change=None,
    ),
    dict(
        name="Neue Apotheke Seckenheim, Mannheim",
        street="Seckenheimer Hauptstr. 117", plz="68239", city="Mannheim",
        legacy_person_raw="Hannelore Weiland-Volz e. Kf.",
        current_person_raw="Oliver Petrig e.Kfm.",
        pharmacist_note="Margarete Meth (branch manager)",
        legacy_phone="+49 621 496 00 980",
        legacy_email="info@neue-apotheke-ma.de",
        current_phone="0621 49600980",
        website="https://neue-apotheke-mannheim.de",
        cannabis_source_url="https://mannheimsfinest.de/",
        cannabis_note=(
            "Ownership has changed since the legacy 2017/18 record (from Hannelore Weiland-Volz e.Kfr. "
            "to Oliver Petrig e.Kfm. / Petrig-Apotheken group). The group's own site links to "
            "\"Mannheims Finest\", an explicit licensed medical-cannabis pharmacy brand, which lists this "
            "location as one of its affiliated dispensing sites."
        ),
        ownership_change="Hannelore Weiland-Volz e.Kfr. (legacy, 2017/18) → Oliver Petrig e.Kfm. / Petrig-Apotheken group (current)",
    ),
]

new_entities = []
new_people = []

for row in ROWS:
    eid = next_entity_id; next_entity_id += 1
    pid = next_person_id; next_person_id += 1

    contacts = []
    if row['current_phone']:
        contacts.append({'type': 'phone', 'value': row['current_phone'], 'label': 'current pharmacy phone (web-verified)'})
    if row['legacy_phone'] and row['legacy_phone'] != row['current_phone']:
        contacts.append({'type': 'phone', 'value': row['legacy_phone'], 'label': 'legacy registered pharmacy phone (2017/18)'})
    if row['legacy_email']:
        contacts.append({'type': 'email', 'value': row['legacy_email'], 'label': 'general (legacy-listed, unverified current)'})
    if row['website']:
        contacts.append({'type': 'website', 'value': row['website'], 'label': 'official website'})

    person_name = clean_person_name(row['current_person_raw'])
    notes_bits = [
        f"Current registered pharmacist/owner per web verification: \"{row['current_person_raw']}\"."
    ]
    if row['ownership_change']:
        notes_bits.append(f"Ownership change since legacy 2017/18 register: {row['ownership_change']}.")
    if row['pharmacist_note']:
        notes_bits.append(f"Also associated on-site: {row['pharmacist_note']}.")
    notes_bits.append(
        f"Legacy 2017/18 pharmacy contact register listed the responsible party as \"{row['legacy_person_raw']}\"."
    )

    person = {
        'id': pid,
        'name': person_name,
        'resolution_status': 'confirmed',
        'linkedin_url': None,
        'notes': ' '.join(notes_bits),
        'roles': [{
            'entity_id': eid,
            'org_name_text': row['name'],
            'title': 'Apotheker/in (Inhaber/in)',
            'function': 'pharmacist / pharmacy owner',
            'role_status': 'current',
            'confidence': 'medium'
        }],
        'contacts': [],
        'event_presence': [],
        'observations': []
    }
    new_people.append(person)

    evidence_summary = (
        f"Web-verified as a current medical-cannabis dispensing pharmacy (source: {row['cannabis_source_url']}). "
        + row['cannabis_note']
    )

    entity = {
        'id': eid,
        'name': row['name'],
        'type': 'pharmacy_location',
        'city': row['city'],
        'country': 'Germany',
        'website': row['website'],
        'commercial_role': 'cannabis-dispensing pharmacy',
        'cannabis_status': 'confirmed',
        'resolution_status': 'confirmed',
        'target_classes': [{
            'class': 'individual_pharmacy_pharmacist',
            'status': 'confirmed',
            'confidence': 'medium',
            'basis': (
                'Sourced from a 2017/2018 legacy pharmacy contact register (not in SIS\'s tracked '
                'marketplaces); verified independently via general web research (not SIS) to be a '
                'current, active medical-cannabis dispensing pharmacy today. BAM commercial fit not yet assessed.'
            )
        }],
        'bam_fit': None,
        'commercial_position': 'retail pharmacy',
        'flower_offtake_fit': None,
        'pharmacy_dispensing_status': 'confirmed',
        'cannabis_relevance_status': 'confirmed',
        'cannabis_evidence_strength': 'medium',
        'sis_entity_id': None,
        'sis_sources': None,
        'evidence_summary': evidence_summary,
        'contacts': contacts,
        'cannabis_evidence': [{
            'claim': evidence_summary,
            'confidence': 'medium',
            'source_type': 'web',
            'source_url': row['cannabis_source_url'],
            'observed_at': '2026-09-14T00:00:00+07:00',
            'note': (
                'Legacy contact register: BAM/Cureous internal 2017/2018 pharmacy outreach spreadsheet '
                '(uploaded by user); NOT one of SIS\'s 27 SIS-confirmed matches — found via a general web '
                'verification pilot over the remaining unresolved legacy rows, per user request '
                '("by reverse lookup i meant not sis but the broader web").'
            )
        }],
        'sis_observations': [],
        'sis_identities': [],
        'relationships_out': [],
        'relationships_in': [],
        'attendance_evidence': [],
        'people': [{
            'person_id': pid,
            'title': 'Apotheker/in (Inhaber/in)',
            'function': 'pharmacist / pharmacy owner',
            'role_status': 'current',
            'confidence': 'medium',
            'org_name_text': row['name']
        }],
        'lead_tier': 'unscored'
    }
    new_entities.append(entity)

data['entities'].extend(new_entities)
data['people'].extend(new_people)

with open('/tmp/crm_build/data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Added entities:', len(new_entities), 'ids', new_entities[0]['id'], '-', new_entities[-1]['id'])
print('Added people:', len(new_people), 'ids', new_people[0]['id'], '-', new_people[-1]['id'])
print('Total entities now:', len(data['entities']), 'Total people now:', len(data['people']))
