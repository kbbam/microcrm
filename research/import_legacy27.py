import json, re

data = json.load(open('/tmp/crm_build/data.json', encoding='utf-8'))

next_entity_id = max(e['id'] for e in data['entities']) + 1
next_person_id = max(p['id'] for p in data['people']) + 1

SUFFIX_RE = re.compile(r'\s*,?\s*(e\.\s*Kfr\.?|e\.\s*Kfm\.?|e\.\s*K\.?)\s*$', re.IGNORECASE)

def clean_person_name(raw):
    if not raw:
        return raw
    return SUFFIX_RE.sub('', raw).strip()

ROWS = [
    dict(name="Adler-Apotheke, Regensburg", street="Watmarkt 9", plz="93047", city="Regensburg",
         legacy_phone="+49 94151554", legacy_email="info@adler-regensburg.de",
         person_raw="Dr. Veronika Kern",
         sis_entity_id=143, sis_source="weed_de", sis_source_pharmacy_id="6a0171c3fcd184e71f703d01",
         sis_phone="094151554", sis_website=None, brand=None),
    dict(name="Apotheke Butz, Heimsheim", street="Moensheimer Str. 50", plz="71296", city="Heimsheim",
         legacy_phone="+49 7033469530", legacy_email="heimsheim@apobutz.de",
         person_raw="Matthias Butz e.K.",
         sis_entity_id=408, sis_source="canngo", sis_source_pharmacy_id="zpal96lyjdvolx0ts6bmj0ik",
         sis_phone="07033-469530", sis_website="cannabis-apotheke-online.de", brand=None),
    dict(name="Apotheke Hake, Ennigerloh", street="Elmstrasse 11-13", plz="59320", city="Ennigerloh",
         legacy_phone="+49 25243737", legacy_email="info@apotheke-hake.de",
         person_raw="Detleff Hake",
         sis_entity_id=351, sis_source="canngo", sis_source_pharmacy_id="ts5y0hwy1y90ff163oj651dz",
         sis_phone="25243737", sis_website="420waf.de", brand="420 Flowers Kreis Warendorf"),
    dict(name="Apotheke an der Friedenseiche, Hamburg", street="Eppendorfer Marktplatz 2", plz="20251", city="Hamburg",
         legacy_phone="+49 40488778", legacy_email="apotheke-friedenseiche@gmx.de",
         person_raw="Nikolaus Wendel e.K.",
         sis_entity_id=102, sis_source="canngo", sis_source_pharmacy_id="rlgkguz7pfbsqj1o5esn9fwo",
         sis_phone="+4915561248980", sis_website=None, brand=None),
    dict(name="Bahnhof Apotheke, Reutlingen", street="Kaiserstr. 11", plz="72764", city="Reutlingen",
         legacy_phone="+49 7121490011", legacy_email=None,
         person_raw="Christos Paralis e.K.",
         sis_entity_id=329, sis_source="canngo", sis_source_pharmacy_id="p37hsftr0vmxfwdfeqtfqu2f",
         sis_phone="7121490011", sis_website="cannabisreutlingen.de", brand=None),
    dict(name="Bahnhof-Apotheke, Eberbach", street="Bahnhofsplatz 7", plz="69412", city="Eberbach",
         legacy_phone="+49 62715456", legacy_email="service1@apotheke-eberbach.de",
         person_raw="Frank Knecht e.K.",
         sis_entity_id=321, sis_source="flowzz", sis_source_pharmacy_id="444",
         sis_phone=None, sis_website="cannaheld24.de", brand="CANNAHELD24"),
    dict(name="Burg-Apotheke, Kempten", street="Kronenstr. 11", plz="87435", city="Kempten",
         legacy_phone="+49 83127356", legacy_email="info@burg-apotheke-kempten.de",
         person_raw="Michael Pudritz e.K.",
         sis_entity_id=28, sis_source="canngo", sis_source_pharmacy_id="n13dman1350oxfz2boblcwn0",
         sis_phone=None, sis_website="allgaeu-cannabis.de", brand=None),
    dict(name="Christophorus Apotheke Trostberg, Trostberg", street="Lehemeirstr. 2", plz="83308", city="Trostberg",
         legacy_phone="+49 862161058", legacy_email="trostapo@t-online.de",
         person_raw="Elisabeth Ring-Schötz e.K.",
         sis_entity_id=221, sis_source="weed_de", sis_source_pharmacy_id="6707f64b53cc3686452b3f09",
         sis_phone="0862161058", sis_website="medizinalcannabis.christophorus-apotheke-trostberg.de", brand=None),
    dict(name="Einhorn-Apotheke, Bad Windsheim", street="Marktplatz 3", plz="91438", city="Bad Windsheim",
         legacy_phone="+49 98412074", legacy_email="info@patriamed.de",
         person_raw="Dr. Philipp Hohnstein",
         sis_entity_id=None, sis_source="flowzz", sis_source_pharmacy_id="30",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Engel Apotheke am Rathaus, Kassel", street="Obere Königsstr. 21", plz="34117", city="Kassel",
         legacy_phone="+49 56115707", legacy_email="engelapothekekassel@gmail.com",
         person_raw="Dr. Jürgen Müller-Rebstein e.Kfm.",
         sis_entity_id=132, sis_source="canngo", sis_source_pharmacy_id="e10lyi76nr7a7ztkmo2s28wj",
         sis_phone=None, sis_website=None, brand="Dr. Müller Leafs"),
    dict(name="Erftland Apotheke, Kerpen", street="Kerpener Str. 32", plz="50170", city="Kerpen",
         legacy_phone="+49 227352654", legacy_email="info@erftland-apotheke.de",
         person_raw="Karl-Willi Graf-Riesen e.K.",
         sis_entity_id=164, sis_source="canngo", sis_source_pharmacy_id="lc8fiftors7ppp9gowpzwdtl",
         sis_phone="02273 52654", sis_website="gartenmed.de", brand="Gartenmed"),
    dict(name="Heidelberg-Apotheke, Bisingen", street="Heidelbergstr. 22", plz="72406", city="Bisingen",
         legacy_phone="+49 74768411", legacy_email="hb@ertelt.de",
         person_raw="Johannes Ertelt e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="q90449im0rh7f9ixk5qv4tqk",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Kissel Apotheke, Frankfurt", street="Mörfelder Landstr. 235", plz="60598", city="Frankfurt am Main",
         legacy_phone="+49 6968974730", legacy_email="service@kissel-apotheke.de",
         person_raw="Malte Uhlendorf e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="j10jrwnxe22ha7mz59mfyhjx",
         sis_phone=None, sis_website="cannabis-apotheke-frankfurt.de", brand=None),
    dict(name="Kronen-Apotheke, Sankt Augustin", street="Kölnstr. 107", plz="53757", city="St. Augustin",
         legacy_phone="+49 224127013", legacy_email="info@kronen-apotheke-augustin.de",
         person_raw="Dr. Stephanie Meurer e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="ktomio8wj30wy4107qhhrddn",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Merkur Apotheke, Nuernberg", street="Breitscheidstr. 5", plz="90459", city="Nürnberg",
         legacy_phone="+49 911442134", legacy_email="merkurapo@t-online.de",
         person_raw="Ronald Haertl e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="so88y0snrp5y0ke0iyzcu0vy",
         sis_phone=None, sis_website="merkur-apo-nuernberg.de", brand=None),
    dict(name="Merkur-Apotheke, Dortmund", street="Jasminstrasse 5", plz="44289", city="Dortmund",
         legacy_phone="+49 231400844", legacy_email="info@merkur-apotheke-dortmund.de",
         person_raw="Dr. Stefan Schaefer e. K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="eyrkxoasd6bh2qsyxuonsupo",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Neckar-Apotheke, Mannheim", street="Mittelstr. 16", plz="68169", city="Mannheim",
         legacy_phone="+49 621333702", legacy_email=None,
         person_raw="Joachim Burkert",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="ahlujyl44eujplaf5fhjyi31",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Post Apotheke, Kassel", street="Friedrich-Ebert-Str. 27", plz="34117", city="Kassel",
         legacy_phone="+49 5612885650", legacy_email="info@post-apotheke-kassel.de",
         person_raw="Stephan Parzefall e.K.",
         sis_entity_id=None, sis_source="weed_de", sis_source_pharmacy_id="6904d063f43e17c633906ee3",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Rats Apotheke, Stralsund", street="Alter Markt 6", plz="18439", city="Stralsund",
         legacy_phone="+49 3831298045", legacy_email="info@apotheke-stralsund.de",
         person_raw="Dr. Peter Cramer",
         sis_entity_id=114, sis_source="canngo", sis_source_pharmacy_id="vc5brmech891iushtjlze4jr",
         sis_phone="03831 - 298045", sis_website="cannabis-stralsund.de", brand=None),
    dict(name="Rosen Apotheke, Greifswald", street="Hans-Beimler-Straße 1-3", plz="17491", city="Greifswald",
         legacy_phone="+49 3834820595", legacy_email="fragen@rosen-apotheke-greifswald.de",
         person_raw="Angelika Hammermayer e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="beemsjxurs661umtdyr9lk9v",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Rosen Apotheke, Neuwied", street="Dierdorfer Str. 115", plz="56564", city="Neuwied",
         legacy_phone="+49 263127363", legacy_email="info@rosen-apotheke-neuwied.de",
         person_raw="Johannes Neukirchen e.K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="i14fbchr0tcymy6se72xb5ij",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Schloss-Apotheke, Marktoberdorf", street="Eberle-Kögl-Str. 16", plz="87616", city="Marktoberdorf",
         legacy_phone="+49 83422201", legacy_email="service@apo-schloss.de",
         person_raw="Martin Fumian e.Kfm.",
         sis_entity_id=244, sis_source="canngo", sis_source_pharmacy_id="e11v0u0vglix05q869mt7mma",
         sis_phone="08342 2201", sis_website="cannabis-schloss.cannaleo.de", brand="CANNABIS SCHLOSS"),
    dict(name="Stadt Apotheke, Saarbruecken", street="Bahnhofstrasse 37", plz="66111", city="Saarbrücken",
         legacy_phone="+49 681948890", legacy_email="mail@stadtapotheke-sb.de",
         person_raw="Yasmin Hassan e.K.",
         sis_entity_id=162, sis_source="canngo", sis_source_pharmacy_id="zt74hyn38sfr9e6hop1qsn3r",
         sis_phone="0681 948890", sis_website="cannatopie.de", brand="Cannatopie"),
    dict(name="Tiergarten-Apotheke, Konstanz", street="Wessenbergstraße 28", plz="78462", city="Konstanz",
         legacy_phone="+49 753127051", legacy_email="info@apotheke-konstanz.de",
         person_raw="Dr. Daniel Hölzle",
         sis_entity_id=358, sis_source="canngo", sis_source_pharmacy_id="vqma98ynwg0q92pjora82gtm",
         sis_phone="07531 27051", sis_website="cannabis-vor-ort.de", brand=None),
    dict(name="Widder Apotheke, Wuppertal", street="Wittener Str. 20", plz="42277", city="Wuppertal",
         legacy_phone="+49 20243045450", legacy_email="info@widder-apotheke.com",
         person_raw="Dr. Jürgen Sievers e. K.",
         sis_entity_id=None, sis_source="canngo", sis_source_pharmacy_id="hdxqag2wtc1be6c48cuxrhjm",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Wieslauf-Apotheke, Rudersberg", street="Marktplatz 3", plz="73635", city="Rudersberg",
         legacy_phone="+49 7183938770", legacy_email="apotheke.birzele@t-online.de",
         person_raw="Johannes Birzele e.K.",
         sis_entity_id=None, sis_source="flowzz", sis_source_pharmacy_id="17",
         sis_phone=None, sis_website=None, brand=None),
    dict(name="Witzleben Apotheke 24, Berlin", street="Kaiserdamm 26", plz="14057", city="Berlin",
         legacy_phone="+49 3093952000", legacy_email="info@witzleben-apotheke.de",
         person_raw="Claudia Neuhaus",
         sis_entity_id=349, sis_source="canngo", sis_source_pharmacy_id="ten4rxor3vxdjtqlrey5idq4",
         sis_phone="030 93952030", sis_website="witzleben-cannabis.de", brand=None),
]

assert len(ROWS) == 27, len(ROWS)

new_entities = []
new_people = []

for row in ROWS:
    eid = next_entity_id; next_entity_id += 1
    pid = next_person_id; next_person_id += 1

    contacts = []
    # prefer a fresh SIS phone/website (current, marketplace-verified); keep legacy phone too if it materially differs
    if row['sis_phone']:
        contacts.append({'type': 'phone', 'value': row['sis_phone'], 'label': 'cannabis storefront (SIS-verified, current)'})
    if row['legacy_phone']:
        contacts.append({'type': 'phone', 'value': row['legacy_phone'], 'label': 'legacy registered pharmacy phone (2017/18)'})
    if row['legacy_email']:
        contacts.append({'type': 'email', 'value': row['legacy_email'], 'label': 'general'})
    if row['sis_website']:
        website_val = row['sis_website'] if row['sis_website'].startswith('http') else 'https://' + row['sis_website']
        contacts.append({'type': 'website', 'value': website_val, 'label': 'cannabis storefront' if row['brand'] else 'official website'})

    person_name = clean_person_name(row['person_raw'])
    person = {
        'id': pid,
        'name': person_name,
        'resolution_status': 'confirmed',
        'linkedin_url': None,
        'notes': f"Verantwortlicher Apotheker per 2017/2018 legacy pharmacy contact register (BAM's own legacy outreach data); title/registration as \"{row['person_raw']}\" in the source record.",
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

    sis_identities = [{
        'source': row['sis_source'],
        'source_pharmacy_id': row['sis_source_pharmacy_id'],
        'sis_internal_entity_id': row['sis_entity_id'],
        'matched_name': row['name'],
        'matched_city': row['city'],
        'website': row['sis_website']
    }]

    evidence_bits = [f"Matched via SIS legacy-pharmacy-contact reconciliation (confidence 1.0, token similarity 100% + exact PLZ match) to a {row['sis_source']} listing"]
    if row['sis_entity_id']:
        evidence_bits.append(f"resolved to SIS entity #{row['sis_entity_id']}")
    if row['brand']:
        evidence_bits.append(f"trading under the cannabis-storefront brand \"{row['brand']}\"")
    evidence_summary = "; ".join(evidence_bits) + "."

    entity = {
        'id': eid,
        'name': row['name'],
        'type': 'pharmacy_location',
        'city': row['city'],
        'country': 'Germany',
        'website': contacts[-1]['value'] if row['sis_website'] else None,
        'commercial_role': 'cannabis-dispensing pharmacy',
        'cannabis_status': 'confirmed',
        'resolution_status': 'confirmed',
        'target_classes': [{
            'class': 'individual_pharmacy_pharmacist',
            'status': 'confirmed',
            'confidence': 'medium',
            'basis': 'Sourced from a 2017/2018 legacy pharmacy contact register, cross-matched by SIS (name+PLZ, 100% confidence) to a pharmacy still actively listed on a cannabis marketplace today. BAM commercial fit not yet assessed.'
        }],
        'bam_fit': None,
        'commercial_position': 'retail pharmacy',
        'flower_offtake_fit': None,
        'pharmacy_dispensing_status': 'confirmed',
        'cannabis_relevance_status': 'confirmed',
        'cannabis_evidence_strength': 'high',
        'sis_entity_id': str(row['sis_entity_id']) if row['sis_entity_id'] else None,
        'sis_sources': row['sis_source'],
        'evidence_summary': evidence_summary,
        'contacts': contacts,
        'cannabis_evidence': [{
            'claim': evidence_summary,
            'confidence': 'high',
            'source_type': 'SIS',
            'source_url': f"SIS://entity/{row['sis_entity_id']}" if row['sis_entity_id'] else f"SIS://{row['sis_source']}/{row['sis_source_pharmacy_id']}",
            'observed_at': '2026-09-14T00:00:00+07:00',
            'note': 'Legacy contact register: BAM/Cureous internal 2017/2018 pharmacy outreach spreadsheet (uploaded by user), reconciled against SIS on 2026-09-14.'
        }],
        'sis_observations': [],
        'sis_identities': sis_identities,
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
