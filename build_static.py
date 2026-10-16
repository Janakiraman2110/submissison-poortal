"""
Builds a static copy of the app into docs/ for GitHub Pages.

Pages are rendered through Flask's test client, links are rewritten to relative
.html files, and static/js/static-api.js emulates the /api/* endpoints in the browser
using the seed data embedded in seed-data.js.

Usage:  python build_static.py
"""
import json
import os
import re
import shutil
from datetime import datetime

from app import app, load_accounts, load_requests, STORAGE_DIR, BASE_DIR

OUT_DIR = os.path.join(BASE_DIR, 'docs')

PAGES = {
    '/': 'index.html',
    '/request': 'request.html',
    '/exceptions': 'exceptions.html',
    '/tracker': 'tracker.html',
    '/blob-storage': 'blob-storage.html',
}

ROUTE_LINKS = {
    '/': 'index.html',
    '/dashboard': 'index.html',
    '/request': 'request.html',
    '/new-request': 'request.html',
    '/exceptions': 'exceptions.html',
    '/tracker': 'tracker.html',
    '/blob-storage': 'blob-storage.html',
}

SHIM_TAGS = (
    '<script src="static/js/seed-data.js"></script>\n'
    '<script src="static/js/static-api.js"></script>\n'
)


def rewrite_html(html):
    html = html.replace('"/static/', '"static/')
    html = re.sub(
        r'href="(/[a-z\-]*)"',
        lambda m: f'href="{ROUTE_LINKS.get(m.group(1), m.group(1))}"',
        html,
    )
    return html.replace('<script src="static/js/main.js">', SHIM_TAGS + '<script src="static/js/main.js">', 1)


def build_seed():
    files = {}
    for name in sorted(os.listdir(STORAGE_DIR)):
        path = os.path.join(STORAGE_DIR, name)
        if os.path.isfile(path):
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                files[name] = {
                    'content': f.read(),
                    'modified': datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d %H:%M:%S'),
                }
    seed = {'accounts': load_accounts(), 'requests': load_requests(), 'files': files}
    return 'window.__SEED__ = ' + json.dumps(seed, indent=1) + ';\n'


def main():
    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    shutil.copytree(os.path.join(BASE_DIR, 'static'), os.path.join(OUT_DIR, 'static'))

    main_js = os.path.join(OUT_DIR, 'static', 'js', 'main.js')
    with open(main_js, 'r', encoding='utf-8') as f:
        js = f.read()
    with open(main_js, 'w', encoding='utf-8', newline='') as f:
        f.write(js.replace("window.location.href = '/request';", "window.location.href = 'request.html';"))

    with open(os.path.join(OUT_DIR, 'static', 'js', 'seed-data.js'), 'w', encoding='utf-8', newline='') as f:
        f.write(build_seed())

    client = app.test_client()
    for route, filename in PAGES.items():
        res = client.get(route)
        if res.status_code != 200:
            raise SystemExit(f'{route} returned {res.status_code}')
        with open(os.path.join(OUT_DIR, filename), 'w', encoding='utf-8', newline='') as f:
            f.write(rewrite_html(res.get_data(as_text=True)))
        print(f'  {route:<14} -> docs/{filename}')

    # Stop GitHub Pages from running the site through Jekyll
    open(os.path.join(OUT_DIR, '.nojekyll'), 'w').close()
    print('Static site written to docs/')


if __name__ == '__main__':
    main()
