#!/usr/bin/env python3
path = '/etc/nginx/sites-available/resona'
with open(path) as f:
    c = f.read()
if 'location = /config/public' in c:
    print('already')
else:
    with open('/tmp/nginx-snippet.conf') as f:
        s = f.read()
    marker = '    location /api/ {'
    c = c.replace(marker, s + marker, 1)
    with open(path, 'w') as f:
        f.write(c)
    print('inserted')
