// 记账本 Service Worker：离线缓存
// 策略：
//   - HTML / JS 主文件：网络优先（保证更新能及时生效），断网时回退缓存
//   - 静态资源（图标等）：缓存优先
// 修改过代码就升级 CACHE_NAME 版本号，旧的会被自动清除。
var CACHE_NAME = "jizhangben-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.png",
  "./xlsx.full.min.js"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // 逐个添加，某个文件 404 也不影响整体安装
      return Promise.all(ASSETS.map(function(url){
        return cache.add(url).catch(function(){ /* 忽略单个失败 */ });
      }));
    }).then(function(){
      return self.skipWaiting();   // 立即接管，不等旧页面关闭
    })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k !== CACHE_NAME) return caches.delete(k);   // 清掉旧版本缓存
      }));
    }).then(function(){
      return self.clients.claim();   // 立即控制已打开的页面
    })
  );
});

// 需要「网络优先」的请求：页面与脚本
function isNetworkFirst(url, req){
  if(req.mode === "navigate") return true;                 // 直接打开页面
  if(/\/$|index\.html$/.test(url.pathname)) return true;   // 首页
  if(/\.(js|html|json|webmanifest)$/.test(url.pathname)) return true;
  return false;
}

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if(url.origin !== location.origin) return;

  // —— 网络优先 ——
  if(isNetworkFirst(url, e.request)){
    e.respondWith(
      fetch(e.request, {cache: "no-store"}).then(function(resp){
        if(resp && resp.status === 200){
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function(){
        // 网络失败（离线）→ 用缓存
        return caches.match(e.request).then(function(cached){
          return cached || caches.match("./index.html");
        });
      })
    );
    return;
  }

  // —— 缓存优先（图标等静态资源）——
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(resp){
        if(resp && resp.status === 200){
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function(){
        return caches.match("./index.html");
      });
    })
  );
});

// 允许页面主动要求更新
self.addEventListener("message", function(e){
  if(e.data === "SKIP_WAITING") self.skipWaiting();
});
