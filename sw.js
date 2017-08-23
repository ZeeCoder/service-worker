const cacheKeys = {
    app: 'AppCache',
    fetch: 'FetchCache',
};

function addToCache(cacheKey, request, response) {
    // Allow 'opaque' requests to be stored with a non-ok status.
    if (response.type === 'basic' && !response.ok) {
        return response;
    }

    const responseClone = response.clone();

    return caches.match(request).then(matchedResponse => {
        // Serve back the response if it was stored already
        if (matchedResponse) {
            return matchedResponse;
        }

        return caches
            .open(cacheKey)
            .then(cache => cache.put(request, responseClone))
            .catch(e => {
                console.log(request.url, 'Cache put failed: ', String(e));
            })
            .then(() => response);
    });
}

function fetchFromCache(request) {
    return caches.match(request).then(response => {
        if (!response) {
            // A synchronous error that will kick off the catch handler
            throw Error('"' + request.url + '" not found in cache');
        }

        return response;
    });
}

/**
 * Resolves with true if deletion was successful, or if the cache didn't exist
 * to begin with and false otherwise.
 *
 * @param {string} cacheKey
 * @return {Promise.<boolean>}
 */
function deleteCache(cacheKey) {
    return caches.has(cacheKey).then(hasCache => {
        if (!hasCache) {
            return true;
        }

        return caches.delete(cacheKey);
    });
}

function clearAllCache() {
    const deletionPromises = Object.values(cacheKeys).map(deleteCache);

    return Promise.all(deletionPromises);
}

function handleStoreInAppCacheEvent(event) {
    const message = event.data;

    return caches.has(cacheKeys.app).then(hasCache => {
        if (hasCache) {
            return 'Caching was already done previously.';
        }

        return caches
            .open(cacheKeys.app)
            .then(cache => cache.addAll(message.assetUrlsToCache));
    });
}

function respondToEvent(event, response) {
    response = typeof response !== 'undefined' ? response : true;

    if (!Array.isArray(event.ports)) {
        return;
    }

    event.ports.forEach(port => port.postMessage(response));
}

function respondToEventWithPromise(event, promise) {
    return promise
        .then(response => respondToEvent(event, response))
        .catch(e => respondToEvent(event, { error: String(e) }));
}

function handleHasAppCacheEvent() {
    return caches.has(cacheKeys.app);
}

self.addEventListener('message', event => {
    const message = event.data;

    if (message.type === 'StoreInAppCache') {
        respondToEventWithPromise(event, handleStoreInAppCacheEvent(event));
    } else if (message.type === 'HasAppCache') {
        respondToEventWithPromise(event, handleHasAppCacheEvent(event));
    } else if (message.type === 'TheQuestion') {
        respondToEvent(event, 42);
    } else if (message.type === 'ClearAllCache') {
        respondToEventWithPromise(event, clearAllCache());
    }
});

function isFromMyOrigin(request) {
    return new URL(request.url).origin === self.location.origin;
}

function shouldHandleFetch(event) {
    const request = event.request;
    const url = new URL(request.url);
    const criteria = {
        isGETRequest: request.method === 'GET',
        // isFromMyOrigin: url.origin === self.location.origin,
    };

    // Create a new array with just the keys from criteria that have
    // failing (i.e. false) values.
    const failingCriteria = Object.keys(criteria).filter(
        criteriaKey => !criteria[criteriaKey]
    );

    // If that failing array has any length, one or more tests failed.
    return !failingCriteria.length;
}

self.addEventListener('fetch', function(event) {
    if (!shouldHandleFetch(event)) {
        console.log(
            'Letting the following request to be handled by browser:',
            event
        );
        return;
    }

    const request = event.request;
    const acceptHeader = request.headers.get('Accept');
    let resourceType = 'static';
    if (acceptHeader.indexOf('text/html') !== -1) {
        resourceType = 'content';
    } else if (acceptHeader.indexOf('image') !== -1) {
        resourceType = 'image';
    }

    console.log(request.url, 'Fetch intercepted.');

    // Use a cache-first strategy.
    event.respondWith(
        fetchFromCache(request)
            .then(response => {
                console.log(
                    request.url,
                    'Cache HIT, serving request from cache.'
                );

                return response;
            })
            .catch(() => {
                const isMyOrigin = isFromMyOrigin(request);

                console.log(
                    request.url,
                    'Cache MISS, fetching request from network.',
                    'isMyOrigin: ',isMyOrigin
                );

                // Couldn't find in cache, see if we could grab it through the network
                if (!navigator.onLine) {
                    throw new Error(
                        request.url + ' Offline, cannot run fetch.'
                    );
                }

                const fetchOpts = {};

                if (!isMyOrigin) {
                    // We can cache cross-origin resources, but only with no-cors
                    // enabled.
                    // @see https://stackoverflow.com/questions/35626269/how-to-use-service-worker-to-cache-cross-domain-resources-if-the-response-is-404
                    // @see https://jakearchibald.com/2015/thats-so-fetch/#no-cors-and-opaque-responses
                    fetchOpts.mode = 'no-cors';
                }

                return fetch(request, fetchOpts);
            })
            .then(response => addToCache(cacheKeys.fetch, request, response))
            .then(response => {
                console.log(request.url, 'Request added to cache.');

                return response;
            })
            .catch(e => {
                console.error(
                    request.url +
                        ' (' +
                        resourceType +
                        ')' +
                        ' Resource could not be retrieved neither from cache nor through the network. ' +
                        ' Error: ' +
                        String(e)
                );
            })
    );

    // More sophisticated caching strategies:
    // // 1. Determine what kind of asset this is… (above).
    // if (resourceType === 'content') {
    //   // Use a network-first strategy.
    //   console.log('Network-first strategy for "' + request.url  + '"');
    //   event.respondWith(
    //     Promise.resolve()
    //       .then(() => {
    //         if (!navigator.onLine) {
    //           throw new Error('Offline, Cannot fetch "' + request.url + '".');
    //         }
    //
    //         return fetch(request);
    //       })
    //       .then(response => addToCache(cacheKeys.fetch, request, response))
    //       .catch(() => fetchFromCache(request))
    //       .catch(e => {
    //         console.error('Unexpected error', resourceType, e);
    //       })
    //   );
    // } else {
    //   // Use a cache-first strategy.
    //   console.log('Cache-first strategy for "' + request.url  + '"');
    //   event.respondWith(
    //     fetchFromCache(request)
    //       .catch(() => {
    //         if (!navigator.onLine) {
    //           throw new Error('Offline, Cannot fetch "' + request.url + '".');
    //         }
    //
    //         return fetch(request);
    //       })
    //       .then(response => addToCache(cacheKeys.fetch, request, response))
    //       .catch(e => {
    //         console.error('Unexpected error', resourceType, e);
    //       })
    //   );
    // }
});

self.addEventListener('install', function(event) {
    // Skip the 'waiting' lifecycle phase, to go directly from 'installed' to 'activated', even if
    // there are still previous incarnations of this service worker registration active.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
    // Claim any clients immediately, so that the page will be under SW control without reloading.
    event.waitUntil(self.clients.claim());
});
