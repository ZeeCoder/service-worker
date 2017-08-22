let cacheVersion = 0;
let cacheKeyPrefix = 'app-cache-v';
let cacheKey = '';
let resolveCacheSetup = () => {};
let cacheSetupDone = new Promise(resolve => {
  resolveCacheSetup = () => {
    // console.log('CACHE SETUP DONE');
    resolve();
  };
});

cacheSetupDone.then(() => {
  console.log('Cache setup done, allowing fetches to pass.');
});

console.log('IM IN');

function addToCache (cacheKey, request, response) {
  if (!response.ok) {
    return response;
  }

  const responseClone = response.clone();
  caches.open(cacheKey).then(cache => {
    cache.put(request, responseClone);
  });

  return response;
}

function fetchFromCache (event) {
  return caches.match(event.request).then(response => {
    if (!response) {
      // A synchronous error that will kick off the catch handler
      throw Error('"' + event.request.url + '" not found in cache');
    }
    return response;
  });
}

function deletePreviousCaches () {
  return caches.keys().then(cacheKeys => {
    function isAppCache (cacheKey) {
      return cacheKey.indexOf(cacheKeyPrefix) === 0;
    }

    const previousAppCacheKeys = cacheKeys.filter(isAppCache);

    const deletePromises = previousAppCacheKeys.map(caches.delete);

    return Promise.all(deletePromises);
  });
}

function handleCacheUpdate(message) {
  console.log('Handling CACHE message', message);

  cacheVersion = message.cacheVersion;
  localCacheKey = cacheKeyPrefix + cacheVersion;

  return caches.has(localCacheKey).then(cached => {
    if (cached) {
      console.log('Cache "' + localCacheKey + '" already stored.');
      // Already cached, nothing to do here
      return;
    }

    return deletePreviousCaches().then(() => {
      caches
        .open(localCacheKey)
        .then(function(cache) {
          return cache.addAll(message.assetUrlsToCache);
        })
        .then(() => {
          console.log('New cache "' + localCacheKey + '" stored.');
        });
    });
  }).then(() => setTimeout(() => {
    cacheKey = localCacheKey;
  }, 2000));

}

self.addEventListener('message', event => {
  const message= event.data;

  if (message.type === 'CACHE') {
    handleCacheUpdate(message).then(() => {
      console.log('Handle cache update done');
      resolveCacheSetup();
    });
  }
});

function shouldHandleFetch (event) {
  const request            = event.request;
  const url                = new URL(request.url);
  const criteria           = {
    isGETRequest      : request.method === 'GET',
    isFromMyOrigin    : url.origin === self.location.origin
  };

  // Create a new array with just the keys from criteria that have
  // failing (i.e. false) values.
  const failingCriteria = Object.keys(criteria).filter(criteriaKey => !criteria[criteriaKey]);

  // If that failing array has any length, one or more tests failed.
  return !failingCriteria.length;
}

self.addEventListener('fetch', function(event) {
  if (!shouldHandleFetch(event)) {
    console.log('fetch ignored', event);
    return;
  }

  if (!cacheKey) {
    console.log('Cache key is not ready, ignoring fetch.', event);
    return;
  } else {
    console.log('Cache Key available: ', cacheKey);
  }

  console.log('Fetch event caught', event);

  const request      = event.request;
  const acceptHeader = request.headers.get('Accept');
  let resourceType = 'static';

  if (acceptHeader.indexOf('text/html') !== -1) {
    resourceType = 'content';
  } else if (acceptHeader.indexOf('image') !== -1) {
    resourceType = 'image';
  }

  // 1. Determine what kind of asset this is… (above).
  if (resourceType === 'content') {
    // Use a network-first strategy.
    console.log('Network-first strategy for "' + request.url  + '"');
    event.respondWith(
      cacheSetupDone
        .then(() => console.log('fetch call passed for "' + request.url  + '"'))
        .then(() => {
          if (!navigator.onLine) {
            throw new Error('Offline, Cannot fetch "' + request.url + '".');
          }

          return fetch(request);
        })
        .then(response => addToCache(cacheKey, request, response))
        .catch(() => fetchFromCache(event))
        .catch(e => {
          console.error('Unexpected error', resourceType, e);
        })
    );
  } else {
    // Use a cache-first strategy.
    console.log('Cache-first strategy for "' + request.url  + '"');
    event.respondWith(
      cacheSetupDone
        .then(() => console.log('fetch call passed for for "' + request.url  + '"'))
        .then(() => fetchFromCache(event))
        .catch(() => {
          if (!navigator.onLine) {
            throw new Error('Offline, Cannot fetch "' + request.url + '".');
          }

          return fetch(request);
        })
        .then(response => addToCache(cacheKey, request, response))
        .catch(e => {
          console.error('Unexpected error', resourceType, e);
        })
    );
  }
});


self.addEventListener('install', function(event) {
  console.log('install');
  // Perform install steps
  event.waitUntil(
    new Promise(resolve => {
      setTimeout(() => {
        console.log('INSTALLED');
        resolve();
      }, 3000);
    })
    // caches.open(CACHE_NAME)
    //   .then(function(cache) {
    //     return cache.addAll(urlsToCache);
    //   })
  );
});

self.addEventListener('activate', function(event) {
  console.log('activate');
  // // Perform install steps
  // event.waitUntil(
  //   caches.open(CACHE_NAME)
  //     .then(function(cache) {
  //       return cache.addAll(urlsToCache);
  //     })
  // );
});
