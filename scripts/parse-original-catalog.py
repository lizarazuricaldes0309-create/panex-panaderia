from pathlib import Path
import re

source = Path('/home/ubuntu/upload/panexpanad-663cvu9e.manus.space__1e267da9-88b5-4f4a-9b60-6fa8e77521d0.md').read_text()
lines = source.splitlines()
products = []
for i, line in enumerate(lines):
    m = re.match(r'^### (.+)$', line.strip())
    if not m:
        continue
    name = m.group(1).strip()
    category = next((c for c in ('Panes', 'Bollería', 'Pastelería', 'Combos') if c in lines[i - 2].strip()), None)
    if not category or i + 4 >= len(lines):
        continue
    price_match = re.match(r'^Bs (\d+)$', lines[i + 2].strip())
    if not price_match:
        continue
    description = lines[i + 4].strip()
    if not description or description == 'Reseñas Añadir':
        continue
    products.append((name, category, int(price_match.group(1)), description))

# Keep first occurrence of each slug/name while preserving original order.
seen = set()
unique = []
for item in products:
    slug = re.sub(r'[^a-z0-9]+', '-', item[0].lower().encode('ascii', 'ignore').decode()).strip('-')
    if slug in seen:
        continue
    seen.add(slug)
    unique.append((slug, *item))

images = {
    'Panes': '/manus-storage/panex-bread-sourdough.jpg',
    'Bollería': '/manus-storage/panex-pastry-croissant.jpg',
    'Pastelería': '/manus-storage/panex-cake-fruit.jpg',
    'Combos': '/manus-storage/panex-combo-box.jpg',
}
category_slugs = {'Panes': 'panes', 'Bollería': 'bolleria', 'Pastelería': 'pasteleria', 'Combos': 'combos'}

def sql(value):
    return "'" + value.replace("'", "''") + "'"

out = [
    '-- Catálogo recuperado de la versión original de Panex.',
    '-- Idempotente: puede ejecutarse más de una vez sin duplicar productos.',
    'begin;',
]
for slug, name, category, price, description in unique:
    out.append(
        'insert into public.products (id, name, slug, description, category_id, price, unit, image_url, is_featured, is_active) '
        f"select gen_random_uuid(), {sql(name)}, {sql(slug)}, {sql(description)}, c.id, {price}, 'pieza', {sql(images[category])}, false, true "
        f"from public.categories c where c.slug = {sql(category_slugs[category])} "
        f"on conflict (slug) do update set name=excluded.name, description=excluded.description, category_id=excluded.category_id, price=excluded.price, image_url=excluded.image_url, is_active=true;"
    )
out += ['commit;', f'-- Productos recuperados: {len(unique)}']
Path('/home/ubuntu/work-panex/panex-panaderia/supabase/migrations/20260919_panex_catalog_original.sql').write_text('\n'.join(out) + '\n')
print(f'products={len(unique)}')
for p in unique[:5]:
    print(p)
print('last=', unique[-1] if unique else None)
