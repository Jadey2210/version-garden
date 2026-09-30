const CACHE='version-garden-v3';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./index.html','./manifest.json','./icon.svg','./config.js','./auth.js']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&new URL(event.request.url).origin===location.origin)event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request).then(result=>{const copy=result.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return result}).catch(()=>caches.match('./index.html'))))});

